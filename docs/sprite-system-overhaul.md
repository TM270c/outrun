# Sprite System Overhaul Design

## Purpose
This document captures the full design for replacing the current procedural sprite spawning logic with a data-driven system backed by CSV assets. The new approach must let designers author sprite placement and behaviour per area, reduce bespoke gameplay code, and make sprite layout files as readable as the existing `test-track.csv` and `cliffs.csv` assets.

## Current Behaviour and Pain Points

### Procedural spawning and distributed logic
* Sprites are injected during `Gameplay.resetScene()` by calling `spawnProps()`, which randomises tree, palm, sign, and animated plate placement across all segments each reset.【F:src/gameplay.js†L1512-L1566】
* Every call to `addProp()` constructs sprite objects, configures animation metadata, and pushes them into the owning segment’s `sprites` array.【F:src/gameplay.js†L1458-L1497】
* Interaction and motion rules (animation triggering, lateral knockback, drift smoke transfer) are embedded inside `resolveSpriteInteractionsInSeg()` and `updateSpriteAnimations()` rather than being data-driven.【F:src/gameplay.js†L921-L1087】
* Sprite metadata (width, aspect, texture selection) is stored inside a large `DEFAULT_SPRITE_META` constant in gameplay code, making it hard to decouple asset choices from logic.【F:src/gameplay.js†L102-L147】

### Limitations
* Random generation prevents deterministic set dressing for specific track areas, and designers must tweak code to add or move sprites.
* Interaction rules are tightly coupled to hard-coded flags (`interactable`, `impactable`) with bespoke code paths, leading to complex updates when new behaviours are added.
* Sprite state persistence lives on the sprite objects and is mutated by collision resolution and animation update loops, rather than being encapsulated by behaviour modules.

## Goals for the Overhaul
1. **Data-driven placement** – Sprite positions, assets, and behaviours must be defined in CSV files alongside track data.
2. **Deterministic layout** – Sprite placement should be stable across runs and easy to review in version control.
3. **Behaviour modularity** – Interaction, animation, and motion rules must be defined through reusable behaviour descriptors rather than ad-hoc code paths.
4. **Reduced duplication** – A single sprite factory and update loop should handle all track decoration sprites, pickups, and impactable props while leaving the bespoke drift smoke system isolated.
5. **Human-readable authoring** – CSV fields should read similarly to existing track files, support inline comments, grouping, and optional columns.

## Sprite Scope and Exceptions
* **Authoring focus** – The CSV-driven system covers set decoration, pickups, and impactable props. Vehicles, drift smoke, and other gameplay geometry continue to use their existing bespoke logic.
* **Drift smoke** – Keep drift smoke on its dedicated pooling and update path; the new manager only needs a thin adapter to register smoke when behaviours request it. No placement rows will reference smoke directly.

## Proposed System Architecture

### High-level flow
1. **Catalog ingestion** – On scene reset, hydrate the sprite catalog (`src/sprite-catalog.js`) and placement sheets (`tracks/placement.csv` plus any zone-specific overrides) before calling gameplay spawn routines.
2. **Parsing** – Catalog entries map to `SpriteCatalogEntry` records; placement rows map to `SpriteSpec` entries describing segment/lane coverage and sprite pools. Parsing uses helper functions similar to the track builder (`toInt`, `toFloat`, `toBool`) for consistent handling of optional columns.【F:src/world.js†L271-L392】
3. **Instantiation** – Convert `SpriteSpec` entries into sprite runtime objects using a single factory (`createSpriteFromSpec`). This factory attaches metadata from the catalog, behaviour handles, and per-instance state.
4. **Registration** – Push created sprites into the owning segment’s `sprites` list. Segments are identified either by explicit index/range or by world `s` coordinates.
5. **Runtime management** – A sprite manager drives behaviour updates and interaction checks via declarative rules instead of hard-coded flags.

### Data format
Sprite data now lives in a **scripted catalog** plus a placement CSV. The catalog avoids repeating per-sprite metadata and centralises texture ownership alongside metrics.

#### 1. Sprite catalog (`src/sprite-catalog.js`)
Each catalog entry exports a sprite variant with metrics, asset bindings, and interaction behaviour. Entries include:

