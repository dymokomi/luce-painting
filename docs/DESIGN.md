# luce-painting design

## A stroke

A stroke is a polyline in document pixels. `Stroke.extend` walks it and queues a
dab every `spacing` of the diameter, each jittered and driven by the pen as the
brush's dynamics say (`dynamics.lucb`); `flush`, once a frame, stamps the
queue. Stamping gives every tile the queued dabs reach one pass: the paint laid
there so far is drawn back into a spare texture, the new dabs over it
(`dab.frag`, `over`), and the spare becomes the paint. A capped stroke (one
whose opacity is a ceiling) draws its dabs in groups that do not overlap, each
group through `replace`, so no two dabs of a pass read each other.

The layer's tile is then rebuilt by `paint.frag` from the tile it had before
the stroke and the paint: the brush color (or a retouching effect) through the
coverage, inside the selection, capped by the opacity. Tiles the stroke never
reaches are untouched, so a stroke on a 360 MP canvas costs the cells it
crosses. The tiles from before the stroke are kept whole (`Stroke.original`)
for the caller's undo.

## What a stroke paints on

luce-painting knows tiles, not documents. The caller passes a `PaintTarget` to
every call: the tiles (a layer's pixels or its mask) and, when a stamp should
tell the compositor that a whole mask changed, a revision to bump. At the
start it also carries the selection's tiles and how the document mixes colors
(`mixing.lucb`: as sRGB-encoded values by default, as Photoshop's do, or in
linear light). luce-image resolves these for a layer each call.

## Retouching strokes

A retouching stroke paints an effect image instead of a color: `use_effect`
takes tiles, `use_effect_source` an `EffectSource` that makes a cell's effect
the first time a dab reaches it (clone stamp, blur, dodge and burn in
luce-image), so no effect is ever made for the whole layer.

## Smudge

Smudge (`warp.lucb`, exported as `smudge`) runs on a premultiplied CPU working
copy of the cells it passes, read back as the stroke nears them
(`warp_loads.lucb`), and uploads the rows it changed once a frame. It can walk
its path on a worker (`warp_queue.lucb`): pointer events only record points,
and ending the stroke returns at once while the worker finishes.

## Brush images and masks

`BrushImages` holds a sampled tip and a texture, halved into a chain so a dab
samples near its own size. `BrushMask` is a tip or texture being drawn: plain
coverage bytes, drawn on with a round brush or taken from a picture's RGBA
pixels. Opening one from a file and keeping it as PNG is luce-image's.
