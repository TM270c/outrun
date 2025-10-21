# Outrun Codebase – Cleanup Roadmap (Pass 1 Overview)

## 1. Game Overview
- **What it is**: A browser racing game with menus, vehicle selection, races, scoreboards, and bonus items.
- **Where it runs**: In the browser, using WebGL helpers in `src/gl/` to draw the game and normal DOM code for menus.
- **What it loads**: Settings from `src/config.js`, track data from `tracks/`, sprite info from `src/sprite-catalog.js`, and texture info from `src/world.js`.

## 2. Main Building Blocks

### 2.1 Starting the Game
- **`src/bootstrap.js`** loads assets, sets up callbacks, and shares helpers across the rest of the code.
- **`src/app.js`** is the overall game manager. It swaps between menus, races, pause screens, and the scoreboard. It also tracks button presses and animation timing.

### 2.2 Settings and Static Data
- **`src/config.js`** stores constants such as physics values, track layout numbers, render sizes, and debug toggles.
- **`tracks/`** holds the CSV files that describe the track layout, hills, and curves.

### 2.3 Math and Helpers
- **`src/math.js`** is a grab bag of number helpers. It includes easing curves, random helpers, and small math utilities that many files use.

### 2.4 World and Assets
- **`src/world.js`** creates the in-game world. It builds track segments, sets up cliff data, manages boost zones, and keeps track of textures.

### 2.5 Racing Logic
- **`src/gameplay.js`** runs the race. It updates car physics, handles collisions, spawns traffic, keeps time, and calls into rendering.

### 2.6 Drawing the Game
- **`src/render.js`** draws everything on screen. It prepares road geometry, sprites, overlays, and any debug panels each frame.
- **`src/gl/`** contains the low-level WebGL code for shaders, buffers, and textured quads.

### 2.7 Sprites and Animation
- **`src/sprite-catalog.js`** defines every sprite sheet, animation frame, and scaling rule for vehicles, roadside props, and UI icons.

### 2.8 Menus and UI
- **`src/ui/screens.js`** generates the HTML for each menu screen, such as the main menu, pause screen, vehicle select, settings, scoreboard, attract mode, and race complete screens.

### 2.9 Input Handling
- Button handling lives partly in `app.js` (menus) and partly in `gameplay.js` (driving controls). Both listen for key events and update shared input state.

### 2.10 Other Files
- **`docs/`, `tex/`, `video/`** contain written docs and art references.
- **`index.mod.html`** is the main HTML shell for the game canvas and menus.
- **`monolith-old.txt`** is an older architecture reference.

## 3. Function Inventory by Category

### 3.1 Application & Menu Flow (`src/app.js`)
- `createInitialRaceCompleteState`
  - **Purpose**: Factory for a blank race-complete screen state so menus can start fresh when a race ends or restarts.
  - **Inputs**: None.
  - **Outputs**: Object with `active`, `timeMs`, `letters`, `confirmed`, `currentIndex`, `phase`, `timer`, `entryId`, `playerName`, `playerRank`.
  - **Side effects**: None (pure data builder).
  - **Shared state & call sites**: Assigned to `state.raceComplete` in `src/app.js:58`, `85`, `739`.
  - **Dependencies**: No calls.
  - **Edge cases**: Provides safe defaults (zero time, placeholder name); does not validate external inputs.
  - **Performance**: Constant-time object creation when menus reset or a race finishes.
  - **Units / spaces**: `timeMs` in milliseconds.
  - **Determinism**: Yes—always returns identical data.
  - **Keep / change / delete**: Keep; simplest alternative is inlining the literal where used.
  - **Confidence / assumptions**: High confidence; assumes `letters` of `'AAA'` is intended default.
  - **Notes**: Possible reductions: none spotted; placement in `src/app.js` matches usage via `resetRaceCompleteState`; consider renaming to shorter `inputNameState` for clarity.