| Field | Description |
| --- | --- |
| `spriteId` | Required unique identifier (e.g. `corn1`). Placement rows reference these IDs. |
| `metrics` | Normalised width, aspect, tint, texture key, and optional atlas info for UV generation. |
| `assets` | Atlas or texture handles surfaced to runtime selection logic (`{ type, key, frames }`). |
| `type` | Behaviour descriptor key: `static`, `trigger`, or `solid`. |
| `interaction` | Interaction hook: `static`, `playAnim`, or `toggle`. |
| `baseClip` | Default animation clip definition (`{ frames, playback }`). |
| `interactClip` | Optional interaction animation clip definition. |
| `frameDuration` | Frame timing for animated sprites when playback is active. |

Entries capture everything designers would otherwise repeat for each placement, including behaviour type and animation choices, while consolidating texture URLs inside the catalog manifest.

#### 2. Sprite placement (`tracks/placement.csv`)
Placement rows determine where and how often sprites appear along the track.

| Column | Description |
| --- | --- |
| `sprite` | One or more `spriteId` values from the catalog. Multiple IDs (e.g. `corn1,corn2,corn3`) are chosen deterministically per grid cell using `randomSeed`. |
| `segment` | Single index (`120`) or range (`120-140`). Ranges create grids when combined with repetition fields. |
| `lane` | Single lane position (`1.0`) or range (`1-1.6`). Supports fractional lanes for wide sweeps. |
| `repeatSegment` | Optional spacing in segments between repeated placements (e.g. `1` places every segment, `2` every other segment). |
| `repeatLane` | Optional lane spacing between repeats (e.g. `0.3` to create lateral rows). |
| `scaleRange` | Optional per-placement scale randomisation range (`0.5-1.2`). When omitted, sprites spawn at scale `1.0`. |
| `randomSeed` | Optional integer seed controlling variant selection, jitter, and scale rolls for deterministic layouts. |
| `jitterSeg` | Optional random offset range along the segment axis (`0-0.2`). Values are seeded via `randomSeed`. |
| `jitterLane` | Optional random offset range across the lane axis (`0-0.3`). Values are seeded via `randomSeed`. |
| `comment` | Free text ignored by parser for organization. |

Lane ranges plus `repeatLane` create grid patterns such as corn fields without bespoke code. Jitter values add subtle variation while staying deterministic under a fixed seed.

*Placement rows never restate behaviour or animation. Instead, they express **where** sprites go (segment/lane ranges) and **how dense** the grid should be (`repeatSegment`, `repeatLane`). Lane ranges accept the same syntax as segments (`start-end`), letting designers sweep across shoulders or medians without extra code.*

When listing multiple sprite IDs in a single cell, wrap the value in quotes (`"corn1,corn2,corn3"`) so CSV parsers keep the pool together.

#### Example snippets

Catalog entry excerpt:

```js
{
  spriteId: 'tree_main',
  metrics: { wN: 0.5, aspect: 3.0, tint: [0.22, 0.7, 0.22, 1], textureKey: 'tree' },
  assets: [{ type: 'texture', key: 'tree', frames: [] }],
  type: 'static',
  interaction: 'static',
  baseClip: { frames: [], playback: 'none' },
  interactClip: { frames: [], playback: 'none' },
}
```

Placement excerpt:

```csv
name,sprite,segment,lane,repeatSegment,repeatLane,scaleRange,randomSeed,jitterSeg,jitterLane,comment
corn-field,"corn1,corn2,corn3,corn4",20-30,1-2,1,0.4,0.8-1.2,4242,0-0.2,0-0.3,Beachfront rows
corn-guard,scarecrow,24,1.5,1,1,,1337,0-0.05,,Guard sprite at field edge
```

**Authoring guidelines**
* Allow inline comments identical to track CSV to help designers annotate sections.【F:src/world.js†L325-L362】
* Support header rows for readability; parser should skip lines beginning with `name=value` to align with track format conventions.【F:src/world.js†L324-L361】
* Provide example CSV snippets for both catalog and placement files to establish canonical formatting.

