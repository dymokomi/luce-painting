// The layer tile after a stroke: the original tile (image 1, straight alpha)
// with the stroke's paint (image 2, premultiplied: dabs' color and coverage)
// applied as paint or as erasure, the coverage capped by the stroke opacity
// (a brush's texture is in the coverage already: dab.frag textures each
// dab). A retouching stroke paints an effect image (image 4, straight alpha) instead
// of a color: laid over the original through the coverage (clone stamp), or
// mixed with it, replacing it by coverage (blur tool, healing).
// Drawn with `replace`, so what is emitted is stored as is: straight alpha.
// With `srgb` everything mixes as sRGB-encoded values: the color and the
// paint tile's dabs come encoded, the original and the effect are encoded
// here, and the result is decoded back to the tile's linear light.
#version 450
#extension GL_GOOGLE_include_directive : require
layout(location = 0) in vec4 vertex_color;
layout(location = 0) out vec4 fragment_color;
layout(push_constant) uniform Params {
    vec4 color;       // straight alpha paint color, linear light (encoded with `srgb`, or on a mask)
    float opacity;    // stroke opacity, caps the coverage
    float erase;      // 1 erases instead of painting
    float fill;       // 1 ignores the coverage and paints the whole selection
    float selected;   // 1 multiplies by the selection's coverage (image 3, red)
    vec2 tile;        // the tile's top-left in document pixels
    float srgb;       // 1: mix the encoded values
    float unused4;
    float unused5;
    float effect;         // 0 the color, 1 the effect image over, 2 the effect image mixed
    float unused1;
    float unused2;
} params;
layout(set = 0, binding = 1) uniform sampler2D original;
layout(set = 0, binding = 2) uniform sampler2D coverage;
layout(set = 0, binding = 3) uniform sampler2D selection;
layout(set = 0, binding = 4) uniform sampler2D effect;
#include "srgb.glsl"
bool encoded() { return params.srgb > 0.5; }
// A straight-alpha result in the mixing space, back to the tile's.
vec4 stored(vec3 rgb, float a) { return vec4(encoded() ? srgb_decode(rgb) : rgb, a); }
void main() {
    vec2 uv = gl_FragCoord.xy / 256.0;
    vec4 kept = texture(original, uv);
    vec4 o = kept;
    if (encoded()) o.rgb = srgb_encode(o.rgb);
    vec4 paint = texture(coverage, uv);
    float s = (params.fill > 0.5 ? 1.0 : min(paint.a, 1.0)) * params.opacity;
    if (params.selected > 0.5) s *= texture(selection, uv).r;
    if (params.effect > 0.5) {
        vec4 e = texture(effect, uv);
        if (encoded()) e.rgb = srgb_encode(e.rgb);
        if (params.effect < 1.5) {
            // Over: a transparent source leaves the original, as a stamp does.
            float ea = e.a * s;
            float a = ea + o.a * (1.0 - ea);
            fragment_color = a > 0.0 ? stored((e.rgb * ea + o.rgb * o.a * (1.0 - ea)) / a, a) : kept;
        } else {
            // Mixed, premultiplied: the healed pixels replace the original by coverage.
            vec4 m = mix(vec4(o.rgb * o.a, o.a), vec4(e.rgb * e.a, e.a), s);
            fragment_color = m.a > 0.0 ? stored(m.rgb / m.a, m.a) : vec4(0.0);
        }
        return;
    }
    if (params.erase > 0.5) {
        fragment_color = vec4(kept.rgb, kept.a * (1.0 - s));
        return;
    }
    vec3 tint = (params.fill > 0.5 || paint.a <= 0.0) ? params.color.rgb : paint.rgb / paint.a;
    float a = s + o.a * (1.0 - s);
    fragment_color = a > 0.0 ? stored((tint * s + o.rgb * o.a * (1.0 - s)) / a, a) : vec4(kept.rgb, a);
}
