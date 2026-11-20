# opencode-model-cost

Selector de modelos para OpenCode V2 que **muestra cuánto cuesta cada modelo
y los ordena de más barato a más caro**. Como el selector `/model` nativo, pero
con los precios visibles para no gastar de más por accidente. En clientes sin
terminal (modo chat de Orca, Desktop) los precios van **incrustados en el nombre
del modelo** desde la parte servidor del plugin.

## Qué hace

**Comando `/tcolas`** (aliases: `/precios`, `/modelcost`): abre el diálogo de
selección de modelos **ordenado por costo efectivo** (más económico arriba,
más caro abajo) y agrupado por nivel de precio:

```
GRATIS · Económico · Medio · Caro · Sin precios
```

Cada fila muestra un estimado abreviado (los detalles completos van en el toast
al elegir):

```
≈$2.37/Mtok · ≈$0.26/ses
```

- **Costo efectivo**: mezcla ponderada según uso real de agente
  (~10:1 entrada vs salida, ~70% de la entrada cacheada), no el precio de
  lista de salida. Incluye el estimado por sesión típica (≈110k tokens).
- La búsqueda propio reordena resultados por costo: los más baratos arriba.
- Al elegir un modelo lo aplica a la sesión abierta (`client.session.switchModel`),
  conservando la variante si es el mismo modelo de antes. El toast confirma el
  cambio con el precio completo (`in/out/cch`, $/sesión) y el puesto en el
  ranking (ej. *puesto 3 de 42 por precio*).
- Si no hay sesión abierta, muestra los precios del modelo elegido en un toast.
- Si un modelo tiene precios por tramos de contexto (`cost: Model.Cost[]`),
  elige el tramo que aplica según el límite de contexto del modelo.

**Widget en el footer** (`⚡ ≈$/Mtok`): el costo efectivo del modelo
actualmente seleccionado, visible de forma permanente en `home` y `prompt`.
Modelos gratis se muestran como `GRATIS`.

**Precios en el nombre del modelo (parte servidor)**: los clientes que no son
la terminal de OpenCode —el modo chat de Orca, OpenCode Desktop, cualquier
frontend del SDK— dibujan su propio selector de modelos y no pueden llevar
plugins visuales. Para ellos, `index.ts` reescribe el `name` del catálogo con
el costo efectivo al final:

```
opencode/Big Pickle · gratis
opencode/Claude Haiku 5.5 · ≈$0.40/Mtok
opencode/Kimi K3 · ≈$2.37/Mtok
```

- Vale buscar `gratis` o `≈$` en esos selectores: el precio es parte del nombre.
- El orden en esos dropdowns es alfabético (lo decide el cliente, solo ordena
  por nombre); el orden estricto por precio es función de `/tcolas` en la terminal.
- Config y sesiones referencian modelos por `providerID/modelID`, que no se
  tocan: renombrar no rompe nada.
- Si un modelo no tiene precios en el catálogo, su nombre queda intacto.

<img width="1096" height="613" alt="image" src="https://github.com/user-attachments/assets/d74bbf96-cb4e-4aad-8e09-d56622c5f99f" />

<img width="1097" height="611" alt="image" src="https://github.com/user-attachments/assets/31cda7d2-833c-4a5a-b144-77bf8a074df7" />



## Instalación

Copia la carpeta a tu config global de OpenCode y registra el plugin:

```text
.config/opencode/plugins/model-cost/
├── index.ts   (parte servidor: agrega ≈$/Mtok o "gratis" al nombre de cada modelo)
└── tui.tsx    (comando /tcolas + widget de costo efectivo en la terminal)
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

Configurado y probado con OpenCode **v2.3.2**.