### Runtime data structures
```ts
// Loaded from CSV
interface SpriteSpec {
  segmentStart: number;
  segmentEnd: number;
  laneStart: number; // equals laneEnd when placement specifies a single lane
  laneEnd: number;
  repeatSegment: number; // defaults to 1 when omitted
  repeatLane: number; // defaults to laneEnd - laneStart when omitted
  spritePool: string[]; // spriteIds referenced from catalog
  scaleRange?: [number, number]; // defaults to [1, 1] when omitted
  randomSeed?: number; // shared seed for variant pick, scale, and jitter
  jitterSeg?: number; // max +/- offset in segment space
  jitterLane?: number; // max +/- offset in lane space
}

interface SpriteCatalogEntry {
  spriteId: string;
  assets: string[];
  type: 'static' | 'trigger' | 'solid';
  baseAnim: AnimClip;
  interaction: 'static' | 'playAnim' | 'toggle';
  interactAnim: AnimClip;
  frameDuration?: number;
}

type AnimClip =
  | { playback: 'none'; frames: [] }
  | { playback: 'loop' | 'once' | 'pingpong'; frames: number[] };

// Created once per instance
interface SpriteInstance {
  kind: string;
  meta: SpriteMeta;
  offset: number; // lane
  s: number; // world distance
  segIndex: number;
  behaviour: SpriteBehaviour;
  state: Record<string, unknown>;
}
```

### Behaviour framework
Introduce a `SpriteBehaviours` registry mapping `type` → `{ initialize, onInteract, onUpdate }`. Each handler receives `(sprite, dt, helpers)` to mutate state in a controlled manner.

**Core behaviours**
* `static` – No interaction; used for scenery. `onUpdate` is a no-op aside from optional looping `baseAnim` playback.
* `trigger` – Exposes `onInteract` that restarts `interactAnim`, flips state, and dispatches the configured `interaction` (`playAnim` or `toggle`).
* `solid` – Wraps existing impact push logic, applying lateral/forward impulses via helper functions (`applyImpactPushToSprite`) and optionally blending `interactAnim` when collisions occur.【F:src/gameplay.js†L921-L951】【F:src/gameplay.js†L1020-L1084】
* `drift-smoke-adapter` – Bridges behaviour requests into the existing drift smoke pooling system without exposing smoke entries in placement CSVs.【F:src/gameplay.js†L93-L171】【F:src/gameplay.js†L163-L175】

By routing `resolveSpriteInteractionsInSeg()` through the behaviour registry, we can delete bespoke `if (spr.interactable)` and `if (spr.impactable)` branches. Instead, the function loops through sprites, checks for overlap, and calls `spr.behaviour.onInteract(sprite, context)` when conditions are met. The behaviour decides whether to mark the sprite as consumed, play animations, or request re-registration in another segment.

### Factory responsibilities
`createSpriteFromSpec(spec, segment, helpers)` should:
1. Expand `spec.spritePool` into concrete catalog entries, randomly selecting variants when more than one ID is provided (deterministically via `randomSeed`).
2. Look up sprite metadata (`SpriteMeta`) from the catalog and apply the row’s random scale within `SpriteSpec.scaleRange` when instantiating.
3. Attach behaviour by reading `type` and cloning any default behaviour state template.
4. Populate animation data according to `baseAnim`, `interactAnim`, and their shared `frameDuration` when behaviours request it.
5. Register the sprite with the sprite manager, which handles TTL tracking, segment transfers, and pooling.

### Sprite manager lifecycle
A new `SpriteManager` module should own all sprite arrays and expose:
* `loadCatalog(url: string)` – Fetch and parse the catalog into a `spriteId → SpriteCatalogEntry` map.
* `loadPlacements(urls: string[])` – Parse placement sheets and expand them into `SpriteSpec` records per segment.
* `spawnAll()` – Clear existing sprite arrays and instantiate from `SpriteSpec` data using the cached catalog.
* `update(dt)` – Iterate through active sprites once per frame, calling behaviour updates and recycling expired instances.
* `handleInteraction(seg, playerState)` – Called from collision resolution to process overlaps.
* `clear()` – Remove all sprites when resetting the scene.

This manager replaces `spawnProps()` and centralises TTL, animation, and segment transfer logic currently scattered across `Gameplay` functions.【F:src/gameplay.js†L1512-L1566】【F:src/gameplay.js†L1020-L1087】

## Interaction Rules and Example Scenarios

### Non-interactable scenery
* Catalog row: `spriteId=palm_a, assets=atlas=props_palms:frame0, type=static, baseAnim=none, interaction=static`
* Placement row: `sprite=palm_a, segment=120, lane=-1.4`
* Behaviour: `static` – No state changes; sprite remains until despawned by the manager when the track unloads.

