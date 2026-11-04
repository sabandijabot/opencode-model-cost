// model-cost / tui — selector de modelos con precios visibles
//
// Comando /tcolas (alias /precios): abre el mismo tipo de diálogo que /model,
// pero cada opción muestra lo que cuesta por millón de tokens:
//   in $3 · out $15 · cache $0.30/$3.75 · ctx 200k
// Al elegir uno, cambia el modelo de la sesión abierta (POST /session/{id}/model).
// Widget en el footer: precio del modelo actualmente seleccionado.
//
// Los precios vienen del catálogo (models.dev vía OpenCode), campo `cost` de ModelInfo.

import { Plugin } from "@opencode/plugin/tui"

const GRIS = "#9ea0a6"

const money = (n: unknown): string => {
  const x = Number(n)
  if (!Number.isFinite(x)) return "-"
  if (x === 0) return "$0"
  if (x >= 100) return `$${x.toFixed(0)}`
  if (x >= 10) return `$${x.toFixed(1)}`
  return `$${x.toFixed(2)}`
}

const tokens = (n: number): string => {
  if (!Number.isFinite(n)) return "?"
  if (n >= 1_000_000) return `${Number.isInteger(n / 1_000_000) ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Number.isInteger(n / 1_000) ? n / 1_000 : (n / 1_000).toFixed(1)}k`
  return String(n)
}

type Cost = { tier?: { type: "context"; size: number }; input: number; output: number; cache: { read: number; write: number } }
type ModelInfo = {
  id: string
  modelID: string
  providerID: string
  name: string
  enabled: boolean
  cost: Cost[]
  limit: { context: number; output: number }
}

// cost[] puede traer varios tramos por tamaño de contexto; elegimos el que aplique
const pickCost = (m: ModelInfo): Cost | undefined => {
  if (!m.cost || m.cost.length === 0) return undefined
  const ordered = [...m.cost].sort((a, b) => (a.tier?.size ?? 0) - (b.tier?.size ?? 0))
  const fits = ordered.filter((c) => (c.tier?.size ?? 0) <= (m.limit?.context ?? Infinity))
  return fits.length > 0 ? fits[fits.length - 1] : ordered[0]
}

const priced = (m: ModelInfo): string => {
  const parts: string[] = []
  const c = pickCost(m)
  if (c) {
    if (c.input === 0 && c.output === 0 && c.cache.read === 0 && c.cache.write === 0) {
      parts.push("GRATIS")
    } else {
      parts.push(`in ${money(c.input)}`, `out ${money(c.output)}`, `cache ${money(c.cache.read)}/${money(c.cache.write)}`)
    }
  } else {
    parts.push("sin precios")
  }
  if (m.limit?.context) parts.push(`ctx ${tokens(m.limit.context)}`)
  return parts.join(" · ")
}

