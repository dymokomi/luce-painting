// One dab of the brush over a tile, emitting premultiplied paint scaled by
// flow; composited `over` into the paint tile, dabs build up like real paint.
// The tip is an ellipse (radius, roundness, turned by direction) with a hard
// core and a linear falloff, or a sampled grayscale image (image 1) fitted to
// the same ellipse. A textured brush multiplies (or subtracts) its texture
// (image 2), tiled in document space, into each dab by the dab's depth.
// An aliased dab (the Pencil) covers a whole pixel or none, by its centre.
// A capped dab (opacity driven per dab) is drawn with `replace` instead: it
// reads the paint so far (image 3) and brings its alpha towards the dab's
// opacity by its coverage, never past it — Krita's "alpha darken", so a
// stroke's opacity is a ceiling however many dabs overlap.
// Images are read texel by texel and blended here: the tip clamps at its
// edge and the texture wraps, whatever the sampler's addressing.
#version 450
layout(location = 0) in vec4 vertex_color;
layout(location = 0) out vec4 fragment_color;
layout(push_constant) uniform Params {
    vec2 origin;      // the tile's top-left in target pixels (0, 0 for a tile target)
    vec2 center;      // the dab's centre, tile pixels
    vec2 tile;        // the tile's top-left in document pixels, for textures
    vec2 direction;   // (cos, sin) of the tip's angle
    float radius;
    float hardness;   // 0..1: the fraction of the radius at full coverage
    float flow;       // 0..1
    float roundness;  // minor over major axis, 0.05..1
    float red;
    float green;
    float blue;
    float aliased;    // 1: whole pixels in or out, as the Pencil
    float sampled;    // 1: the tip is image 1
    float tip_x;      // the tip's width over its longer side
    float tip_y;      // its height over its longer side
    float textured;   // 1: image 2 textures the dab
    float period_x;   // the texture's repeat in document pixels
    float period_y;
    float depth;      // 0..1: how much of the texture shows
    float mode;       // 0 multiply, 1 subtract
    float invert;     // 1: the texture's values inverted
    float capped;     // 1: alpha darken towards `opacity` over image 3
    float opacity;    // the dab's ceiling, 0..1
    float unused3;
} params;
layout(set = 0, binding = 1) uniform sampler2D tip;
layout(set = 0, binding = 2) uniform sampler2D pattern;
layout(set = 0, binding = 3) uniform sampler2D previous;

// Bilinear at `uv` (0..1 across the image), texels past the edge clamped.
float clamped(sampler2D image, vec2 uv) {
    ivec2 size = textureSize(image, 0);
    vec2 p = uv * vec2(size) - 0.5;
    ivec2 base = ivec2(floor(p));
    vec2 f = p - vec2(base);
    ivec2 most = size - 1;
    float a = texelFetch(image, clamp(base, ivec2(0), most), 0).r;
    float b = texelFetch(image, clamp(base + ivec2(1, 0), ivec2(0), most), 0).r;
    float c = texelFetch(image, clamp(base + ivec2(0, 1), ivec2(0), most), 0).r;
    float d = texelFetch(image, clamp(base + ivec2(1, 1), ivec2(0), most), 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Bilinear at `uv` in repeats of the image, wrapping around its edges.
float wrapped(sampler2D image, vec2 uv) {
    ivec2 size = textureSize(image, 0);
    vec2 p = fract(uv) * vec2(size) - 0.5;
    vec2 cell = floor(p);
    vec2 f = p - cell;
    ivec2 base = ivec2(cell) + size;
    float a = texelFetch(image, base % size, 0).r;
    float b = texelFetch(image, (base + ivec2(1, 0)) % size, 0).r;
    float c = texelFetch(image, (base + ivec2(0, 1)) % size, 0).r;
    float d = texelFetch(image, (base + ivec2(1, 1)) % size, 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 p = gl_FragCoord.xy - params.origin - params.center;
    vec2 q = vec2(dot(p, params.direction), dot(p, vec2(-params.direction.y, params.direction.x)));
    q.y /= max(params.roundness, 0.05);
    float c;
    if (params.sampled > 0.5) {
        // The tip's longer side spans the diameter.
        vec2 uv = q / (2.0 * max(params.radius, 0.5)) / vec2(params.tip_x, params.tip_y) + 0.5;
        c = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : clamped(tip, uv);
        if (params.aliased > 0.5) c = c >= 0.5 ? 1.0 : 0.0;
    } else {
        float d = length(q);
        float core = params.radius * params.hardness;
        c = 1.0 - smoothstep(core, max(params.radius, core + 0.5), d);
        if (params.aliased > 0.5) c = d <= max(params.radius, 0.5) ? 1.0 : 0.0;
    }
    if (params.textured > 0.5 && params.depth > 0.0) {
        vec2 document = gl_FragCoord.xy - params.origin + params.tile;
        float t = wrapped(pattern, document / vec2(params.period_x, params.period_y));
        if (params.invert > 0.5) t = 1.0 - t;
        c = params.mode > 0.5 ? max(0.0, c - (1.0 - t) * params.depth) : c * mix(1.0, t, params.depth);
    }
    vec3 color = vec3(params.red, params.green, params.blue);
    if (params.capped > 0.5) {
        vec4 before = texelFetch(previous, ivec2(gl_FragCoord.xy - params.origin), 0);
        float k = clamp(c * params.flow * vertex_color.a, 0.0, 1.0);
        float alpha = before.a < params.opacity ? before.a + (params.opacity - before.a) * k : before.a;
        vec3 straight = before.a > 0.0 ? before.rgb / before.a : color;
        fragment_color = vec4(mix(straight, color, k) * alpha, alpha);
        return;
    }
    float a = c * params.flow * vertex_color.a;
    fragment_color = vec4(color * a, a);
}
