// model-cost — parte servidor (no-op)
//
// El plugin es solo TUI (OpenCode compila tui.tsx para decorarlo en la interfaz).
// El catálogo de modelos con precios ya lo expone el propio servidor (/api/model,
// data de models.dev), así que aquí no hace falta ningún hook. Este index.ts
// solo permite que la entrada "./plugins/model-cost" de opencode.jsonc tenga
// entrypoint y el TUI (tui.tsx) se descubra a su lado.

import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "model-cost",
  async setup() {
    // sin hooks: no intercepta requests ni eventos del servidor
  },
})