export default Plugin.define({
  id: "model-cost.tui",
  async setup(context: any) {
    // ---------- catálogo de modelos con precios ----------
    const location = context.location ?? context.data.location.default()
    const loadModels = async (): Promise<ModelInfo[]> => {
      await context.data.location.model.sync(location).catch(() => {})
      const list: ModelInfo[] = context.data.location.model.list(location) ?? []
      return list.filter((m) => m.enabled !== false)
    }

    // nombre bonito del provider para agrupar
    const providerName = (providerID: string, fallback: Map<string, string>): string =>
      fallback.get(providerID) ?? providerID

    // ---------- comando /tcolas ----------
    const openPicker = async () => {
      const models = await loadModels()
      if (models.length === 0) {
        context.ui.toast.show({ title: "Model cost", message: "No hay modelos disponibles en el catálogo", variant: "warning", duration: 4000 })
        return
      }

      await context.data.location.provider.sync(location).catch(() => {})
      const providers = new Map<string, string>(
        (context.data.location.provider.list(location) ?? []).map((p: any) => [p.id, p.name ?? p.id]),
      )

      const current = context.ui.model.current()
      const currentValue = current ? `${current.providerID}/${current.modelID}` : undefined

      const options = models.map((m) => {
        const key = `${m.providerID}/${m.id}`
        return {
          title: m.name || m.id,
          value: key,
          description: priced(m),
          category: providerName(m.providerID, providers),
        }
      })

      const chosen: string | undefined = await context.ui.dialog.select({
        title: "Cambiar modelo — in/out/cache read/write por Mtok",
        placeholder: "Buscar modelo...",
        current: currentValue,
        options,
      })
      if (!chosen) return // Esc: nada

      const [providerID, ...rest] = chosen.split("/")
      const id = rest.join("/")
      const target = models.find((m) => m.providerID === providerID && m.id === id)
      if (!target) return

      // hay sesión abierta? router actual
      const route = context.ui.router.current()
      const sessionID: string | undefined = route?.type === "session" ? route.sessionID : undefined

      if (!sessionID) {
        context.ui.toast.show({
          title: "Model cost",
          message: `Precios de ${target.name}: ${priced(target)}. Abre/enfoca una sesión para aplicarlo con /tcolas.`,
          variant: "info",
          duration: 5000,
        })
        return
      }

      // conservar la variante solo si es el mismo modelo de antes
      const keepVariant = current && current.providerID === providerID && current.modelID === id ? current.variant : undefined

      try {
        await context.client.session.switchModel({
          sessionID,
          model: { id, providerID, ...(keepVariant ? { variant: keepVariant } : {}) },
        })
        context.ui.toast.show({
          title: "Modelo cambiado",
          message: `${target.name} — ${priced(target)}`,
          variant: "success",
          duration: 4000,
        })
      } catch (e: any) {
        context.ui.toast.show({
          title: "Model cost",
          message: `No se pudo cambiar el modelo: ${e?.message ?? e}`,
          variant: "error",
          duration: 5000,
        })
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "modelcost.switch",
          title: "Cambiar modelo (con precios in/out/cache)",
          description: "Como /model, pero muestra cuánto cuesta cada modelo",
          group: "Model cost",
          palette: true,
          suggested: true,
          slash: { name: "tcolas", aliases: ["precios", "modelcost"] },
          enabled: () => true,
          run: () => void openPicker(),
        },
      ],
    }))

    // ---------- widget del footer: precio del modelo actual ----------
    const priceOf = (ref: { providerID: string; modelID: string } | undefined): string => {
      if (!ref) return ""
      const list = context.data.location.model.list(location) as ModelInfo[] | undefined
      const m = (list ?? []).find((x) => x.providerID === ref.providerID && x.id === ref.modelID)
      if (!m) return ""
      const c = pickCost(m)
      if (!c) return ""
      if (c.input === 0 && c.output === 0) return "GRATIS"
      return `⚡ ${money(c.input)} in / ${money(c.output)} out`
    }

    const widgets = [
      context.ui.slot({
        append: "home.footer.status",
        render: () => {
          const cur = context.ui.model.current()
          const label = priceOf(cur)
          return label ? (
            <text fg={GRIS}>{label}</text>
          ) : (
            <box />
          )
        },
      }),
      context.ui.slot({
        append: "prompt.footer.status",
        render: () => {
          const cur = context.ui.model.current()
          const label = priceOf(cur)
          return label ? (
            <text fg={GRIS}>{label}</text>
          ) : (
            <box />
          )
        },
      }),
    ]

    // refrescar catálogo cuando cambian modelos/providers
    const stops = [
      context.data.on("model.updated", () => void context.data.location.model.invalidate(location)),
      context.data.on("provider.updated", () => void context.data.location.provider.invalidate(location)),
    ]

    return () => {
      for (const stop of [...stops, ...widgets]) {
        try {
          if (typeof stop === "function") stop()
        } catch {
          /* noop */
        }
      }
    }
  },
})