- `resetRaceCompleteState`
  - **Purpose**: Resets the race-finish screen data back to a clean slate so the next race starts with blank initials and zeroed time.
  - **Inputs**: None.
  - **Outputs**: None; updates in-place.
  - **Side effects**: Replaces `state.raceComplete` with fresh defaults, wiping any prior letters, timers, or entry IDs.
  - **Shared state & call sites**: `state.raceComplete` reassigned; invoked at `src/app.js:232,724,1133`.
  - **Dependencies**: Calls `createInitialRaceCompleteState`.
  - **Edge cases**: Covers stale data by always cloning defaults; does not special-case DNF/DQ or preserve existing names.
  - **Performance**: Constant-time object replacement when leaving the race-complete screen, starting a race, or booting.
  - **Units / spaces**: Defaults include `timeMs` in milliseconds and name letters in uppercase strings.
  - **Determinism**: Yes—same empty state every call.
  - **Keep / change / delete**: Keep; simple helper prevents duplicated setup—alternative is to inline the factory call.
  - **Confidence / assumptions**: High confidence; assumes no other module mutates `state.raceComplete` directly.
  - **Notes**: Reviewer noted there were "no notes" and the helper already looks adequate; I concur and suggest only revisiting if future menu reset work reveals redundant copies or missed shared behavior.
- `now`
- `markInteraction`
- `escapeHtml`
- `resolveAssetUrlSafe`
- `normalizePreviewAtlas`
  - Purpose: Convert optional preview sprite sheet settings into a safe atlas description for the vehicle preview.
  - Inputs: `raw` object with `columns`, `rows`, `frameCount`, `frameRate`, `frameDuration`; expects positive numbers or empty.
  - Outputs: Object with positive `columns`, `rows`, `frameCount`, `frameDuration` seconds, or `null` when data is unusable.
  - Side effects: None; only reads the default frame duration constant.
  - Shared state & call sites: Used by `renderVehicleSelect` in `src/app.js:339`; does not mutate shared state.
  - Dependencies: Basic math helpers (`Number`, `Math`) and `DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION`.
  - Edge cases: Fills missing counts from other fields, derives duration from frame rate, returns `null` on non-positive or absent data.
  - Performance: Constant-time arithmetic when building the menu model; no loops beyond a handful of checks.
  - Units / spaces: Frame duration measured in seconds; counts represent frame totals; independent of render frame rate.
  - Determinism: Yes; same input produces the same atlas and no persistent changes.
  - Keep / change / delete: Keep; consolidates validation that would otherwise live inside `renderVehicleSelect`.
  - Confidence / assumptions: High confidence; assumes preview atlas configs stay small and numeric.
  - Notes: Reviewer summarized this as the helper that lets `renderVehicleSelect` slice the preview atlas, then asked whether it should merge with the atlas animation handler used by player vehicles and animated billboards; keep it separate for now because the preview path needs unique defaults, null returns, and timing fallbacks, but queue a follow-up to lift the shared frame math if those pipelines ever align.
