// model-cost — parte servidor: añade el costo efectivo al NOMBRE del modelo
//
// El catálogo de OpenCode (ctx.model) es lo que leen todos los clientes del
// servidor: la TUI, OpenCode Desktop y el selector de modelos del modo chat de
// Orca, que muestra `providerID/<nombre>` tal cual. Al reescribir el nombre
// aquí, los precios aparecen en cualquier interfaz sin tocar su código.
//
// Formato (nombre limpio delante, precio detrás):
//   Big Pickle · gratis
//   Kimi K3 · ≈$2.37/Mtok
//   GLM-5.3-Flash            (sin precios en el catálogo: nombre intacto)
//
// Nota de orden: el dropdown de Orca ordena alfabéticamente por nombre y no
// expone otra clave, así que el orden ahí es por letra. El orden estricto por
// precio vive en /tcolas (TUI), que reordena por costo efectivo.
//
// El costo efectivo es la misma mezcla ponderada que usa tui.tsx:
// ~10:1 entrada vs salida y ~70% de la entrada cacheada.
// Los cambios de nombre no afectan a la configuración: los ajustes referencian
// modelos por providerID/modelID, que quedan intactos.

import { Plugin } from "@opencode/plugin"

type Cost = {
  tier?: { type: string; size: number }
  input: number
  output: number
  cache: { read: number; write: number }
}

// perfil de uso real de agente
const W_CACHE_READ = 0.636
const W_INPUT = 0.273
const W_OUTPUT = 0.091

// cost[] puede traer tramos por tamaño de contexto; elegimos el que aplique
const pickCost = (model: { cost?: Cost[]; limit?: { context?: number } }): Cost | undefined => {
  const cost = model.cost ?? []
  if (cost.length === 0) return undefined
  const ordered = [...cost].sort((a, b) => (a.tier?.size ?? 0) - (b.tier?.size ?? 0))
  const fits = ordered.filter((c) => (c.tier?.size ?? 0) <= (model.limit?.context ?? Infinity))
  return fits.length > 0 ? fits[fits.length - 1] : ordered[0]
}

// null = el catálogo no trae precios
const score = (model: { cost?: Cost[]; limit?: { context?: number } }): number | null => {
  const c = pickCost(model)
  if (!c) return null
  return W_CACHE_READ * c.cache.read + W_INPUT * c.input + W_OUTPUT * c.output
}

const money = (x: number): string => {
  if (x >= 100) return `$${x.toFixed(0)}`
  if (x >= 10) return `$${x.toFixed(1)}`
  return `$${x.toFixed(2)}`
}

const tagFor = (s: number): string => (s === 0 ? " · gratis" : ` · ≈${money(s)}/Mtok`)

// para quitar la etiqueta si alguna vez se replaya sobre un nombre ya etiquetado
const UNTAG = / · (?:gratis|≈\$\d+(?:\.\d+)?\/Mtok)$/

export default Plugin.define({
  id: "model-cost",
  async setup(ctx) {
    // Los transforms se re-aplican desde cero sobre el catálogo base cada vez
    // que este se reconstruye (p. ej. al refrescar models.dev), así que los
    // precios se actualizan solos sin reiniciar nada.
    await ctx.model.transform((editor) => {
      for (const model of editor.list()) {
        const s = score(model)
        if (s === null) continue
        editor.update(model.providerID, model.id, (draft) => {
          draft.name = `${draft.name.replace(UNTAG, "")}${tagFor(s)}`
        })
      }
    })
  },
})
