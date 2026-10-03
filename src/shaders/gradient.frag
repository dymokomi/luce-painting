// A linear gradient over a layer tile: image 1 is the original tile (straight
// alpha), image 2 the selection's coverage (red). The gradient runs from
// `a` to `b` in document pixels, color `from` to color `to` (straight
// alpha, linear light), and is laid over the original where selected. A
// radial gradient runs outward from `a`, reaching `to` at `b`'s distance.
// With `srgb` the colors come encoded, the stops mix as Photoshop's do, and
// the gradient lies over the original as encoded values too; on a mask the
// colors come encoded and mix as they are.
#version 450
#extension GL_GOOGLE_include_directive : require
layout(location = 0) in vec4 vertex_color;
layout(location = 0) out vec4 fragment_color;
layout(push_constant) uniform Params {
    vec4 from_color;
    vec4 to_color;
    vec2 origin;      // this tile's document position
    vec2 a;
    vec2 b;
    float selected;   // 1 multiplies by the selection's coverage
    float radial;     // 1 runs outward from a
    float srgb;       // 1: mix the encoded values
} params;
layout(set = 0, binding = 1) uniform sampler2D original;
layout(set = 0, binding = 2) uniform sampler2D selection;
#include "srgb.glsl"
void main() {
    vec2 uv = gl_FragCoord.xy / 256.0;
    vec4 o = texture(original, uv);
    bool encoded = params.srgb > 0.5;
    if (encoded) o.rgb = srgb_encode(o.rgb);
    vec2 p = params.origin + gl_FragCoord.xy;
    vec2 ab = params.b - params.a;
    float t = params.radial > 0.5 ? clamp(length(p - params.a) / max(length(ab), 1e-6), 0.0, 1.0)
                                  : clamp(dot(p - params.a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec4 g = mix(params.from_color, params.to_color, t);
    float s = params.selected > 0.5 ? texture(selection, uv).r : 1.0;
    float a = g.a * s;
    float alpha = a + o.a * (1.0 - a);
    vec3 color = alpha > 0.0 ? (g.rgb * a + o.rgb * o.a * (1.0 - a)) / alpha : vec3(0.0);
    fragment_color = vec4(encoded ? srgb_decode(color) : color, alpha);
}
