# Nest role icons

This is the editable source for the 22 NestJS role icons in `icons/` (11 roles, each with TypeScript and JavaScript variants). The generic red Nest icon for `nest-cli.json` remains unchanged.

Each role has a distinct silhouette so its meaning does not depend on colour. A fixed bottom-right chip identifies TypeScript (blue `TS`) or JavaScript (yellow `JS`); the glyph is clipped away from that chip. The SVGs use a 32 × 32 viewBox, vector letter paths, and no external assets.

| File suffix | Symbol | Meaning |
|---|---|---|
| `controller` | Orange signpost | Routes requests |
| `service` | Violet gear | Runs business logic |
| `module` | Crimson cube | Wires a self-contained group |
| `guard` | Green shield and keyhole | Controls access |
| `pipe` | Cyan elbow pipe | Transforms or validates data |
| `filter` | Amber funnel with `!` | Handles exceptions |
| `interceptor` | Magenta wrap arrow | Runs around a handler |
| `middleware` | Teal arrow through a layer | Intervenes in the request path |
| `decorator` | Lime `@` | Marks a decorator |
| `gateway` | Indigo broadcast tower | Handles real-time events |
| `adapter` | Slate plug | Connects a platform adapter |

The symbols stay distinct in greyscale and at 16 px. The TypeScript/JavaScript letters are readable on Retina displays; at 16 px on a 1× display, the chip's colour and light/dark polarity carry the distinction. The filter colour is slightly darker than the first prototype to meet 3:1 contrast against white while remaining legible on dark backgrounds.

To regenerate after editing the palette or geometry:

```sh
python3 scripts/nest-icons/build.py
python3 scripts/nest-icons/build.py --check
```

`--check` compares all 22 generated SVGs without writing and prints contrast ratios for the role colours and language chips. Verify visual changes at 16–20 px on both dark and light backgrounds; a successful XML parse alone cannot establish that the icons remain distinguishable.