- `formatTimeMs`
- `createLeaderboardEntry`
- `recomputeLeaderboardRanks`
- `sortLeaderboardEntries`
- `findLeaderboardEntryIndexById`
- `addLeaderboardEntry`
- `setMode`
- `ensureDom`
- `renderMainMenu`
- `renderLeaderboard`
- `renderSettings`
- `renderPauseMenu`
- `renderVehicleSelect`
- `renderAttract`
- `renderRaceComplete`
- `startAttractPlayback`
- `stopAttractPlayback`
- `updateMenuLayer`
- `applyVehiclePreviewFrame`
- `setupVehiclePreviewAnimation`
- `updateVehiclePreviewAnimation`
- `clampIndex`
- `changeMainMenuSelection`
- `changePauseMenuSelection`
- `changeSettingsSelection`
- `changeVehicleSelection`
- `getVehicleOptionByKey`
- `applyVehicleSelection`
- `showVehicleSelect`
- `activateVehicleSelection`
- `adjustCurrentNameLetter`
- `lockCurrentNameLetter`
- `finalizeRaceCompleteEntry`
- `setRaceCompletePhase`
- `advanceRaceCompleteSequence`
- `updateRaceComplete`
- `goToAttract`
- `toggleSnowSetting`
- `applyDebugModeSetting`
- `setDebugEnabled`
- `toggleDebugSetting`
- `resetGameplayInputs`
- `startRace`
- `handleRaceFinish`
- `showLeaderboard`
- `showSettings`
- `resumeRace`
- `quitToMenu`
- `activateMainMenuSelection`
- `activatePauseMenuSelection`
- `activateSettingsSelection`
- `requestLeaderboard`
- `parseLeaderboardCsv`
- `handleMenuNavigation`
- `handlePauseNavigation`
- `handleSettingsNavigation`
- `handleMenuKeyDown`
- `handleLeaderboardKeyDown`
- `handleSettingsKeyDown`
- `handleVehicleSelectKeyDown`
- `handlePauseKeyDown`
- `handleRaceCompleteKeyDown`
- `handleAttractKeyDown`
- `handleKeyDown`
- `handleKeyUp`
- `step`
- `init`
- `isSnowEnabled`
- `isDebugEnabled`

### 3.2 UI Screen Templates (`src/ui/screens.js`)
- `ensureEscapeHtml`
- `mainMenuScreen`
- `pauseMenuScreen`
- `vehicleSelectScreen`
- `settingsMenuScreen`
- `leaderboardScreen`
- `attractScreen`
- `raceCompleteScreen`

### 3.3 Asset Loading & Bootstrapping (`src/bootstrap.js`)
- `loadManifestTextures`
- `loadAssets`
- `setupCallbacks`

### 3.4 Vehicle Control & Physics (`src/gameplay.js`)
- `trackLengthRef`
- `hasSegments`
- `wrapByLength`
- `wrapSegmentIndex`
- `ensureArray`
- `atlasFrameUv`
- `normalizeAnimClip`
- `createSpriteAnimationState`
- `currentAnimationClip`
- `clampFrameIndex`
- `switchSpriteAnimationClip`
- `updateSpriteUv`
- `advanceSpriteAnimation`
- `createSpriteMetaEntry`
- `createInitialMetrics`
- `getSpriteMeta`
- `defaultGetKindScale`
- `segmentAtS`
- `segmentAtIndex`
- `elevationAt`
- `groundProfileAt`
- `playerFloorHeightAt`
- `boostZonesOnSegment`
- `playerWithinBoostZone`
- `boostZonesForPlayer`
- `jumpZoneForPlayer`
- `applyBoostImpulse`
- `applyJumpZoneBoost`
- `playerHalfWN`
- `spawnDriftSmokeSprites`
- `spawnSparksSprites`
- `applyDriftSmokeMotion`
- `applySparksMotion`
- `carMeta`
- `carHalfWN`
- `currentPlayerForwardSpeed`
- `npcForwardSpeed`
- `ensureCarNearMissReset`
- `tryRegisterCarNearMiss`
- `computeCollisionPush`
- `configureImpactableSprite`
- `applyImpactPushToSprite`
- `updateImpactableSprite`
- `carHitboxHeight`
- `carHitboxTopY`
- `applyNpcCollisionPush`
- `playerBaseHeight`
- `npcLateralLimit`
- `slopeAngleDeg`
- `slopeLimitRatio`
- `slopeExceedsLimit`
- `cliffSectionExceedsLimit`
- `cliffInfoExceedsLimit`
- `segmentHasSteepCliff`
- `wrapDistance`
- `shortestSignedTrackDistance`
- `nearestSegmentCenter`
- `cliffSurfaceInfoAt`
- `cliffLateralSlopeAt`
- `getAdditiveTiltDeg`
- `updateCameraFromFieldOfView`
- `setFieldOfView`
- `cliffSteepnessMultiplier`
- `applyCliffPushForce`
- `doHop`
- `playerLateralLimit`
- `resolveSpriteInteractionsInSeg`
- `resolveCarCollisionsInSeg`
- `resolveSegmentCollisions`
- `resolveCollisions`
- `updateSpriteAnimations`
- `collectSegmentsCrossed`
- `updatePhysics`
- `clearSegmentCars`
- `spawnCars`
- `steerAvoidance`
- `tickCars`
- `spawnProps`
- `resetPlayerState`
- `respawnPlayerAt`
- `applyDefaultFieldOfView`
- `resetScene`
- `queueReset`
- `queueRespawn`
- `startRaceSession`
- `step`

