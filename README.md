# opencode-model-cost

Selector de modelos para OpenCode V2 que **muestra cuánto cuesta cada modelo**
antes de cambiar. Como el selector `/model` nativo, pero con los precios
visibles para no gastar de más por accidente.

## Qué hace

**Comando `/tcolas`** (aliases: `/precios`, `/modelcost`): abre el diálogo de
selección de modelos agrupado por provider, y cada opción muestra su precio por
millón de tokens:

```
in $3 · out $15 · cache $0.30/$3.75 · ctx 200k
GRATIS · ctx 1M
```

- Al elegir un modelo lo aplica a la sesión abierta (`client.session.switchModel`),
  conservando la variante si es el mismo modelo de antes.
- Si no hay sesión abierta, muestra los precios del modelo elegido en un toast.
- Si un modelo tiene precios por tramos de contexto (`cost: Model.Cost[]`),
  elige el tramo que aplica según el límite de contexto del modelo.

**Widget en el footer** (`⚡ $2 in / $10 out`): el precio del modelo actualmente
seleccionado, visible de forma permanente en `home` y `prompt`. Modelos gratis
se muestran como `GRATIS`.

## Instalación

Copia la carpeta a tu config global de OpenCode y registra el plugin:

```text
.config/opencode/plugins/model-cost/
├── index.ts   (parte servidor: no-op, requerido por la estructura de plugins)
└── tui.tsx    (comando /tcolas + widget de precios)
```

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    { "package": "./plugins/model-cost" }
  ]
}
```

Reinicia el TUI (o `opencode service restart`) y listo. Los precios vienen del
catálogo de modelos de `models.dev` (vía OpenCode), así que se actualizan solos
sin tocar el código.

## Compañero recomendado

Funciona ideal junto con **`opencode-daily-budget`** (límite de gasto diario que
bloquea prompts): uno te muestra cuánto cuesta cambiar de modelo, el otro te
avisa cuánto llevas gastado en el día.

https://github.com/sabandijabot/opencode-daily-budget

Configurado y probado con OpenCode **v2.2.5**.