### Animated sign triggered by player
* Catalog row: `spriteId=sign_flip, assets=atlas=props_sign:flip*, type=trigger, baseAnim=1-2:loop, interaction=playAnim, interactAnim=1-8:once, frameDuration=0.08`
* Placement row: `sprite=sign_flip, segment=300, lane=1.0`
* Behaviour: On overlap, the behaviour restarts animation and marks the sprite as interacted. Playback only occurs when triggered.

### Pushable barrier with randomised scale
* Catalog row: `spriteId=barrel_push, assets=atlas=props_barrel, type=solid, baseAnim=none, interaction=playAnim, interactAnim=1-4:pingpong`
* Placement row: `sprite=barrel_push, segment=512-516, lane=-0.5-0.5, repeatSegment=1, repeatLane=0.5, scaleRange=0.8-1.1, randomSeed=99`
* Behaviour: Impact applies the shove logic, letting the existing impulse code move barrels aside. Random scale per instance keeps the layout varied.

### Collectible sprite group
* Catalog row: `spriteId=pip1, assets=atlas=pip_pickup, type=trigger, baseAnim=1-4:loop, interaction=toggle, interactAnim=5-8:once`
* Placement row: `sprite=pip1, segment=600-620, lane=0, repeatSegment=2, randomSeed=12`
* Behaviour: Acts like existing pickups but defined in CSV; segment repetition expands into evenly spaced placements. The behaviour increments score and marks instance as collected.

## Recommendations to Reduce Code Complexity
1. **Centralise metadata** – Move `DEFAULT_SPRITE_META` into a dedicated module (e.g. `src/data/sprites.js`). Gameplay logic should consume immutable metadata through the sprite manager, simplifying tests and reuse.【F:src/gameplay.js†L102-L147】
2. **Eliminate `spawnProps()`** – Replace with `SpriteManager.spawnAll()` reading CSV specs. Random generation lives in declarative placement columns (`scaleRange`, `randomSeed`, `jitterSeg`, `jitterLane`) instead of bespoke code.【F:src/gameplay.js†L1512-L1566】
3. **Abstract interactions** – Modify `resolveSpriteInteractionsInSeg()` to delegate to behaviour hooks rather than duplicating checks for `interactable` and `impactable` sprites.【F:src/gameplay.js†L921-L951】
4. **Unify animation handling** – Behaviours control when animations play; `updateSpriteAnimations()` becomes a thin wrapper that asks behaviours whether to advance frames. Drift smoke and other particle-style sprites reuse the same update loop.【F:src/gameplay.js†L1020-L1084】
5. **Declarative movement rules** – Express post-interaction adjustments through behaviours (e.g. shove distance) so gameplay code only applies requested transforms.
6. **Segment-level caching** – Cache parsed specs per segment to avoid regenerating arrays on each reset. The manager simply clones spec templates into instances.
7. **Tooling aids** – Provide a validator script that checks CSV inputs (unknown sprite keys, out-of-range segments) before runtime.

## Authoring & Workflow Guidelines
* Keep placement CSVs grouped by area (e.g. `tracks/placement-main.csv`, `tracks/placement-city.csv`) and allow `SpriteManager` to load multiple files per scene.
* Use comment lines (`// Section: Beachfront`) to mark areas, matching the style used by track CSV authoring.【F:src/world.js†L324-L362】
* Document behaviour keys and expected columns in `docs/sprite-behaviours.md` (future work) so designers have a reference without reading code.
* Encourage designers to preview changes by reloading the scene—deterministic CSV placement ensures visual diffs correspond to file edits.

## Implementation Roadmap
1. **Scaffold** – Create `SpriteManager` module, move metadata, and expose loader hooks on `Gameplay.resetScene()`.
2. **Parser** – Implement CSV parser for catalog + placement files with flexible column handling and validation reporting.
3. **Behaviour registry** – Port existing behaviour logic (animation trigger, impact push, pickups, drift smoke) into registry functions.
4. **Refactor collisions** – Update collision resolution to call `SpriteManager.handleInteraction()`; remove per-flag branching.
5. **Data migration** – Export current procedural placement into initial catalog + placement CSV files to maintain parity.
6. **Testing** – Add regression tests (where possible) to ensure CSV loading and behaviour hooks run without errors. Validate by comparing before/after scenes.

By following this plan we can convert sprite management into a declarative, maintainable system that empowers designers and simplifies gameplay code.