### 3.5 Sprite Placement, RNG, & Effects (`src/gameplay.js`)
- `splitCsvLine`
- `parseCsvWithHeader`
- `parseNumberRange`
- `parseNumericRange`
- `parseSpritePool`
- `parsePlacementMode`
- `normalizeSeed`
- `createRng`
- `randomInRange`
- `computeAxisScaleWeight`
- `computeAxisAtlasBias`
- `computePlacementBias`
- `biasedRandom01`
- `sampleScaleValue`
- `sampleUniformIndex`
- `sampleBiasedIndex`
- `computeLaneStep`
- `dedupePositions`
- `computeLanePositions`
- `clampSegmentRange`
- `selectAsset`
- `determineInitialFrame`
- `buildSpriteMetaOverrides`
- `generateSpriteInstances`
- `createSpriteFromInstance`
- `loadSpriteCsv`
- `parseSpritePlacements`
- `ensureSpriteDataLoaded`
- `computeDriftSmokeInterval`
- `allocDriftSmokeSprite`
- `recycleDriftSmokeSprite`
- `computeSparksInterval`
- `allocSparksSprite`
- `recycleSparksSprite`
- `recycleTransientSprite`
- `keyActionFromFlag`
- `createKeyHandler`

### 3.6 Track & Environment Management (`src/world.js`)
- `resolveAssetUrl`
- `loadImage`
- `defaultTextureLoader`
- `loadTexturesWith`
- `resetCliffSeries`
- `randomSnowScreenColor`
- `roadWidthAt`
- `addSegment`
- `lastY`
- `addRoad`
- `buildTrackFromCSV`
- `buildCliffsFromCSV_Lite`
- `enforceCliffWrap`
- `pushZone`
- `findZone`
- `vSpanForSeg`
- `clampBoostLane`
- `clampRoadLane`
- `laneToCenterOffset`
- `laneToRoadRatio`
- `getZoneLaneBounds`
- `parseBoostZoneType`
- `parseBoostLaneValue`
- `segmentAtS`
- `elevationAt`
- `cliffParamsAt`
- `cliffSurfaceInfoAt`
- `floorElevationAt`
- `cliffLateralSlopeAt`

