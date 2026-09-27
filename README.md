# luce-painting

The brush engine behind [luced-2d](https://github.com/dymokomi/luced-2d), in Luce
Base on the GPU: Photoshop-style brushes with dynamics, sampled tips and
textures, strokes stamped a tile at a time into
[luce-canvas](https://github.com/dymokomi/luce-canvas) tiles, smudge walked on a
worker thread, spot healing's patch search, and the brush masks a tip or texture
is made from.

It paints tiles, not documents: a `PaintTarget` names the tiles a stroke paints
(a layer's pixels or its mask), the selection it stays inside and how its
document mixes colors. [luce-image](https://github.com/dymokomi/luce-image)
finds those for a layer of its document and keeps the history.

## Use

```
def dependency "luce-painting" {
    str owner = "dymokomi"
    str version = "^0.1.0"
}
```

| Export | What it holds |
| --- | --- |
| `paint` | `Brush` (Photoshop's brush settings), `Painter` (the dab, paint and gradient pipelines), `gradient_tile` |
| `stroke` | `Stroke`, `PaintTarget`, `EffectSource` (a retouching stroke's effect, made a cell at a time) |
| `dynamics` | `Dynamic`, `Control`, `Pen`: what drives size, flow, angle and the rest per dab |
| `brush_images` | `BrushImages`: a sampled tip and texture, mip-mapped for the dab's size |
| `brush_mask` | `BrushMask`: a tip or texture being drawn, as coverage |
| `mixing` | `Mixing`: colors mixed as sRGB-encoded values, as Photoshop's are, or in linear light |
| `smudge` | `WarpStroke`: smudge on a CPU working copy, uploaded as it goes |
| `heal` | `heal`: the spot healing fill of a painted hole |

```luce
from paint import Brush, Painter
from stroke import Stroke, PaintTarget

var painter = try Painter.create(device)
var stroke = try Stroke.begin(&painter, PaintTarget(tiles = &tiles), Brush(diameter = 40.0), 10.0, 10.0)
try stroke.extend(&painter, PaintTarget(tiles = &tiles), 200.0, 80.0)
try stroke.flush(&painter, PaintTarget(tiles = &tiles))
stroke.finish()
```

See [docs/DESIGN.md](docs/DESIGN.md) for how a stroke becomes tiles.

## Test

`./test.sh` runs every module's tests natively and through the C backend with
the sibling `luce-base` checkout's compiler (`--base` picks another). GPU tests
skip where no device opens.

The shaders are generated: after changing one, run

```
python3 ../luce-gpu/tools/embed_shaders.py --public -I ../luce-color/shaders src/luce_painting/shaders.lucb src/luce_painting/shaders/dab.frag src/luce_painting/shaders/paint.frag src/luce_painting/shaders/gradient.frag
```

`srgb.glsl`, the sRGB curve the paint and gradient passes mix through, is
luce-color's, shared with luce-image's shaders.

## License

MIT; see [LICENSE](LICENSE).
