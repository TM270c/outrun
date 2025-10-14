# Snow Screen Rendering Overview

This document explains how the snow screen effect works inside the renderer.

## Configuration inputs
- The snow effect uses configuration values declared in `Config`, including how many segments ahead the effect is visible, how often we place a snow screen, how dense the flakes should appear, their size and fall speed ranges, plus how aggressively motion stretch is applied.  See `snowScreenDistance`, `snowScreenDensity`, `snowDensity`, `snowSize`, `snowSpeed`, and `snowStretch` in `src/config.js`.

## Segment setup
- Each road segment receives a random colour tint for its snow screen when it is created.  That colour is generated in `randomSnowScreenColor()` and stored under `seg.snowScreen` in `src/world.js` so the draw step can pick it up later.

## Renderer preparation
- At render boot, the snow module derives useful ranges from the configuration: the minimum/maximum flake size, fall speeds, density multipliers, and stretch factor.  Constants such as the minimum snow screen radius and footprint expansion are also defined in `src/render.js`.
- A helper `computeSnowScreenBaseRadius()` calculates the base radius of the circular snow footprint for a segment based on projected road width and the on-screen scale, with a minimum clamp.
- `snowFieldFor(segIndex)` caches a pseudo-random field of flakes (position, speed, sway parameters, size, and animation phase offset) per segment.  It uses a deterministic Mulberry32 RNG so segments keep the same flake layout across frames without storing them globally.

## Building the draw list
- While iterating visible segments, the renderer decides whether to spawn a snow screen draw item.  It checks that the segment has snow enabled, lies within `snowScreenDistance`, and respects the stride set by `snowScreenDensity` to thin out how often screens appear down the road.
- For qualifying segments it computes the mid-point between the segment endpoints in screen space, calculates the snow screen radius (see the dedicated section below), and records a `snowScreen` draw item with position, colour, depth, and radius.

## Snow screen scaling
- `computeSnowScreenBaseRadius(scaleMid, rwMid)` starts with the segment’s current on-screen `scale`.  That value already reflects how far the segment sits from the camera, so multiplying by the interpolated road width (`rwMid`) produces a base footprint that shrinks automatically in the distance.  The result is clamped to `SNOW_SCREEN_MIN_RADIUS` so a screen never collapses completely.
- The same helper also multiplies by `SNOW_SCREEN_FOOTPRINT_SCALE` (to keep the circle a little tighter than the full road) and then by `SNOW_SCREEN_BASE_EXPANSION` so the finished footprint bleeds outward.  This expansion is a constant factor, not another perspective step—it just guarantees the circle overhangs the asphalt enough to hide camera sway and small lane changes.
- After that base radius is returned, the draw code multiplies it by `spriteFarScaleFromZ(zMid)`—the global perspective scale applied to other billboards.  This final factor keeps the snow screen visually in sync with sprites as they recede into the horizon.
- With these three operations (distance-aware base, constant footprint expansion, shared perspective scale), every road segment produces a consistent snow screen that feels anchored to the road yet remains wide enough in the foreground.

## Ideas for configurable snow screen sizing
- **Expose a designer-facing multiplier.** Add a `snowScreenSize` scalar to `Config` that multiplies the post-clamp base radius before `SNOW_SCREEN_FOOTPRINT_SCALE` is applied.  This keeps the new knob close to the perspective-aware measurement while reusing the existing constants for footprint shape.
- **Split “bleed” and “style” scales.** Convert `SNOW_SCREEN_BASE_EXPANSION` into two factors: one remains a hard-coded padding to cover camera sway, the other is a config-driven stylistic multiplier.  Designers can tweak the second value without breaking the safety margin.
- **Allow non-linear shaping.** If we need a more dramatic effect, sample the config value through a curve (e.g., quadratic bias) before applying it.  That would let designers boost near-camera screens strongly while leaving distant ones mostly unchanged, avoiding the “weird scaling” that comes from uniformly scaling everything.
- **Authoring workflow hint.** Whichever approach we choose, mirror the value in debug UI so designers can iterate live and understand how their multiplier interacts with the existing base radius computation.

## Potential compute-saving strategies
- **Reduce spawn frequency smartly.** Increase the stride between snow screens at distance or under high GPU load, while keeping near-camera density intact.  This leverages the existing `snowScreenDensity` logic but introduces adaptive tuning.
- **Share flake fields.** Instead of generating a unique `snowFieldFor()` per segment, reuse a small pool of precomputed fields and rotate them.  Nearby segments still look varied, but we avoid RNG work and memory churn.
- **Cull by projected area.** Skip rendering snow screens whose projected radius falls below a tiny threshold—those distant quads cost draw calls without adding visible detail.
- **Batch draw calls.** Combine multiple snow screens that share material state into a single instanced draw, reducing state changes and shader invocations.
- **Cheaper animation path.** For faraway screens, freeze horizontal sway or stretch updates every other frame.  That halves per-flake math where the viewer cannot notice the difference.

## Rendering the flakes
- `renderDrawList()` eventually encounters the snow screen item and calls `renderSnowScreen()`.  This function pulls fog data and the precomputed flake field for that segment.  It also picks an animation time (tied to game time if available) and derives player speed percentage for stretch calculations.
- Each flake cycles vertically using its personal speed and wraps around so flakes continuously fall.  Horizontal sway is achieved with a sine function using per-flake amplitude, frequency, and phase.
- Flake size blends between configured min/max values and is scaled by perspective, clamped so flakes do not disappear when small.
- To simulate motion blur, flakes closer to the camera and off-centre stretch in the direction away from the viewpoint.  The stretch amount depends on player speed, closeness to the camera, and the configurable `snowStretch`.  Only the farthest quad vertices are pushed outward to create a teardrop shape.
- Finally, each flake quad is drawn as a solid-colour square (tinted by the segment alpha) with fog applied so distant flakes fade naturally.