### 3.7 Rendering & Camera Systems (`src/render.js`)
- `areTexturesEnabled`
- `randomColorFor`
- `makeColor`
- `applyDeadzone`
- `smoothTowards`
- `atlasUvFromRowCol`
- `computePlayerAtlasSamples`
- `computePlayerSpriteSamples`
- `createPerfTracker`
- `makeFrameStats`
- `beginFrame`
- `endFrame`
- `wrapRenderer`
- `markSolidStart`
- `markSolidEnd`
- `isSolidActive`
- `countDrawCall`
- `registerDrawListSize`
- `registerStrip`
- `registerSprite`
- `registerSnowScreen`
- `registerSnowQuad`
- `registerBoostQuad`
- `registerPhysicsSteps`
- `registerSegment`
- `getLastFrameStats`
- `isSnowFeatureEnabled`
- `numericOr`
- `orderedRange`
- `rangeFromConfig`
- `computeSnowScreenBaseRadius`
- `mulberry32`
- `buildSnowField`
- `ensureSnowFieldPool`
- `snowFieldFor`
- `fogNear`
- `computeOverlayEnabled`
- `syncOverlayVisibility`
- `createPoint`
- `projectWorldPoint`
- `projectSegPoint`
- `padWithSpriteOverlap`
- `computeCliffLaneProgress`
- `fogArray`
- `getTrackLength`
- `projectPoint`
- `makeCliffLeftQuads`
- `makeCliffRightQuads`
- `fogFactorFromZ`
- `spriteFarScaleFromZ`
- `drawParallaxLayer`
- `renderHorizon`
- `drawRoadStrip`
- `drawBoostZonesOnStrip`
- `drawBillboard`
- `drawBillboardRotated`
- `segmentAtS`
- `elevationAt`
- `groundProfileAt`
- `boostZonesOnSegment`
- `zonesFor`
- `renderScene`
- `createCameraFrame`
- `applyCameraTilt`
- `buildWorldDrawList`
- `enqueuePlayer`
- `renderDrawList`
- `renderSnowScreen`
- `renderStrip`
- `renderPlayer`
- `computeDebugPanels`
- `worldToOverlay`
- `drawBoostCrossSection`
- `mapRatio`
- `fmtSeconds`
- `fmtCount`
- `fmtSpeed`
- `fmtFloat`
- `renderOverlay`
- `start`
- `tick`
- `draw`
- `startReset`
- `startRespawn`
- `attach`
- `frame`
- `loop`

### 3.8 WebGL Renderer (`src/gl/renderer.js`)
- `constructor`
- `_createShader`
- `_createProgram`
- `_makeWhiteTex`
- `loadTexture`
- `begin`
- `setRollPivot`
- `drawQuadTextured`
- `drawQuadSolid`
- `makeCircleTex`
- `end`
- `padQuad`
- `makeRotatedQuad`

### 3.9 Sprite Catalog (`src/sprite-catalog.js`)
- `freezeClip`
- `makeFrames`
- `makeAtlasFrameAssets`
- `cloneCatalog`
- `getTextureManifest`
- `getCatalogEntry`
- `getMetrics`

### 3.10 Math Utilities (`src/math.js`)
- `clamp`
- `clamp01`
- `lerp`
- `pctRem`
- `createEaseIn`
- `createEaseOut`
- `createEaseInOut`
- `easeLinear01`
- `easeInQuad01`
- `easeOutQuad01`
- `easeInOutQuad01`
- `easeInCub01`
- `easeOutCub01`
- `easeInOutCub01`
- `createCurveEase`
- `easeLinear`
- `easeInQuad`
- `easeOutQuad`
- `easeInCub`
- `easeOutCub`
- `getEase01`
- `computeCurvature`
- `tangentNormalFromSlope`

### 3.11 Testing Utilities (`test/glrenderer.resize.test.js`)
- `assert`
- `makeRenderer`
- `gl.viewport`
- `gl.clearColor`
- `gl.clear`
- `gl.uniform2f`
- `gl.uniform1i`
- `gl.uniform3f`

## 4. Cleanup Priorities Aligned to Our Goals

### 4.1 Make the Code Easier to Read
- Split giant files like `app.js`, `gameplay.js`, and `world.js` into smaller modules with clear names.
- Add short docs that explain what each module exports and how the pieces connect.
- Use the same naming style everywhere (for example, always `camelCase` for functions and consistent prefixes like `init` or `create`).
- Replace hidden globals with explicit imports and exports so we know where values come from.

### 4.2 Trim Repeated or Unused Code
- Move shared helpers such as HTML escaping or asset URL builders into one place.
- Remove menu states or debug toggles that no longer run.
- Consolidate repeated HTML or sprite templates into reusable builders.

### 4.3 Speed Up Runtime
- Profile the render loop to find slow steps, then batch sprite draws and cut down allocations.
- Cache expensive calculations (segment projections, easing curves, texture lookups) so we do them once per update.
- Limit DOM work by batching menu updates and making sure network requests (like leaderboards) run asynchronously.
- Watch for code that creates lots of short-lived objects and switch to in-place updates where possible.
