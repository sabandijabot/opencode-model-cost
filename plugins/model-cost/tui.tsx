// model-cost / tui — selector de modelos con precios visibles
//
// Comando /tcolas (alias /precios): abre el mismo tipo de diálogo que /model,
// ordenado por costo efectivo (más económico arriba, más caro abajo) y agrupado
// por nivel: GRATIS · Económico · Medio · Caro · Sin precios. Cada fila muestra:
//   ≈$2.37/Mtok · ≈$0.26/ses   (corto para que no se corte; detalles en el toast al elegir)
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

// money() sin el "$" (se obvia porque el score ya lo lleva)
const plain = (n: unknown): string => money(n).replace("$", "")

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

// ---------- costo efectivo: mezcla ponderada según uso real de agente ----------
// perfil: ~10:1 tokens de entrada vs salida; ~70% de la entrada llega cacheada
const W_CACHE_READ = 0.636
const W_INPUT = 0.273
const W_OUTPUT = 0.091
const SESSION_MTOK = 0.11 // sesión típica ≈110k tokens → $/sesión = score × 0.11

// null = el catálogo no trae precios
const score = (m: ModelInfo): number | null => {
  const c = pickCost(m)
  if (!c) return null
  return W_CACHE_READ * c.cache.read + W_INPUT * c.input + W_OUTPUT * c.output
}

// nivel de precio para agrupar en el selector
const tier = (s: number | null): string => {
  if (s === null) return "Sin precios"
  if (s === 0) return "GRATIS"
  if (s < 1) return "Económico"
  if (s <= 3.5) return "Medio"
  return "Caro"
}

// orden por score: sin precios al final
const byScore = (a: { s: number | null }, b: { s: number | null }): number => {
  if (a.s === null) return b.s === null ? 0 : 1
  if (b.s === null) return -1
  return a.s - b.s
}

// versión corta para las filas del selector: solo el score (la descripción se corta)
const pricedRow = (m: ModelInfo): string => {
  const s = score(m)
  if (s === null) return "sin precios"
  if (s === 0) return "GRATIS"
  return `≈${money(s)}/Mtok · ≈${money(s * SESSION_MTOK)}/ses`
}

// versión completa: se usa en los toasts al elegir un modelo
const priced = (m: ModelInfo): string => {
  const parts: string[] = []
  const c = pickCost(m)
  const s = score(m)
  if (c && s !== null) {
    if (s === 0) {
      parts.push("GRATIS")
    } else {
      parts.push(
        `≈${money(s)}/Mtok`,
        `≈${money(s * SESSION_MTOK)}/sesión`,
        `in ${plain(c.input)}`,
        `out ${plain(c.output)}`,
        `cch ${plain(c.cache.read)}/${plain(c.cache.write)}`,
      )
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

    // ---------- comando /tcolas ----------
    const openPicker = async () => {
      const models = await loadModels()
      if (models.length === 0) {
        context.ui.toast.show({ title: "Model cost", message: "No hay modelos disponibles en el catálogo", variant: "warning", duration: 4000 })
        return
      }

      const current = context.ui.model.current()
      const currentValue = current ? `${current.providerID}/${current.modelID}` : undefined

      // ordenar por costo efectivo: económico arriba, caro abajo, sin precios al final
      const ranked = models.map((m) => ({ m, s: score(m) })).sort(byScore)
      const rankOf = new Map<string, number>()
      ranked.forEach((r, i) => rankOf.set(`${r.m.providerID}/${r.m.id}`, i + 1))

      // el proveedor solo se muestra si hay dos modelos con el mismo nombre (ahorra ancho)
      const dup = new Map<string, number>()
      ranked.forEach(({ m }) => dup.set(m.name || m.id, (dup.get(m.name || m.id) ?? 0) + 1))

      const options = ranked.map(({ m, s }) => {
        const base = m.name || m.id
        return {
          title: (dup.get(base) ?? 0) > 1 ? `${base} [${m.providerID}]` : base,
          value: `${m.providerID}/${m.id}`,
          description: pricedRow(m),
          category: tier(s),
        }
      })

      // valor -> costo efectivo, para poder reordenar los resultados de búsqueda
      const scoreOf = new Map<string, number | null>(
        ranked.map(({ m, s }) => [`${m.providerID}/${m.id}`, s] as [string, number | null]),
      )

      const hasCost = (x: number | null | undefined): x is number => x !== null && x !== undefined
      const byCost = (a: { value: string }, b: { value: string }): number => {
        const x = scoreOf.get(a.value)
        const y = scoreOf.get(b.value)
        if (!hasCost(x)) return !hasCost(y) ? 0 : 1
        if (!hasCost(y)) return -1
        return x - y
      }

      // búsqueda propia: todas las palabras deben coincidir en título/descripción/categoría
      // y el resultado SIEMPRE se reordena por costo efectivo (más barato arriba)
      const search = (
        query: string,
        opts: { title: string; value: string; description?: string; category?: string }[],
      ) => {
        const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        const matched =
          words.length === 0
            ? [...opts]
            : opts.filter((o) => {
                const hay = `${o.title} ${o.description ?? ""} ${o.category ?? ""}`.toLowerCase()
                return words.every((w) => hay.includes(w))
              })
        return matched.sort(byCost)
      }

      const chosen: string | undefined = await context.ui.dialog.select({
        title: "Modelos por costo — de más barato a más caro",
        placeholder: "Buscar modelo...",
        current: currentValue,
        options,
        search,
      })
      if (!chosen) return // Esc: nada

      const [providerID, ...rest] = chosen.split("/")
      const id = rest.join("/")
      const target = models.find((m) => m.providerID === providerID && m.id === id)
      if (!target) return
      const rank = rankOf.get(`${providerID}/${id}`) ?? 0

      // hay sesión abierta? router actual
      const route = context.ui.router.current()
      const sessionID: string | undefined = route?.type === "session" ? route.sessionID : undefined

      if (!sessionID) {
        context.ui.toast.show({
          title: "Model cost",
          message: `Precios de ${target.name}: ${priced(target)} (puesto ${rank} de ${models.length}). Abre/enfoca una sesión para aplicarlo con /tcolas.`,
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
          message: `${target.name} — ${priced(target)} (puesto ${rank} de ${models.length} por precio)`,
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
          title: "Cambiar modelo (ordenado por costo efectivo)",
          description: "Como /model, ordenado de más económico a más caro con ≈$/Mtok",
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
      const s = score(m)
      if (s === null) return ""
      if (s === 0) return "GRATIS"
      return `⚡ ≈${money(s)}/Mtok`
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
