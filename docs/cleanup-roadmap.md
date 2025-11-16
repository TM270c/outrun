# Outrun Codebase – Cleanup Roadmap (Pass 2 Review)

- `createInitialRaceCompleteState`
  - Purpose: Factory for a blank race-complete screen state so menus can start fresh when a race ends or restarts.
  - Inputs: None.
  - Outputs: Object with `active`, `timeMs`, `letters`, `confirmed`, `currentIndex`, `phase`, `timer`, `entryId`, `playerName`, `playerRank`.
  - Side effects: None (pure data builder).
  - Shared state & call sites: Assigned to `state.raceComplete` in `src/app.js:58`, `85`, `739`.
  - Dependencies: No calls.
  - Edge cases: Provides safe defaults (zero time, placeholder name); does not validate external inputs.
  - Performance: Constant-time object creation when menus reset or a race finishes.
  - Units / spaces: `timeMs` in milliseconds.
  - Determinism: Yes—always returns identical data.
  - Keep / change / delete: Keep; simplest alternative is inlining the literal where used.
  - Confidence / assumptions: High confidence; assumes `letters` of `'AAA'` is intended default.
  - Notes: Possible reductions: none spotted; placement in `src/app.js` matches usage via `resetRaceCompleteState`; consider renaming to shorter `inputNameState` for clarity.



- `resetRaceCompleteState`
  - Purpose: Resets the race-finish screen data back to a clean slate so the next race starts with blank initials and zeroed time.
  - Inputs: None.
  - Outputs: None; updates in-place.
  - Side effects: Replaces `state.raceComplete` with fresh defaults, wiping any prior letters, timers, or entry IDs.
  - Shared state & call sites: `state.raceComplete` reassigned; invoked at `src/app.js:232,724,1133`.
  - Dependencies: Calls `createInitialRaceCompleteState`.
  - Edge cases: Covers stale data by always cloning defaults; does not special-case DNF/DQ or preserve existing names.
  - Performance: Constant-time object replacement when leaving the race-complete screen, starting a race, or booting.
  - Units / spaces: Defaults include `timeMs` in milliseconds and name letters in uppercase strings.
  - Determinism: Yes—same empty state every call.
  - Keep / change / delete: Keep; simple helper prevents duplicated setup—alternative is to inline the factory call.
  - Confidence / assumptions: High confidence; assumes no other module mutates `state.raceComplete` directly.
  - Notes: Reviewer noted there were "no notes" and the helper already looks adequate; I concur and suggest only revisiting if future menu reset work reveals redundant copies or missed shared behavior.



- `now`
  - Purpose: Helper that grabs the current timestamp so menu flow can compare idle time without repeating the built-in Date.now call.
  - Inputs: None.
  - Outputs: Number of milliseconds since January 1, 1970 returned from Date.now.
  - Side effects: None; it only reads the system clock.
  - Shared state & call sites: Updates and reads state.lastInteractionAt in src/app.js:93, 1119, 1132 when tracking menu idleness.
  - Dependencies: JavaScript built-in Date.now.
  - Edge cases: Does not guard against someone changing the computer clock or supplying mock timers.
  - Performance: Single native call; negligible cost even when polled for idle checks.
  - Units / spaces: Milliseconds of real-world time.
  - Determinism: Returns whatever the system clock reports, so calls made moments apart differ.
  - Keep / change / delete: Change—either inline Date.now, or keep the helper but rename it getTimeNow and allow injecting a test clock to cut indirection.
  - Confidence / assumptions: High confidence; assumes there are no hidden callers outside this file.
  - Notes: You felt the helper was fine and suggested renaming it to getTimeNow; I still recommend inlining Date.now or accepting an injected clock so tests stay predictable.



- `markInteraction`
  - Purpose: Refreshes the menu idle timer whenever menus or settings detect user activity so attract mode does not trigger unexpectedly.
  - Inputs: None.
  - Outputs: None; the helper only updates the saved timestamp.
  - Side effects: Sets state.lastInteractionAt to the current clock reading.
  - Shared state & call sites: Touches state.lastInteractionAt; invoked in src/app.js:229, 648, 1046, 1067 before mode swaps, race-complete phase changes, and non-race key handling.
  - Dependencies: Calls now(), which wraps the browser clock.
  - Edge cases: No extra handling; assumes the shared state exists and does not guard against clock drift.
  - Performance: Constant-time assignment; runs whenever menu interactions happen.
  - Units / spaces: Timestamp stored in milliseconds since epoch.
  - Determinism: No; each call captures the live clock so repeated calls differ.
  - Keep / change / delete: Keep; central helper prevents repeating the timestamp write.
  - Confidence / assumptions: High confidence; assumes Date.now is available and state was initialized.
  - Notes: Previous helpers here all shape the attract-mode idle timer; reviewer noted we could inline to `Date.now()` or rename `now()` to `getTimeNow`, yet centralizing this clock write still makes the idle-timer maintenance easy if we tweak the attract flow.



- `escapeHtml`
  - Purpose: Converts any incoming menu label or score text into safe HTML so UI templates cannot inject tags or break layout.
  - Inputs: `text` (any value; coerced to string; no length guard but intended for short UI snippets).
  - Outputs: Escaped string with `&`, `<`, `>`, `"`, `'` replaced by HTML entities.
  - Side effects: None; leaves globals, files, and timers untouched.
  - Shared state & use: None touched; passed to screen renderers at `src/app.js:260,287,310,321,341,365`, consumed throughout `src/ui/screens.js:5-193`.
  - Dependencies: Built-in `String` conversion plus chained `replace` calls.
  - Edge cases: Handles `null`/`undefined` by returning `'null'`/`'undefined'`; does not trim, truncate, or detect already-escaped text.
  - Performance: Linear per character; only runs when menus build HTML so cost is minimal.
  - Units / spaces: Plain text; no time or coordinate units involved.
  - Determinism: Same input yields same escaped output; running it twice without changes gives the same string.
  - Keep / change / delete: Keep; simplest alternative is to rely on DOM text nodes via `textContent` instead of manual escaping.
  - Confidence / assumptions: High confidence; assumes menu strings stay reasonably short and mostly plain-language characters.
  - Notes: Reviewer confirmed this helper simply keeps player score initials constrained to safe characters like "ABC" so the menu never sees risky markup, and I agree the current implementation is sound while noting we could later simplify by routing menu strings through shared DOM text-node helpers if we consolidate UI rendering.



- `resolveAssetUrlSafe`
  - Purpose: Wraps the world's asset resolver so menu templates can turn relative preview filenames into usable URLs without crashing if the resolver is missing.
  - Inputs: `path` string; accepts falsy (`''`, `null`, `undefined`) and any other value, though only non-empty strings resolve meaningfully.
  - Outputs: Returns the resolved string from `World.resolveAssetUrl(path)` or the original `path`; falls back to `''` when the input is falsy.
  - Side effects: None—no writes to state, storage, or logs; only calls the global resolver when available.
  - Shared state & call sites: Reads global `World` (`src/app.js:105-114`); passed to `AppScreens.vehicleSelect` as `resolveAssetUrl` helper (`src/app.js:331-341`).
  - Dependencies: `World.resolveAssetUrl` when defined; otherwise none.
  - Edge cases: Handles missing/falsey paths, missing resolver, and exceptions thrown by the resolver; does not validate URL format or strip whitespace.
  - Performance: Constant time; called when building vehicle select screen renders.
  - Units / spaces: Operates on raw URL/path strings; no coordinate spaces.
  - Determinism: Deterministic for the same `World.resolveAssetUrl` implementation and input; returning input unchanged if resolver state changes between calls.
  - Keep / change / delete: Keep; simplest tweak would be to inline a null-safe resolver but helper keeps template call clean.
  - Confidence / assumptions: High confidence; assumes `World` global remains stable and resolver returns a string.
  - Notes: Possible reductions include inlining the null-check if we ever centralize asset helpers or renaming to `safeResolveAssetUrl` so its guard role is clearer. Reviewer summary: “Uses `escapeHtml` so filenames render despite odd characters?” Clarification: this helper never touches HTML escaping and instead just delegates to `World.resolveAssetUrl`, so unusual characters flow through unchanged unless the resolver rewrites them. Future update could link it with a path sanitizer if we discover malformed inputs.



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
  - Purpose: Converts a raw millisecond count into a friendly label for menus and scoreboards so players see human-readable times.
  - Inputs: `value` (number in milliseconds; accepts any finite number, clamps negatives to zero, ignores non-finite values).
  - Outputs: String like `'12,345 ms'` or `'--'` when the input is not a usable number.
  - Side effects: None; computes and returns a string without mutating data or logging.
  - Shared state & call sites: Used for leaderboard entries at `src/app.js:182` and race-complete label at `src/app.js:353`.
  - Dependencies: Built-ins `Number.isFinite`, `Math.round`, `Math.max`, `toLocaleString`.
  - Edge cases: Handles non-finite values by returning `'--'` and clamps negatives to zero; does not distinguish DNF/DQ or preserve fractional milliseconds.
  - Performance: Constant-time number formatting when leaderboard rows build or race results render.
  - Units / spaces: Treats input as milliseconds and formats a locale-aware millisecond string.
  - Determinism: Pure for a fixed locale—same input yields the same formatted string; running again has no extra effects.
  - Keep / change / delete: Keep; smallest alternative would be inlining the formatting string where used.
  - Confidence / assumptions: High confidence; assumes default locale formatting is acceptable for all displays.
  - Notes: Reviewer praised the explanation and restated that the helper simply turns raw milliseconds into something readable while asking if we duplicate this logic elsewhere, and my follow-up confirmed the formatter appears only in `src/app.js` today. Should another menu or HUD pathway need the same presentation, we can lift this helper into a shared time-formatting module so we do not drift on style.



- `createLeaderboardEntry`
  - Purpose: Builds a leaderboard row with cleaned initials, numeric time, formatted label, saved date, and empty rank.
  - Inputs: Name text trimmed to three uppercase letters, scoreMs finish time in milliseconds with non-numbers treated as 0, optional date string defaulting to blank.
  - Outputs: Object holding a unique id, cleaned name, raw score, formatted display string, provided date, and null rank.
  - Side effects: None; only makes and returns new data.
  - Shared state touched and where it’s used: No direct shared state; called at src/app.js:212 (local add) and src/app.js:850 (CSV import).
  - Dependencies: Uses formatTimeMs for the display string.
  - Edge cases handled or missed: Covers empty names and non-numeric scores; allows negative scores (shown as 0 ms) and ignores DNF/DQ notes or tie rules beyond later sorting.
  - Performance: Constant-time string and number cleanup when leaderboard entries are made.
  - Units/spaces: Treats scores as milliseconds and display text suffixed with “ms”.
  - Determinism: Fields repeat for the same inputs except for a new unique id each call.
  - Keep / change / delete: Keep; alternative is to inline the object build at the two use sites.
  - Confidence / assumptions: High confidence; assumes the board expects three-letter uppercase initials and millisecond scores.
  - Notes: Reviewer asked, “What actually updates the entry in the .csv file?”—right now nothing writes back, because entries only live in memory while `fetch('data/leaderboard.csv')` seeds the list; if persistence ever arrives we could fold this helper into a loader/saver module or attach a dedicated save routine, but until then the clearest update is to document that gap.



- `recomputeLeaderboardRanks`
  - Purpose: Walks the current leaderboard list and stamps each non-empty entry with its 1-based place so the menu can show accurate ranks after sorting or CSV import.
  - Inputs: `entries` array (defaults to `state.leaderboard.entries`); expects objects shaped like `createLeaderboardEntry`; ignores falsy slots.
  - Outputs: None returned; updates each entry's `rank` property in place.
  - Side effects: Mutates the provided entries; when called with the default, writes directly into shared leaderboard state.
  - Shared state & call sites: Touches `state.leaderboard.entries`; invoked after sorting in `src/app.js:203` and after CSV parsing in `src/app.js:863`.
  - Dependencies: No subordinate calls.
  - Edge cases: Skips holes/nulls but still leaves prior rank on those slots; does not adjust for tied scores beyond list order.
  - Performance: Linear pass over the array whenever leaderboard data changes; trivial cost compared with sorting/loading frequency.
  - Units / spaces: Ranks are simple 1-based integers.
  - Determinism: Deterministic for a fixed input order; repeating without changes is idempotent.
  - Keep / change / delete: Keep; could fold into `sortLeaderboardEntries` but shared reuse by CSV import makes the helper worthwhile.
  - Confidence / assumptions: High confidence; assumes callers already sorted entries and that sparse arrays are rare.
  - Notes: Reviewer summary: "looks good, no notes, likely no need to fold"; I concur and would only revisit consolidation if future refactors merge leaderboard sorting and ranking into a single pass, so keep monitoring but no action required now.



- `sortLeaderboardEntries`
  - Purpose: Keeps the leaderboard ordered so faster times float to the top, currently breaking ties alphabetically for display.
  - Inputs: None explicitly; reads `state.leaderboard.entries` which should contain objects with `score` numbers and `name` strings.
  - Outputs: None; entries end up sorted and re-ranked in place.
  - Side effects: Mutates `state.leaderboard.entries`, updates each entry’s `rank`, and drives highlight behavior after sorting.
  - Shared state & call sites: Touches `state.leaderboard.entries`/`rank`; invoked from `src/app.js:215` after adding a local score and `src/app.js:815` after loading remote scores.
  - Dependencies: Uses Array sort plus `recomputeLeaderboardRanks` to refresh rank numbers.
  - Edge cases: Skips over missing entries, pushes null/undefined records to the end, and resolves equal scores with a name comparison despite not honoring play date order; does not special-case DNFs or impossible scores.
  - Performance: Native Array sort over the current entries list; only runs on leaderboard updates, not every frame.
  - Units / spaces: Compares `score` values measured in milliseconds.
  - Determinism: Yes—same entry data yields the same order and ranks.
  - Keep / change / delete: Keep; could only be inlined alongside the rank refresh at each call site.
  - Confidence / assumptions: High confidence; assumes entries always provide numeric `score` and uppercase `name`.
  - Notes: Reviewer: "Alphabetical ordering on equal scores feels wrong; should favor newer runs so the recent score rises above." Response: Capture a precise play timestamp on each entry and update the comparator to sort by score then newest-first, keeping name as a final fallback so expectations and ranking stay aligned.



- `findLeaderboardEntryIndexById`
  - Purpose: Finds where a saved leaderboard entry sits in the current list so menus can highlight the right racer.
  - Inputs: id (stored entry identifier, usually created when adding to the leaderboard; must be provided).
  - Outputs: Returns the zero-based position in the leaderboard list, or -1 when the id is missing or not found.
  - Side effects: None; only reads shared data.
  - Shared state & call sites: Reads state.leaderboard.entries array sorted in src/app.js:199-205 and appended in src/app.js:212-215; defined in src/app.js:206-210.
  - Dependencies: Uses the built-in findIndex helper on arrays; no other modules.
  - Edge cases: Skips falsy ids and empty slots but does not detect duplicate ids or symbols that no longer exist.
  - Performance: Linear scan of the current entries list; called only when highlight lookup is needed.
  - Units / spaces: Works in array positions; no time or spatial units.
  - Determinism: Same id and state yield the same index; repeated calls do not change data.
  - Keep / change / delete: Keep; lightweight helper that could be folded into leaderboard lookup code if refactored.
  - Confidence / assumptions: High confidence, assuming entries retain their id values.



- `addLeaderboardEntry`
- setMode
  - Purpose: Switches the app between race, menu, attract, and other screens so the right panel is shown and menu focus resets.
  - Inputs: nextMode text label for the target screen; expects known modes such as menu, playing, paused, leaderboard, settings, vehicleSelect, raceComplete, attract; empty or same-as-current values are ignored.
  - Outputs: None returned; function ends after updating shared state and refreshing the menu panel.
  - Side effects: Updates state.mode, zeroes menu indexes when starting play, records the latest interaction time for non-play screens, clears race-complete data when leaving that view, and triggers a fresh menu render.
  - Shared state touched and where it’s used: state.mode plus menu index fields, state.lastInteractionAt (via markInteraction), state.raceComplete (via reset) and menu DOM references; callers at src/app.js:589, 683, 725, 746, 750, 755, 759, 763, 796, 900, 936, 960, 1037, 1054, 1136.
  - Dependencies: markInteraction to refresh the idle timer, resetRaceCompleteState for cleanup, updateMenuLayer to rebuild the visible menu.
  - Edge cases: Ignores falsy mode requests and duplicate mode switches; does not validate unknown mode strings or guard against raceComplete being null.
  - Performance: Constant-time state tweaks plus one menu redraw; only runs when some other action changes screens, not every frame.
  - Units/spaces: Idle timer uses milliseconds when markInteraction runs; all other updates are unitless toggles or zeroed counters.
  - Determinism: Given the same starting state and nextMode, the resulting state changes are predictable; repeated calls with the current mode exit immediately.
  - Keep / change / delete: Keep; central gateway for screen changes, simplest alternative would be splitting into separate per-mode helpers and duplicating logic.
  - Confidence / assumptions: High confidence; assumes updateMenuLayer keeps menus in sync and that callers pass the supported mode names.
  - Purpose: Records a just-finished run on the high-score board by packaging the player initials, time, and today’s date, then reorders the list so the new result appears in place immediately.
  - Inputs: `name` (player-entered initials; trimmed, uppercased, limited to three characters, defaults to `---`); `scoreMs` (finish time in milliseconds; non-finite values fall back to 0).
  - Outputs: Returns the newly minted entry object containing a unique `id` symbol, normalized `name`, numeric `score`, formatted `displayValue`, ISO date stamp, and updated `rank` once sorted.
  - Side effects: Appends to `state.leaderboard.entries` and `.localEntries`, re-sorts the leaderboard (which mutates ranks), stamps the current date, and points `state.leaderboard.highlightId` at the new entry for UI emphasis.
  - Shared state & call sites: Touches `state.leaderboard.entries`, `.localEntries`, and `.highlightId` defined in `src/app.js:55-57`; invoked from `src/app.js:638` when a race completion is finalized.
  - Dependencies: Calls `createLeaderboardEntry` for normalization/formatting, `sortLeaderboardEntries` to reorder ranks, and uses `new Date().toISOString()` for the daily stamp.
  - Edge cases: Handles blank names and invalid times via defaults; does not prevent duplicate submissions, oversized leaderboards, or special cases like DNFs/ties beyond alphabetical ordering.
  - Performance: Triggers an array push plus an `Array.sort` (O(n log n)); runs only upon recording a new local result, not every frame.
  - Units / spaces: Works with times measured in milliseconds and stores dates as `YYYY-MM-DD` strings; positions correspond to leaderboard rank order.
  - Determinism: Non-deterministic because it stamps the current date and creates a fresh `Symbol` id; calling twice with the same input produces distinct entries.
  - Keep / change / delete: Keep; consider renaming to `recordLocalLeaderboardEntry` to clarify that it mutates local state.
  - Confidence / assumptions: High confidence; assumes `state.leaderboard` exists with initialized `entries` and `localEntries` arrays and that sorting stays consistent.



- `setMode`
  - Missing?



- `ensureDom`
  - Purpose: Verifies the menu layer elements exist on the page and saves quick references so later menu updates do not crash.
  - Inputs: Document (current web page; must contain an element with id appMenuLayer); state.dom.menuLayer and state.dom.menuPanel (may be empty on first run).
  - Outputs: Returns nothing; fills state.dom.menuLayer and state.dom.menuPanel with the found elements.
  - Side effects: Throws errors if elements are missing; writes the cached elements into shared state.
  - Shared state touched and where it’s used: Updates state.dom.menuLayer/menuPanel defined at src/app.js:237-248; invoked at src/app.js:392 and src/app.js:1128 before menu rendering and app init.
  - Dependencies: Uses the browser’s built-in element lookup helpers.
  - Edge cases handled or missed: Stops early when elements already saved; throws if elements are absent; does not handle the elements being replaced later.
  - Performance: Two element searches the first time it runs; afterwards the early return avoids extra work.
  - Units / spaces: Works with web page elements only; no numeric units involved.
  - Determinism: Given the same page structure it will always cache the same nodes; reruns do not change anything once stored.
  - Keep / change / delete: Keep; simple guard that could be merged into menu setup if caching is refactored.
  - Confidence / assumptions: High confidence; assumes the menu markup is present before init runs.



- `renderMainMenu`
  - Purpose: Builds the main menu markup by delegating to the shared AppScreens template with the game title, tagline, and current option highlight so the menu panel can be redrawn in one call.【F:src/app.js†L251-L261】
  - Inputs: Reads AppScreens.mainMenu (UI renderer; must be truthy), mainMenuOptions (static list of "Start Race", "Leaderboard", "Settings" entries), and state.mainMenuIndex (current highlight; expected 0–options.length-1).【F:src/app.js†L8-L12】【F:src/app.js†L251-L259】
  - Outputs: Returns the HTML/string produced by AppScreens.mainMenu, which receives title, subtitle, options, and selectedIndex fields.【F:src/app.js†L251-L261】
  - Side effects: None; pure read of state and globals, no DOM writes or state mutation.【F:src/app.js†L251-L261】
  - Shared state & call sites: Reads state.mainMenuIndex initialized in state object and is invoked from updateMenuLayer when state.mode === 'menu'.【F:src/app.js†L42-L65】【F:src/app.js†L401-L404】
  - Dependencies: Calls AppScreens.mainMenu and reuses escapeHtml helper passed as renderer utilities.【F:src/app.js†L251-L261】
  - Edge cases: Returns an empty string when AppScreens.mainMenu is absent, but does not clamp out-of-range selectedIndex or null options.【F:src/app.js†L251-L259】
  - Performance: Constant-time work allocating one object; only runs when updateMenuLayer refreshes the menu (mode changes or interactions).【F:src/app.js†L251-L261】【F:src/app.js†L391-L418】
  - Units / spaces: Works with array indices for menu options; no timing or spatial units involved.【F:src/app.js†L251-L259】
  - Determinism: Given the same state and AppScreens.mainMenu implementation it returns the same markup; no randomness or timers.【F:src/app.js†L251-L261】
  - Keep / change / delete: Keep; thin wrapper keeps updateMenuLayer tidy and could be merged there only if menus are restructured.【F:src/app.js†L251-L261】【F:src/app.js†L401-L404】
  - Confidence / assumptions: High confidence; assumes AppScreens.mainMenu synchronously returns a renderable string.【F:src/app.js†L251-L261】



- `renderLeaderboard`
  - Purpose: Builds the leaderboard screen markup so players can see the top race times and any highlighted recent run.
  - Inputs: No arguments; reads `state.leaderboard.loading`, `error`, `entries`, and `highlightId` (highlight id may be null).
  - Outputs: Returns an HTML string via `AppScreens.leaderboard`, feeding it an array of up to ten `{ rank, name, score, isHighlight }` rows.
  - Side effects: None; it only derives data for rendering.
  - Shared state & call sites: Reads the leaderboard slice of `state`; called by `updateMenuLayer` when `state.mode === 'leaderboard'` (`src/app.js:404`).
  - Dependencies: Delegates to `AppScreens.leaderboard` and passes the local `escapeHtml` helper for safe text output.
  - Edge cases: Falls back to an empty string if the template is missing, keeps blank placeholder rows for null entries, but still ignores DNFs, ties beyond ordering, or runs past the top ten.
  - Performance: Copies and maps at most ten entries per render; only invoked when the menu swaps into leaderboard mode.
  - Units / spaces: Displays `entry.displayValue` strings already formatted in milliseconds and flags highlights with booleans.
  - Determinism: Yes—given the same leaderboard state it produces the same HTML.
  - Keep / change / delete: Keep; simplest tweak would be to share the top-ten limit as a named constant if reuse expands.
  - Confidence / assumptions: High confidence; assumes upstream code keeps `displayValue` current and entries sorted.



- `renderSettings`
  - Purpose: Builds the settings menu text so players see the snow toggle and the back option.
  - Inputs: None directly; reads snowEnabled (expected boolean) and settingsMenuIndex (expected 0–1) from shared state when called.
  - Outputs: Menu text returned by AppScreens.settingsMenu, or an empty string if that screen builder is missing.
  - Side effects: None; it only reads shared values.
  - Shared state touched and where it’s used: Reads state.settings.snowEnabled and state.settingsMenuIndex; invoked by updateMenuLayer at src/app.js:406.
  - Dependencies: Uses AppScreens.settingsMenu and the local escapeHtml function to format labels.
  - Edge cases handled or missed: Skips safely when AppScreens.settingsMenu is absent; does not guard against the settings object being missing or new menu options being added elsewhere.
  - Performance: Constant-time creation of two menu entries; runs only when the menu layer refreshes.
  - Units / spaces: No numeric units; all values are plain menu labels.
  - Determinism: Same state values return the same markup; repeated calls do not change any data.
  - Keep / change / delete: Keep; separation keeps each menu renderer focused, simplest alternative would be merging into a generic renderMenu function.
  - Confidence / assumptions: High confidence; assumes the state always includes the snow flag and menu index.



- `renderPauseMenu`
  - Purpose: Builds the pause overlay markup so the player sees the resume and quit choices whenever play is halted.
  - Inputs: `AppScreens.pauseMenu` template function must exist; `pauseMenuOptions` list of two menu entries (`resume`, `quit`); `state.pauseMenuIndex` zero-based position expected between 0 and options length minus one.
  - Outputs: Returns the pause menu HTML string with the options array and the currently highlighted index passed through.
  - Side effects: None; only reads globals.
  - Shared state touched and call sites: Reads `pauseMenuOptions` (src/app.js:14-17) and `state.pauseMenuIndex` (src/app.js:42-46); invoked inside `updateMenuLayer` when `state.mode === 'paused'` (src/app.js:391-409); index mutated by `changePauseMenuSelection` (src/app.js:533-537), `setMode` (src/app.js:220-235), and `init` (src/app.js:1127-1136).
  - Dependencies: Calls `AppScreens.pauseMenu` with the local `escapeHtml` helper for safe text output.
  - Edge cases: Falls back to an empty string when the pause screen template is missing; otherwise expects the options array to contain entries and does not guard against an out-of-range index (resulting in no item selected).
  - Performance: Maps over two static menu options; runs only when the menu layer redraws during pause transitions or navigation.
  - Units/spaces: Uses zero-based menu positions; no time or world coordinates involved.
  - Determinism: Same inputs and state produce the same markup; repeated calls do not alter data.
  - Keep / change / delete: Keep; already minimal wrapper that could merge into a broader screen renderer during a larger refactor.
  - Confidence / assumptions: High confidence, assuming the global screen renderer keeps returning deterministic markup.
-`renderVehicleSelect`
  - Purpose: Builds the vehicle selection screen model so the menu shows the current carchoice with its name, description, and preview art.
  - Inputs: Reads state.vehicleSelectIndex (any integer, wrapped to the option list) andvehicleOptions entries (array that may be empty).
  - Outputs: HTML string from AppScreens.vehicleSelect with fields title, vehicleLabel,vehicleDescription, optionIndex, optionCount, previewSrc, previewAtlas.
  - Side effects: None; only reads data and calls the renderer.
  - Shared state & call sites: Reads state.vehicleSelectIndex; invoked by updateMenuLayerwhen mode equals "vehicleSelect" at src/app.js:410.
  - Dependencies: AppScreens.vehicleSelect, clampIndex, normalizePreviewAtlas,resolveAssetUrlSafe, escapeHtml.
  - Edge cases: Returns an empty string if the template is missing, wraps negative oroversized indexes, falls back to the first option or blanks when the list is empty, butdoes not handle DNF/DQ flags or malformed preview data beyond nulling it out.
  - Performance: Constant work per call; runs when the menu layer rerenders after mode orselection changes.
  - Units / spaces: optionIndex is zero-based, optionCount is the total options, previewAtlasframe duration is measured in seconds for the sprite.
  - Determinism: Same state and options yield the same HTML and no persistent changes.
  - Keep / change / delete: Keep; simplest alternative is inlining the AppScreens call insideupdateMenuLayer.
  - Confidence / assumptions: High confidence; assumes AppScreens.vehicleSelect returns astring and the vehicle option list stays small.



- `renderAttract`
  - Purpose: Builds the attract-mode panel so the menu layer can show a looping promo video when the player idles.【F:src/app.js†L345-L347】【F:src/app.js†L391-L432】
  - Inputs: No parameters; depends on `AppScreens.attract` existing in the global template bundle.【F:src/app.js†L345-L347】
  - Outputs: Returns the markup from `AppScreens.attract`, populated with `{ videoSrc: 'video/attract-loop.mp4' }`.【F:src/app.js†L345-L347】
  - Side effects: None; simply forwards data to the template and leaves DOM/state untouched.【F:src/app.js†L345-L347】
  - Shared state touched and where it’s used: Touches no shared state; invoked by `updateMenuLayer` whenever `state.mode` switches to `'attract'`.【F:src/app.js†L391-L432】
  - Dependencies: Calls `AppScreens.attract` and relies on `updateMenuLayer` for DOM insertion.【F:src/app.js†L345-L347】【F:src/app.js†L391-L432】
  - Edge cases handled or missed: Falls back to an empty string if the template is missing; does not verify that the referenced video asset loads successfully.【F:src/app.js†L345-L347】
  - Performance: Constant-time string construction; runs only during attract-mode renders.【F:src/app.js†L345-L347】【F:src/app.js†L391-L432】
  - Units / spaces: Works solely with a relative media path; no numeric units.【F:src/app.js†L345-L347】
  - Determinism: Given the same template, returns the same markup and causes no persistent changes.【F:src/app.js†L345-L347】
  - Keep / change / delete: Keep; small wrapper keeps attract rendering logic isolated from `updateMenuLayer`.【F:src/app.js†L345-L347】【F:src/app.js†L391-L432】
  - Confidence / assumptions: High confidence; assumes the template synchronously returns HTML that `updateMenuLayer` will inject.【F:src/app.js†L345-L347】【F:src/app.js†L391-L432】




- `renderRaceComplete`
  - Purpose: Produces the race-complete overlay showing run stats, initials entry state, and reveal phases after a finish.【F:src/app.js†L350-L367】
  - Inputs: No parameters; reads `state.raceComplete` (active flag, phase, letters, confirmations, index, rank) and formats `timeMs` via `formatTimeMs` (non-finite values show as `--`).【F:src/app.js†L42-L65】【F:src/app.js†L166-L170】【F:src/app.js†L350-L364】
  - Outputs: Returns the `AppScreens.raceComplete` markup with `{ active, phase, timeLabel, letters, confirmed, currentIndex, playerRank }`.【F:src/app.js†L350-L367】
  - Side effects: None; performs pure reads and delegates to the template.【F:src/app.js†L350-L367】
  - Shared state touched and where it’s used: Reads the race-complete slice and is called by `updateMenuLayer` when the mode is `'raceComplete'`.【F:src/app.js†L42-L65】【F:src/app.js†L350-L367】【F:src/app.js†L391-L414】
  - Dependencies: Uses `AppScreens.raceComplete`, the local `escapeHtml` helper, and `formatTimeMs` for display formatting.【F:src/app.js†L166-L170】【F:src/app.js†L350-L367】
  - Edge cases handled or missed: Gracefully handles invalid times through `formatTimeMs`, but assumes `letters`/`confirmed` arrays remain aligned and populated elsewhere.【F:src/app.js†L166-L170】【F:src/app.js†L350-L364】
  - Performance: Constant-time object assembly; invoked only when redrawing the race-complete UI.【F:src/app.js†L350-L367】【F:src/app.js†L391-L414】
  - Units / spaces: Displays milliseconds as formatted strings; no spatial units.【F:src/app.js†L166-L170】【F:src/app.js†L350-L364】
  - Determinism: Same state yields identical markup and no side effects.【F:src/app.js†L350-L367】
  - Keep / change / delete: Keep; isolates template wiring from the menu update loop.【F:src/app.js†L350-L367】【F:src/app.js†L391-L414】
  - Confidence / assumptions: High confidence; assumes upstream code maintains `state.raceComplete` consistency.【F:src/app.js†L42-L65】【F:src/app.js†L350-L367】




- `startAttractPlayback`
  - Purpose: Configures and starts the attract-mode `<video>` element whenever the attract screen loads.【F:src/app.js†L369-L377】
  - Inputs: `video` — DOM video element; ignored when falsy.【F:src/app.js†L369-L377】
  - Outputs: No return; kicks off asynchronous playback on the element.【F:src/app.js†L369-L377】
  - Side effects: Sets `loop`, `muted`, and `playsInline` on the video, then calls `play()` while suppressing autoplay promise rejections.【F:src/app.js†L369-L377】
  - Shared state touched and where it’s used: Does not touch `state`; `updateMenuLayer` passes in the queried element when mode switches to attract.【F:src/app.js†L391-L432】
  - Dependencies: Relies on browser media APIs and the surrounding DOM lookup in `updateMenuLayer`.【F:src/app.js†L369-L377】【F:src/app.js†L391-L427】
  - Edge cases handled or missed: Safely no-ops without an element and mutes by default, but cannot force playback when browsers require interaction despite muting.【F:src/app.js†L369-L377】
  - Performance: Constant-time attribute writes; runs only during attract setup.【F:src/app.js†L369-L377】【F:src/app.js†L391-L427】
  - Units / spaces: Works with media playback state; no numeric units.【F:src/app.js†L369-L377】
  - Determinism: Given the same element it always applies the same configuration, though actual playback depends on browser policy.【F:src/app.js†L369-L377】
  - Keep / change / delete: Keep; keeps media setup separate from DOM querying logic.【F:src/app.js†L369-L377】【F:src/app.js†L391-L427】
  - Confidence / assumptions: High confidence; assumes callers pass an `HTMLVideoElement` and muted autoplay is permitted.【F:src/app.js†L369-L377】




- `stopAttractPlayback`
  - Purpose: Pauses and rewinds the cached attract video when exiting attract mode so it restarts cleanly next time.【F:src/app.js†L380-L388】
  - Inputs: None; reads `state.dom.attractVideo` for the stored element reference.【F:src/app.js†L42-L65】【F:src/app.js†L380-L388】
  - Outputs: No return value.【F:src/app.js†L380-L388】
  - Side effects: Calls `pause()` inside a `try/catch` and resets `currentTime` to `0`, tolerating DOM exceptions from detached media elements.【F:src/app.js†L380-L388】
  - Shared state touched and where it’s used: Reads and relies on `state.dom.attractVideo`; `updateMenuLayer` invokes it on every non-attract redraw before clearing the cached reference.【F:src/app.js†L42-L65】【F:src/app.js†L391-L432】
  - Dependencies: Requires the DOM reference tracked by `updateMenuLayer`; no other helpers.【F:src/app.js†L380-L388】【F:src/app.js†L391-L432】
  - Edge cases handled or missed: Gracefully handles missing elements and ignores pause errors; does not await asynchronous pause completion (not needed for UI).【F:src/app.js†L380-L388】
  - Performance: Constant-time cleanup; executed only when leaving attract mode.【F:src/app.js†L380-L388】【F:src/app.js†L391-L432】
  - Units / spaces: Media time in seconds when rewinding to 0; no spatial units.【F:src/app.js†L380-L388】
  - Determinism: Always resets playback state when an element exists; repeated calls keep the video at the start frame.【F:src/app.js†L380-L388】
  - Keep / change / delete: Keep; complements `startAttractPlayback` to avoid stale playback state.【F:src/app.js†L380-L388】【F:src/app.js†L391-L432】
  - Confidence / assumptions: High confidence; assumes only one attract video is tracked via `state.dom`.【F:src/app.js†L42-L65】【F:src/app.js†L380-L388】




- `updateMenuLayer`
  - Purpose: Rebuilds the menu overlay—toggling visibility, rendering the screen for the current mode, and wiring preview/attract media after every UI state change.【F:src/app.js†L391-L432】
  - Inputs: No parameters; reads `state.mode` and cached DOM references (`state.dom.menuLayer`, `state.dom.menuPanel`), calling `ensureDom` to populate them lazily.【F:src/app.js†L220-L249】【F:src/app.js†L391-L432】
  - Outputs: No return; writes HTML into `menuPanel.innerHTML` and updates CSS classes/data attributes on the menu wrapper.【F:src/app.js†L391-L432】
  - Side effects: Mutates DOM classes, datasets, and `state.dom.attractVideo`, and triggers preview/attract helpers to manage media playback.【F:src/app.js†L391-L432】
  - Shared state touched and where it’s used: Reads/writes `state.dom` and depends on `state.mode`; invoked after every mode or selection mutation (`setMode`, `change*Selection`, `changeVehicleSelection`, race-complete letter handlers, `setRaceCompletePhase`, `toggleSnowSetting`, `toggleDebugSetting`, and leaderboard fetch updates).【F:src/app.js†L42-L65】【F:src/app.js†L220-L235】【F:src/app.js†L527-L709】【F:src/app.js†L604-L649】【F:src/app.js†L686-L709】【F:src/app.js†L800-L828】
  - Dependencies: Calls `ensureDom`, screen renderers (`renderMainMenu`, `renderLeaderboard`, `renderSettings`, `renderPauseMenu`, `renderVehicleSelect`, `renderAttract`, `renderRaceComplete`), `setupVehiclePreviewAnimation`, `startAttractPlayback`, and `stopAttractPlayback`.【F:src/app.js†L220-L432】
  - Edge cases handled or missed: Throws if required DOM nodes are missing via `ensureDom`; relies on each renderer to guard absent templates; always resets `innerHTML` (no diffing).【F:src/app.js†L220-L432】
  - Performance: Performs full DOM replacement per call and media queries; triggered on discrete events rather than every frame, so costs stay manageable.【F:src/app.js†L220-L432】【F:src/app.js†L800-L828】
  - Units / spaces: Operates entirely in DOM space; no numeric world units.【F:src/app.js†L391-L432】
  - Determinism: With the same state and templates it produces identical markup and side effects.【F:src/app.js†L220-L432】
  - Keep / change / delete: Keep; central coordination point for menu rendering that could only be split after modularizing UI layers.【F:src/app.js†L220-L432】
  - Confidence / assumptions: High confidence; assumes `ensureDom` succeeds and renderers remain synchronous.【F:src/app.js†L220-L432】




- `applyVehiclePreviewFrame`
  - Purpose: Computes atlas UV offsets for the vehicle preview sprite and updates the element’s background position for the current frame.【F:src/app.js†L434-L443】
  - Inputs: `preview` descriptor containing `{ element, columns, rows, frameCount, frameIndex }`; no-ops on falsy objects or missing elements.【F:src/app.js†L434-L443】
  - Outputs: No return; writes `backgroundPosition` on the element.【F:src/app.js†L434-L443】
  - Side effects: Mutates the preview element’s inline styles to display the selected atlas cell.【F:src/app.js†L434-L443】
  - Shared state touched and where it’s used: Does not touch `state`; called by preview setup and per-frame advance routines that manage `state.dom.vehiclePreview`.【F:src/app.js†L492-L518】
  - Dependencies: Works with the descriptor produced by `setupVehiclePreviewAnimation` and simple arithmetic only.【F:src/app.js†L434-L493】
  - Edge cases handled or missed: Wraps indices safely, handles single-frame sprites by setting 0% offsets, but assumes the element has a mutable `style`.【F:src/app.js†L434-L443】
  - Performance: Constant-time math; invoked once on setup and whenever the animation advances.【F:src/app.js†L434-L518】
  - Units / spaces: Expresses UVs as CSS percentages across atlas columns/rows.【F:src/app.js†L434-L443】
  - Determinism: Same descriptor and frame index produce the same CSS coordinates.【F:src/app.js†L434-L443】
  - Keep / change / delete: Keep; keeps atlas math separate from higher-level animation logic.【F:src/app.js†L434-L518】
  - Confidence / assumptions: High confidence; assumes DOM mutations succeed while the element is connected.【F:src/app.js†L434-L443】




- `setupVehiclePreviewAnimation`
  - Purpose: Locates the vehicle preview element, normalizes atlas metadata, and seeds animation state in `state.dom.vehiclePreview` after rendering the vehicle select screen.【F:src/app.js†L446-L493】
  - Inputs: No parameters; reads `state.mode`, `state.dom.menuPanel`, and element data attributes (`data-columns`, `data-rows`, `data-frame-count`, `data-frame-duration`).【F:src/app.js†L42-L65】【F:src/app.js†L446-L472】
  - Outputs: Stores a descriptor `{ element, columns, rows, frameCount, frameDuration, frameIndex, accumulator }` in `state.dom.vehiclePreview`, or clears it when preview data is missing.【F:src/app.js†L42-L65】【F:src/app.js†L446-L493】
  - Side effects: Adjusts preview element CSS (`backgroundSize`, `backgroundRepeat`, `backgroundPosition`) and updates shared DOM state.【F:src/app.js†L42-L65】【F:src/app.js†L446-L493】
  - Shared state touched and where it’s used: Writes `state.dom.vehiclePreview`; `updateMenuLayer` invokes it after injecting vehicle select markup.【F:src/app.js†L42-L65】【F:src/app.js†L420-L493】
  - Dependencies: Uses dataset parsing, the global default `DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION`, and `applyVehiclePreviewFrame` to paint the first frame.【F:src/app.js†L40-L493】
  - Edge cases handled or missed: Handles missing panel, absent preview element, invalid numbers, and static sprites by clearing state and resetting background; assumes background images are available externally.【F:src/app.js†L446-L493】
  - Performance: Runs query selectors and simple math per menu refresh; only triggered when the vehicle select UI is rendered.【F:src/app.js†L446-L493】
  - Units / spaces: Columns/rows describe atlas grid counts; frame duration measured in seconds (defaults to 1/24).【F:src/app.js†L40-L493】
  - Determinism: Same DOM attributes yield identical descriptors and CSS adjustments.【F:src/app.js†L446-L493】
  - Keep / change / delete: Keep; encapsulates DOM parsing and state seeding separate from animation ticking.【F:src/app.js†L420-L493】
  - Confidence / assumptions: High confidence; assumes preview markup supplies the documented data attributes when present.【F:src/app.js†L446-L493】




- `updateVehiclePreviewAnimation`
  - Purpose: Advances the vehicle preview sprite animation over time while the vehicle select screen is active.【F:src/app.js†L496-L518】
  - Inputs: `dt` — elapsed seconds from the renderer loop (renderer clamps to ≤0.25 s).【F:src/render.js†L2103-L2127】【F:src/app.js†L496-L518】
  - Outputs: No return; updates the descriptor’s `frameIndex`/`accumulator` and refreshes the element via `applyVehiclePreviewFrame`.【F:src/app.js†L496-L518】
  - Side effects: Mutates `state.dom.vehiclePreview` and its element styles; clears the descriptor when the element disappears or the mode changes.【F:src/app.js†L42-L65】【F:src/app.js†L496-L518】
  - Shared state touched and where it’s used: Reads and writes `state.dom.vehiclePreview`; called each frame by `step`, with early exits outside vehicle select.【F:src/app.js†L42-L65】【F:src/app.js†L496-L518】【F:src/app.js†L1106-L1124】
  - Dependencies: Requires the descriptor built by `setupVehiclePreviewAnimation`, the default duration constant, and `applyVehiclePreviewFrame`.【F:src/app.js†L40-L518】
  - Edge cases handled or missed: Handles missing preview, disconnected elements, and non-positive frame durations; assumes atlas metadata remains valid while active.【F:src/app.js†L496-L518】
  - Performance: Constant-time math per frame; active only during vehicle selection so workload is minimal.【F:src/app.js†L496-L518】【F:src/app.js†L1106-L1124】
  - Units / spaces: `dt` and frame durations in seconds; frame indices wrap modulo the sprite count.【F:src/render.js†L2103-L2127】【F:src/app.js†L496-L518】
  - Determinism: Deterministic progression for a given descriptor and `dt` sequence.【F:src/app.js†L496-L518】
  - Keep / change / delete: Keep; separates animation ticking from DOM setup for clarity and potential reuse.【F:src/app.js†L496-L518】【F:src/app.js†L420-L518】
  - Confidence / assumptions: High confidence; assumes `dt` originates from the renderer loop and the descriptor stays in sync with the DOM element.【F:src/render.js†L2103-L2127】【F:src/app.js†L496-L518】




- `clampIndex`
  - Purpose: Wraps an index into the valid `0…total-1` range so menu selections cycle correctly in both directions.【F:src/app.js†L521-L525】
  - Inputs: `index` (integer, may be negative/out of range) and `total` (expected positive integer; returns 0 when `total <= 0`).【F:src/app.js†L521-L525】
  - Outputs: Returns the wrapped index computed via modular arithmetic.【F:src/app.js†L521-L525】
  - Side effects: None; pure calculation.【F:src/app.js†L521-L525】
  - Shared state touched and where it’s used: Touches no state; reused by renderers and selection helpers for vehicle, settings, pause, and main menus.【F:src/app.js†L328-L599】
  - Dependencies: Pure helper; no external modules.【F:src/app.js†L521-L525】
  - Edge cases handled or missed: Returns 0 when `total <= 0`; assumes callers pass numeric totals (true for current usage).【F:src/app.js†L521-L548】
  - Performance: Constant-time arithmetic.【F:src/app.js†L521-L525】
  - Units / spaces: Operates on abstract index counts; no spatial units.【F:src/app.js†L521-L525】
  - Determinism: Deterministic for any given inputs.【F:src/app.js†L521-L525】
  - Keep / change / delete: Keep; centralizes wrap logic shared across menu flows.【F:src/app.js†L328-L599】
  - Confidence / assumptions: High confidence; assumes menus provide non-zero totals when active.【F:src/app.js†L521-L599】



- `changeMainMenuSelection`
  - Purpose: Moves the highlighted option in the main menu and redraws the panel accordingly.【F:src/app.js†L527-L531】
  - Inputs: `delta` — signed step (typically ±1) provided by navigation handlers.【F:src/app.js†L527-L531】【F:src/app.js†L867-L889】
  - Outputs: No return; updates `state.mainMenuIndex` and triggers a render.【F:src/app.js†L527-L531】
  - Side effects: Mutates `state.mainMenuIndex` and calls `updateMenuLayer`.【F:src/app.js†L42-L65】【F:src/app.js†L527-L531】
  - Shared state touched and where it’s used: Writes the menu index; invoked by `handleMenuNavigation`, which is wired to keyboard events in `handleMenuKeyDown`.【F:src/app.js†L42-L65】【F:src/app.js†L867-L895】
  - Dependencies: Uses `mainMenuOptions.length`, `clampIndex`, and `updateMenuLayer`.【F:src/app.js†L8-L12】【F:src/app.js†L521-L531】
  - Edge cases handled or missed: Wraps around automatically; does not guard against an empty options list (currently static and non-empty).【F:src/app.js†L8-L12】【F:src/app.js†L527-L531】
  - Performance: Constant-time; runs on each menu navigation key press.【F:src/app.js†L527-L531】【F:src/app.js†L867-L889】
  - Units / spaces: Integer indices only.【F:src/app.js†L527-L531】
  - Determinism: Same starting index and delta yield the same wrapped result.【F:src/app.js†L527-L531】
  - Keep / change / delete: Keep; encapsulates navigation updates separate from event handling.【F:src/app.js†L527-L531】【F:src/app.js†L867-L895】
  - Confidence / assumptions: High confidence; assumes keyboard handlers provide ±1 deltas and the options array remains stable.【F:src/app.js†L8-L12】【F:src/app.js†L867-L895】




- `changePauseMenuSelection`
  - Purpose: Rotates the pause menu highlight between “Resume” and “Quit to Menu.”【F:src/app.js†L533-L537】
  - Inputs: `delta` — signed step from pause navigation handlers.【F:src/app.js†L533-L537】【F:src/app.js†L871-L993】
  - Outputs: No return.【F:src/app.js†L533-L537】
  - Side effects: Updates `state.pauseMenuIndex` and calls `updateMenuLayer`.【F:src/app.js†L42-L65】【F:src/app.js†L533-L537】
  - Shared state touched and where it’s used: Writes the pause index; invoked via `handlePauseNavigation` from `handlePauseKeyDown`.【F:src/app.js†L42-L65】【F:src/app.js†L871-L993】
  - Dependencies: Relies on `pauseMenuOptions`, `clampIndex`, and `updateMenuLayer`.【F:src/app.js†L14-L17】【F:src/app.js†L521-L537】
  - Edge cases handled or missed: Wraps across the two static entries; does not expect an empty list.【F:src/app.js†L14-L17】【F:src/app.js†L533-L537】
  - Performance: Constant-time per navigation input.【F:src/app.js†L533-L537】
  - Units / spaces: Integer indices.【F:src/app.js†L533-L537】
  - Determinism: Deterministic wrap behavior.【F:src/app.js†L533-L537】
  - Keep / change / delete: Keep; mirrors other selection helpers for consistency.【F:src/app.js†L533-L537】【F:src/app.js†L871-L993】
  - Confidence / assumptions: High confidence; assumes pause menu remains two options deep.【F:src/app.js†L14-L17】【F:src/app.js†L871-L993】




- `changeSettingsSelection`
  - Purpose: Toggles the highlighted entry within the settings menu (snow toggle vs. back).【F:src/app.js†L539-L543】
  - Inputs: `delta` — signed navigation step from settings handlers.【F:src/app.js†L539-L543】【F:src/app.js†L875-L936】
  - Outputs: No return.【F:src/app.js†L539-L543】
  - Side effects: Mutates `state.settingsMenuIndex` and refreshes the menu.【F:src/app.js†L42-L65】【F:src/app.js†L539-L543】
  - Shared state touched and where it’s used: Writes the settings index; called by `handleSettingsNavigation` and indirectly by `handleSettingsKeyDown`.【F:src/app.js†L42-L65】【F:src/app.js†L875-L936】
  - Dependencies: Uses `settingsMenuKeys`, `clampIndex`, and `updateMenuLayer`.【F:src/app.js†L38-L38】【F:src/app.js†L521-L543】
  - Edge cases handled or missed: Wraps between the two defined entries; if more keys were added it would still wrap but labels must stay synchronized manually.【F:src/app.js†L38-L38】【F:src/app.js†L539-L543】
  - Performance: Constant-time per key press.【F:src/app.js†L539-L543】
  - Units / spaces: Integer indices.【F:src/app.js†L539-L543】
  - Determinism: Deterministic wrap logic.【F:src/app.js†L539-L543】
  - Keep / change / delete: Keep; aligns with other menu helpers.【F:src/app.js†L539-L543】【F:src/app.js†L875-L936】
  - Confidence / assumptions: High confidence; assumes settings menu keys stay in sync with template options.【F:src/app.js†L38-L38】【F:src/app.js†L539-L543】




- `changeVehicleSelection`
  - Purpose: Steps the selected vehicle highlight and rerenders the selection screen.【F:src/app.js†L545-L549】
  - Inputs: `delta` — signed step from left/right vehicle navigation.【F:src/app.js†L545-L549】【F:src/app.js†L943-L957】
  - Outputs: No return.【F:src/app.js†L545-L549】
  - Side effects: Updates `state.vehicleSelectIndex` (when vehicles exist) and calls `updateMenuLayer`.【F:src/app.js†L42-L65】【F:src/app.js†L545-L549】
  - Shared state touched and where it’s used: Writes the vehicle selection index; invoked by `handleVehicleSelectKeyDown` on arrow keys.【F:src/app.js†L42-L65】【F:src/app.js†L943-L969】
  - Dependencies: Uses `vehicleOptions.length`, `clampIndex`, and `updateMenuLayer`, returning early when no vehicles are available.【F:src/app.js†L19-L36】【F:src/app.js†L521-L549】
  - Edge cases handled or missed: No-ops when the list is empty; does not skip null entries beyond what `clampIndex` provides.【F:src/app.js†L19-L36】【F:src/app.js†L545-L549】
  - Performance: Constant-time; triggered on navigation input only.【F:src/app.js†L545-L549】【F:src/app.js†L943-L957】
  - Units / spaces: Integer indices into the vehicle array.【F:src/app.js†L545-L549】
  - Determinism: Same delta and list state lead to the same wrapped result.【F:src/app.js†L545-L549】
  - Keep / change / delete: Keep; small helper keeps the key handler focused on input flow.【F:src/app.js†L545-L549】【F:src/app.js†L943-L969】
  - Confidence / assumptions: High confidence; assumes the vehicle list stays short and static during selection.【F:src/app.js†L19-L36】【F:src/app.js†L545-L549】




- `getVehicleOptionByKey`
  - Purpose: Looks up a vehicle configuration by its key so selection logic can retrieve the full option payload.【F:src/app.js†L552-L555】
  - Inputs: `key` — string identifier; returns `null` for falsy keys.【F:src/app.js†L552-L555】
  - Outputs: Matching vehicle option object or `null`.【F:src/app.js†L552-L555】
  - Side effects: None; pure search over `vehicleOptions`.【F:src/app.js†L552-L555】
  - Shared state touched and where it’s used: Reads the module-level `vehicleOptions`; consumed by `applyVehicleSelection`.【F:src/app.js†L19-L36】【F:src/app.js†L557-L575】
  - Dependencies: None beyond the array in scope.【F:src/app.js†L552-L555】
  - Edge cases handled or missed: Ignores falsy keys and tolerates `null` entries; linear scan could become expensive if the options list grows significantly (currently tiny).【F:src/app.js†L19-L36】【F:src/app.js†L552-L555】
  - Performance: O(n) over the vehicle list; presently negligible with two entries.【F:src/app.js†L19-L36】【F:src/app.js†L552-L555】
  - Units / spaces: Works with string identifiers; no spatial units.【F:src/app.js†L552-L555】
  - Determinism: Returns the first matching entry consistently.【F:src/app.js†L552-L555】
  - Keep / change / delete: Keep; adequate for the small dataset (could shift to a keyed map if vehicles expand).【F:src/app.js†L19-L36】【F:src/app.js†L552-L555】
  - Confidence / assumptions: High confidence; assumes keys remain unique.【F:src/app.js†L19-L36】【F:src/app.js†L552-L555】




- `applyVehicleSelection`
  - Purpose: Persists the player’s vehicle choice and swaps the gameplay texture to match that selection.【F:src/app.js†L557-L575】
  - Inputs: `vehicleKey` — target option key; falls back to the first option if lookup fails.【F:src/app.js†L557-L575】
  - Outputs: No return.【F:src/app.js†L557-L575】
  - Side effects: Updates `state.selectedVehicleKey`, syncs `state.vehicleSelectIndex`, and sets `World.assets.textures.playerVehicle` to the chosen atlas or fallback texture.【F:src/app.js†L19-L65】【F:src/app.js†L557-L575】
  - Shared state touched and where it’s used: Mutates selection state and rendering textures; invoked from `startRace` and from `init` to align defaults.【F:src/app.js†L19-L65】【F:src/app.js†L723-L734】【F:src/app.js†L1134-L1138】
  - Dependencies: Uses `getVehicleOptionByKey`, `clampIndex`, and the `World.assets.textures` map to update the active sprite sheet.【F:src/app.js†L552-L575】
  - Edge cases handled or missed: Falls back to the first option if lookup fails and only reassigns textures when an atlas or fallback is available; logs nothing if both are missing.【F:src/app.js†L557-L575】
  - Performance: Linear search to find the option plus constant assignments; called infrequently on selection or startup.【F:src/app.js†L557-L575】【F:src/app.js†L723-L734】
  - Units / spaces: Works with texture keys and array indices; no spatial units.【F:src/app.js†L557-L575】
  - Determinism: Same key and texture set lead to the same state mutations.【F:src/app.js†L557-L575】
  - Keep / change / delete: Keep; centralizes selection + texture wiring logic reused by race start and bootstrapping.【F:src/app.js†L557-L575】【F:src/app.js†L723-L734】【F:src/app.js†L1134-L1138】
  - Confidence / assumptions: High confidence; assumes textures have been loaded into `World.assets` before invocation.【F:src/app.js†L557-L575】




- `showVehicleSelect`
  - Purpose: Enters the vehicle selection screen or starts a race immediately when no vehicles are defined.【F:src/app.js†L577-L589】
  - Inputs: None; reads `vehicleOptions`, `state.selectedVehicleKey`, and `state.vehicleSelectIndex`.【F:src/app.js†L19-L65】【F:src/app.js†L577-L589】
  - Outputs: No return.【F:src/app.js†L577-L589】
  - Side effects: Calls `startRace()` if no vehicles exist; otherwise updates `state.vehicleSelectIndex` and switches mode to `'vehicleSelect'`.【F:src/app.js†L220-L235】【F:src/app.js†L577-L589】
  - Shared state touched and where it’s used: Mutates selection index and mode; triggered from `activateMainMenuSelection` when the “Start Race” menu option is confirmed.【F:src/app.js†L42-L65】【F:src/app.js†L769-L778】
  - Dependencies: Uses `vehicleOptions.findIndex`, `clampIndex`, `startRace`, and `setMode`.【F:src/app.js†L220-L589】
  - Edge cases handled or missed: Auto-starts when the list is empty and clamps indices even if previous state was out of range; does not guard against duplicate vehicle keys.【F:src/app.js†L577-L589】
  - Performance: Constant-time operations over the tiny options array; runs on menu activation only.【F:src/app.js†L577-L589】【F:src/app.js†L769-L778】
  - Units / spaces: Integer indices and mode strings.【F:src/app.js†L577-L589】
  - Determinism: Same state triggers the same start or mode switch.【F:src/app.js†L577-L589】
  - Keep / change / delete: Keep; encapsulates race-start entry logic separate from the menu activation handler.【F:src/app.js†L577-L589】【F:src/app.js†L769-L778】
  - Confidence / assumptions: High confidence; assumes `startRace` can safely run before asynchronous gameplay setup finishes.【F:src/app.js†L577-L734】




- `activateVehicleSelection`
  - Purpose: Confirms the highlighted vehicle and begins the race with that selection (or defaults when no vehicles exist).【F:src/app.js†L592-L602】
  - Inputs: None; reads `vehicleOptions` and `state.vehicleSelectIndex`.【F:src/app.js†L19-L65】【F:src/app.js†L592-L602】
  - Outputs: No return.【F:src/app.js†L592-L602】
  - Side effects: Calls `startRace` with the selected vehicle key, or falls back to `startRace()` when the list is empty.【F:src/app.js†L592-L602】
  - Shared state touched and where it’s used: Reads selection state; invoked by `handleVehicleSelectKeyDown` when confirm keys are pressed.【F:src/app.js†L42-L65】【F:src/app.js†L943-L957】
  - Dependencies: Uses `clampIndex`, the vehicle options array, and `startRace`.【F:src/app.js†L521-L602】
  - Edge cases handled or missed: Skips action if the clamped option is falsy; relies on `startRace` to handle downstream failures.【F:src/app.js†L592-L602】
  - Performance: Constant-time selection; executed only on confirmation input.【F:src/app.js†L592-L602】【F:src/app.js†L943-L957】
  - Units / spaces: Integer indices and vehicle keys.【F:src/app.js†L592-L602】
  - Determinism: Same highlighted vehicle yields the same start call.【F:src/app.js†L592-L602】
  - Keep / change / delete: Keep; keeps keyboard handler concise and delegates to shared race-start logic.【F:src/app.js†L592-L602】【F:src/app.js†L943-L957】
  - Confidence / assumptions: High confidence; assumes `startRace` handles asynchronous scene reset and game start robustly.【F:src/app.js†L592-L734】



- `adjustCurrentNameLetter`
  - Purpose: Rotates the currently editable leaderboard initial upward or downward during name entry.【F:src/app.js†L604-L617】
  - Inputs: `delta` — signed step (±1) applied to the alphabet index.【F:src/app.js†L604-L617】【F:src/app.js†L1010-L1019】
  - Outputs: No return.【F:src/app.js†L604-L617】
  - Side effects: Updates `state.raceComplete.letters` and `playerName`, then rerenders the menu when in the entry phase.【F:src/app.js†L42-L65】【F:src/app.js†L604-L617】
  - Shared state touched and where it’s used: Mutates the race-complete slice; invoked from `handleRaceCompleteKeyDown` on up/down input during the entry phase.【F:src/app.js†L42-L65】【F:src/app.js†L995-L1019】
  - Dependencies: Uses `NAME_ALPHABET` for character lookup and `updateMenuLayer` to refresh the UI.【F:src/app.js†L67-L67】【F:src/app.js†L604-L617】
  - Edge cases handled or missed: Ensures race-complete is active, in entry phase, index in range, and letter not already confirmed; wraps alphabet changes via modulo but cannot edit variable-length names (fixed three letters).【F:src/app.js†L604-L617】
  - Performance: Constant-time string manipulation per key press.【F:src/app.js†L604-L617】【F:src/app.js†L995-L1019】
  - Units / spaces: Alphabet positions 0–25 only.【F:src/app.js†L604-L617】
  - Determinism: Same delta and state yield identical letter updates.【F:src/app.js†L604-L617】
  - Keep / change / delete: Keep; isolates letter rotation logic from event handlers.【F:src/app.js†L604-L617】【F:src/app.js†L995-L1019】
  - Confidence / assumptions: High confidence; assumes `NAME_ALPHABET` stays uppercase A–Z and letters array length matches the entry length.【F:src/app.js†L67-L67】【F:src/app.js†L604-L617】




- `lockCurrentNameLetter`
  - Purpose: Confirms the active initial and either advances editing to the next slot or finalizes the leaderboard entry.【F:src/app.js†L620-L633】
  - Inputs: None; reads `state.raceComplete.currentIndex` and arrays.【F:src/app.js†L620-L633】
  - Outputs: No return.【F:src/app.js†L620-L633】
  - Side effects: Marks the letter as confirmed, updates `playerName`, moves focus to the next letter, and triggers a UI refresh; calls `finalizeRaceCompleteEntry` when the last slot is confirmed.【F:src/app.js†L620-L633】
  - Shared state touched and where it’s used: Mutates the race-complete slice; invoked by `handleRaceCompleteKeyDown` when the player presses the confirm key during entry.【F:src/app.js†L42-L65】【F:src/app.js†L995-L1033】
  - Dependencies: Uses `finalizeRaceCompleteEntry` and `updateMenuLayer`.【F:src/app.js†L620-L633】
  - Edge cases handled or missed: Validates active entry phase and bounds; does not reset confirmed letters if the player cancels (handled by broader flow).【F:src/app.js†L620-L633】
  - Performance: Constant-time array updates; runs once per confirmation input.【F:src/app.js†L620-L633】【F:src/app.js†L995-L1033】
  - Units / spaces: Works with indices into the three-letter array.【F:src/app.js†L620-L633】
  - Determinism: Deterministic for a given state and index.【F:src/app.js†L620-L633】
  - Keep / change / delete: Keep; encapsulates entry confirmation logic away from key handling.【F:src/app.js†L620-L633】【F:src/app.js†L995-L1033】
  - Confidence / assumptions: High confidence; assumes exactly three-letter initials and that `finalizeRaceCompleteEntry` handles persistence.【F:src/app.js†L620-L642】




- `finalizeRaceCompleteEntry`
  - Purpose: Commits the entered initials and time to the leaderboard, records the new entry id/rank, and advances the reveal sequence.【F:src/app.js†L635-L642】
  - Inputs: None; reads `state.raceComplete` and calls `addLeaderboardEntry`.【F:src/app.js†L211-L217】【F:src/app.js†L635-L642】
  - Outputs: No return.【F:src/app.js†L635-L642】
  - Side effects: Updates `playerName`, stores `entryId`/`playerRank`, and switches phase to `'revealPlayer'`.【F:src/app.js†L635-L642】
  - Shared state touched and where it’s used: Mutates the race-complete slice; called only by `lockCurrentNameLetter` when the last letter is confirmed.【F:src/app.js†L631-L642】
  - Dependencies: Uses `addLeaderboardEntry` (which appends and sorts the leaderboard) and `setRaceCompletePhase`.【F:src/app.js†L211-L217】【F:src/app.js†L635-L649】
  - Edge cases handled or missed: Rebuilds the player name from letters before saving; assumes the leaderboard addition succeeds and returns an entry with `id` and `rank`.【F:src/app.js†L635-L642】
  - Performance: Constant work plus leaderboard insertion handled inside `addLeaderboardEntry`; runs once per race completion.【F:src/app.js†L211-L217】【F:src/app.js†L635-L642】
  - Units / spaces: Works with milliseconds for the score (`rc.timeMs`).【F:src/app.js†L635-L642】
  - Determinism: Same letters and time create the same leaderboard entry (aside from unique symbol ids).【F:src/app.js†L211-L217】【F:src/app.js†L635-L642】
  - Keep / change / delete: Keep; cleanly separates persistence from input handling.【F:src/app.js†L631-L642】
  - Confidence / assumptions: High confidence; assumes leaderboard arrays remain mutable and accessible.【F:src/app.js†L211-L217】【F:src/app.js†L635-L642】




- `setRaceCompletePhase`
  - Purpose: Updates the race-complete state machine, resetting the phase timer and refreshing the UI for the next reveal step.【F:src/app.js†L644-L649】
  - Inputs: `phase` — string identifier (`'entry'`, `'revealPlayer'`, `'revealTop'`, `'complete'`, etc.).【F:src/app.js†L644-L649】
  - Outputs: No return.【F:src/app.js†L644-L649】
  - Side effects: Mutates `state.raceComplete.phase` and `timer`, marks the app as recently interacted, and calls `updateMenuLayer`.【F:src/app.js†L42-L65】【F:src/app.js†L92-L94】【F:src/app.js†L644-L649】
  - Shared state touched and where it’s used: Adjusts the race-complete slice; invoked from `finalizeRaceCompleteEntry`, `advanceRaceCompleteSequence`, and `updateRaceComplete`.【F:src/app.js†L635-L677】
  - Dependencies: Uses `markInteraction` and `updateMenuLayer`.【F:src/app.js†L92-L94】【F:src/app.js†L644-L649】
  - Edge cases handled or missed: Does not validate the incoming phase; assumes callers provide a valid string and that resetting the timer to 0 is enough for transitions.【F:src/app.js†L644-L649】
  - Performance: Constant-time; invoked a few times per race completion.【F:src/app.js†L644-L649】
  - Units / spaces: Timer measured in seconds accumulated elsewhere.【F:src/app.js†L644-L677】
  - Determinism: Deterministic assignment for a given phase input.【F:src/app.js†L644-L649】
  - Keep / change / delete: Keep; single point of truth for phase transitions and timer resets.【F:src/app.js†L644-L649】
  - Confidence / assumptions: High confidence; assumes repeated calls stay inexpensive and `updateMenuLayer` handles the redraw cost.【F:src/app.js†L644-L649】




- `advanceRaceCompleteSequence`
  - Purpose: Steps the post-race reveal sequence forward or exits to attract mode when complete.【F:src/app.js†L652-L658】
  - Inputs: None; reads `state.raceComplete.phase`.【F:src/app.js†L652-L658】
  - Outputs: No return.【F:src/app.js†L652-L658】
  - Side effects: Calls `setRaceCompletePhase` for transitions or `goToAttract` once the `'complete'` phase is reached.【F:src/app.js†L652-L658】
  - Shared state touched and where it’s used: Indirectly mutates phase via `setRaceCompletePhase`; triggered by `handleRaceCompleteKeyDown` when the player confirms after entries are locked.【F:src/app.js†L652-L658】【F:src/app.js†L995-L1033】
  - Dependencies: Uses `setRaceCompletePhase` and `goToAttract`.【F:src/app.js†L644-L684】
  - Edge cases handled or missed: Handles the known sequence (`revealPlayer` → `revealTop` → `complete`); other phases are ignored and produce no change.【F:src/app.js†L652-L658】
  - Performance: Constant-time branching.【F:src/app.js†L652-L658】
  - Units / spaces: Operates on string states only.【F:src/app.js†L652-L658】
  - Determinism: Deterministic transitions for a given current phase.【F:src/app.js†L652-L658】
  - Keep / change / delete: Keep; keeps phase logic out of the key handler.【F:src/app.js†L652-L658】【F:src/app.js†L995-L1033】
  - Confidence / assumptions: High confidence; assumes only the documented phases reach this helper.【F:src/app.js†L652-L658】




- `updateRaceComplete`
  - Purpose: Runs the timed progression for post-race reveals, advancing phases after fixed delays and eventually returning to attract mode.【F:src/app.js†L663-L677】
  - Inputs: `dt` — seconds since the previous step (renderer loop clamps to ≤0.25 s).【F:src/render.js†L2103-L2127】【F:src/app.js†L663-L677】
  - Outputs: No return.【F:src/app.js†L663-L677】
  - Side effects: Increments `state.raceComplete.timer`, triggers `setRaceCompletePhase` when thresholds (3 s, 2.5 s) pass, or calls `goToAttract` when the sequence ends.【F:src/app.js†L663-L684】
  - Shared state touched and where it’s used: Mutates the race-complete timer/phase; called each frame by `step` while mode is `'raceComplete'`.【F:src/app.js†L42-L65】【F:src/app.js†L663-L677】【F:src/app.js†L1106-L1124】
  - Dependencies: Relies on `setRaceCompletePhase` and `goToAttract`.【F:src/app.js†L663-L684】
  - Edge cases handled or missed: Guards against inactive states and only runs for reveal/complete phases; timer continues accumulating until phase changes reset it.【F:src/app.js†L663-L677】
  - Performance: Constant work per frame; active only during the short post-race sequence.【F:src/app.js†L663-L677】【F:src/app.js†L1106-L1124】
  - Units / spaces: Time measured in seconds; no spatial units.【F:src/app.js†L663-L677】
  - Determinism: Deterministic progression given consistent `dt` inputs.【F:src/app.js†L663-L677】
  - Keep / change / delete: Keep; encapsulates timer thresholds separate from the render loop.【F:src/app.js†L663-L677】【F:src/app.js†L1106-L1124】
  - Confidence / assumptions: High confidence; assumes `dt` originates from the renderer loop and phases start with `timer = 0`.【F:src/render.js†L2103-L2127】【F:src/app.js†L644-L677】




- `goToAttract`
  - Purpose: Switches the application into attract mode so the idle video can play.【F:src/app.js†L682-L684】
  - Inputs: None.【F:src/app.js†L682-L684】
  - Outputs: No return.【F:src/app.js†L682-L684】
  - Side effects: Calls `setMode('attract')`, which updates `state.mode` and triggers a menu redraw.【F:src/app.js†L220-L235】【F:src/app.js†L682-L684】
  - Shared state touched and where it’s used: Indirectly mutates mode state; invoked from race-complete flow, idle timeout logic, and attract key handler to centralize the transition.【F:src/app.js†L659-L1121】
  - Dependencies: Uses `setMode`; no other helpers.【F:src/app.js†L220-L235】【F:src/app.js†L682-L684】
  - Edge cases handled or missed: Relies on `setMode` to ignore redundant transitions and reset race-complete state as needed.【F:src/app.js†L220-L235】【F:src/app.js†L682-L684】
  - Performance: Constant-time mode switch.【F:src/app.js†L682-L684】
  - Units / spaces: Operates on mode strings only.【F:src/app.js†L682-L684】
  - Determinism: Deterministic state change given the same prior mode.【F:src/app.js†L682-L684】
  - Keep / change / delete: Keep; clarifies intent at call sites and centralizes the attract transition.【F:src/app.js†L659-L1121】
  - Confidence / assumptions: High confidence; assumes `setMode` handles any cleanup required when leaving other modes.【F:src/app.js†L220-L235】【F:src/app.js†L682-L684】



- `toggleSnowSetting`
  - Purpose: Flips the snow visual-effect toggle and refreshes the settings menu display.【F:src/app.js†L686-L689】
  - Inputs: None; reads `state.settings.snowEnabled`.【F:src/app.js†L42-L65】【F:src/app.js†L686-L689】
  - Outputs: No return.【F:src/app.js†L686-L689】
  - Side effects: Inverts the boolean flag and calls `updateMenuLayer` so the menu reflects the new value.【F:src/app.js†L686-L689】
  - Shared state touched and where it’s used: Mutates the settings slice; invoked by the settings menu activation handler and arrow key handler when the snow option is focused.【F:src/app.js†L791-L936】
  - Dependencies: Relies on `updateMenuLayer`; gameplay systems read the flag through `App.isSnowEnabled()`.【F:src/app.js†L686-L689】【F:src/app.js†L1140-L1146】
  - Edge cases handled or missed: Simply toggles the flag; persistence across sessions is not implemented.【F:src/app.js†L686-L689】
  - Performance: Constant-time flip executed on menu interaction only.【F:src/app.js†L686-L689】【F:src/app.js†L791-L936】
  - Units / spaces: Boolean flag only.【F:src/app.js†L686-L689】
  - Determinism: Deterministic toggle for each invocation.【F:src/app.js†L686-L689】
  - Keep / change / delete: Keep; minimal helper keeps UI logic tidy.【F:src/app.js†L686-L689】【F:src/app.js†L791-L936】
  - Confidence / assumptions: High confidence; assumes snow-enabled state is consumed elsewhere as a simple boolean.【F:src/app.js†L686-L689】【F:src/app.js†L1140-L1146】




- `applyDebugModeSetting`
  - Purpose: Pushes the debug-mode toggle from settings into the shared `Config.debug.mode` flag used by rendering diagnostics.【F:src/app.js†L691-L699】
  - Inputs: None; reads `state.settings.debugEnabled` and the global `Config.debug` object.【F:src/app.js†L2-L5】【F:src/app.js†L42-L65】【F:src/app.js†L691-L699】
  - Outputs: No return.【F:src/app.js†L691-L699】
  - Side effects: Mutates `Config.debug.mode`, catching and logging any assignment failures.【F:src/app.js†L691-L699】
  - Shared state touched and where it’s used: Reads settings state and writes to `Config.debug`, which other modules consult for debug rendering behavior.【F:src/app.js†L2-L5】【F:src/app.js†L691-L699】
  - Dependencies: Depends on the global `Config` object and console logging for error reporting.【F:src/app.js†L2-L5】【F:src/app.js†L691-L699】
  - Edge cases handled or missed: Verifies `Config.debug` is an object before writing and swallows exceptions; does not persist the flag beyond runtime.【F:src/app.js†L691-L699】
  - Performance: Constant-time property assignment; called when debug toggles change or during init.【F:src/app.js†L691-L699】【F:src/app.js†L704-L705】【F:src/app.js†L1134-L1138】
  - Units / spaces: Uses string modes `'fill'` or `'off'`.【F:src/app.js†L691-L699】
  - Determinism: Same boolean setting yields the same mode string.【F:src/app.js†L691-L699】
  - Keep / change / delete: Keep; isolates Config wiring from UI logic.【F:src/app.js†L691-L699】【F:src/app.js†L704-L705】
  - Confidence / assumptions: High confidence; assumes `Config.debug` exists and other systems read `Config.debug.mode`.【F:src/app.js†L2-L5】【F:src/app.js†L691-L699】




- `setDebugEnabled`
  - Purpose: Updates the settings boolean for debug visuals and applies it to `Config.debug.mode`.【F:src/app.js†L702-L705】
  - Inputs: `enabled` — truthy to enable debug mode, falsy to disable.【F:src/app.js†L702-L705】
  - Outputs: No return.【F:src/app.js†L702-L705】
  - Side effects: Sets `state.settings.debugEnabled` and calls `applyDebugModeSetting`.【F:src/app.js†L42-L65】【F:src/app.js†L702-L705】
  - Shared state touched and where it’s used: Mutates the settings slice; consumed by `toggleDebugSetting` and initialization code to keep UI and Config in sync.【F:src/app.js†L702-L709】【F:src/app.js†L1134-L1138】
  - Dependencies: Calls `applyDebugModeSetting`.【F:src/app.js†L702-L705】
  - Edge cases handled or missed: Coerces the input to boolean; no persistence beyond memory.【F:src/app.js†L702-L705】
  - Performance: Constant-time.【F:src/app.js†L702-L705】
  - Units / spaces: Boolean flag only.【F:src/app.js†L702-L705】
  - Determinism: Deterministic assignment for given input.【F:src/app.js†L702-L705】
  - Keep / change / delete: Keep; single point for updating the debug flag and side effects.【F:src/app.js†L702-L705】
  - Confidence / assumptions: High confidence; assumes `applyDebugModeSetting` handles Config integration safely.【F:src/app.js†L691-L705】




- `toggleDebugSetting`
  - Purpose: Inverts the debug-mode setting and refreshes the settings menu to reflect the new state.【F:src/app.js†L707-L709】
  - Inputs: None; reads `state.settings.debugEnabled`.【F:src/app.js†L42-L65】【F:src/app.js†L707-L709】
  - Outputs: No return.【F:src/app.js†L707-L709】
  - Side effects: Calls `setDebugEnabled` with the negated flag and triggers `updateMenuLayer`.【F:src/app.js†L707-L709】
  - Shared state touched and where it’s used: Mutates settings indirectly; invoked via keyboard shortcut `KeyB` and the settings menu when the debug option exists (currently only keyboard shortcut).【F:src/app.js†L707-L709】【F:src/app.js†L1042-L1050】
  - Dependencies: Uses `setDebugEnabled` and `updateMenuLayer`.【F:src/app.js†L702-L709】
  - Edge cases handled or missed: None beyond boolean flip; debug option is hidden from the settings menu UI today, so only the shortcut toggles it.【F:src/app.js†L707-L709】【F:src/app.js†L1042-L1050】
  - Performance: Constant-time.【F:src/app.js†L707-L709】
  - Units / spaces: Boolean flag only.【F:src/app.js†L707-L709】
  - Determinism: Deterministic toggle.【F:src/app.js†L707-L709】
  - Keep / change / delete: Keep; provides a dedicated helper for both shortcut and potential UI toggle reuse.【F:src/app.js†L707-L709】【F:src/app.js†L1042-L1050】
  - Confidence / assumptions: High confidence; assumes the shortcut should always update the menu when not playing.【F:src/app.js†L707-L709】【F:src/app.js†L1042-L1050】




- `resetGameplayInputs`
  - Purpose: Clears gameplay input flags so no movement keys remain stuck when switching modes or finishing a race.【F:src/app.js†L712-L719】
  - Inputs: None; uses `Gameplay.state.input` when available.【F:src/app.js†L2-L5】【F:src/app.js†L712-L719】
  - Outputs: No return.【F:src/app.js†L712-L719】
  - Side effects: Sets `left`, `right`, `up`, `down`, and `hop` flags to `false` if the gameplay input object exists.【F:src/app.js†L712-L719】
  - Shared state touched and where it’s used: Mutates the gameplay module’s input state; called before starting a race, when pausing/quitting, and upon race finish to avoid lingering input.【F:src/app.js†L712-L765】【F:src/app.js†L1052-L1057】
  - Dependencies: Requires the global `Gameplay` object to expose `state.input`.【F:src/app.js†L2-L5】【F:src/app.js†L712-L719】
  - Edge cases handled or missed: Gracefully no-ops when gameplay state/input is missing; does not clear analog values beyond the tracked booleans.【F:src/app.js†L712-L719】
  - Performance: Constant-time assignments; called on mode transitions rather than per frame.【F:src/app.js†L712-L765】
  - Units / spaces: Boolean input flags only.【F:src/app.js†L712-L719】
  - Determinism: Repeated calls set the same fields to `false`.【F:src/app.js†L712-L719】
  - Keep / change / delete: Keep; centralizes input reset logic used across multiple flows.【F:src/app.js†L712-L765】【F:src/app.js†L1052-L1057】
  - Confidence / assumptions: High confidence; assumes gameplay module exposes mutable input flags.【F:src/app.js†L2-L5】【F:src/app.js†L712-L719】




- `startRace`
  - Purpose: Applies the chosen vehicle, resets race-complete state, and hands control to gameplay to begin a new race session.【F:src/app.js†L722-L734】
  - Inputs: `vehicleKey` — optional vehicle identifier (defaults to `state.selectedVehicleKey`).【F:src/app.js†L722-L734】
  - Outputs: No return; kicks off asynchronous gameplay setup.【F:src/app.js†L722-L734】
  - Side effects: Calls `applyVehicleSelection`, resets the race-complete state, switches mode to `'playing'`, clears gameplay inputs, and invokes `Gameplay.resetScene` followed by `Gameplay.startRaceSession({ laps: 1 })`, logging errors on failure.【F:src/app.js†L84-L734】
  - Shared state touched and where it’s used: Mutates selection, race-complete, and mode state; used by vehicle selection confirmation and fallback flows to start gameplay.【F:src/app.js†L557-L734】【F:src/app.js†L577-L602】
  - Dependencies: Relies on `applyVehicleSelection`, `resetRaceCompleteState`, `setMode`, `resetGameplayInputs`, and optional gameplay hooks (`resetScene`, `startRaceSession`).【F:src/app.js†L84-L734】
  - Edge cases handled or missed: Works even when `Gameplay.resetScene` is absent (Promise resolves undefined); logs errors if scene reset fails; assumes one-lap races for now.【F:src/app.js†L722-L734】
  - Performance: Bounded by gameplay scene reset/start; this function mostly orchestrates calls and runs only when starting a race.【F:src/app.js†L722-L734】
  - Units / spaces: Uses lap count (integer) for race session; no other units.【F:src/app.js†L722-L734】
  - Determinism: Deterministic sequencing given the same state, though gameplay reset/start may involve asynchronous behavior.【F:src/app.js†L722-L734】
  - Keep / change / delete: Keep; central orchestration point for launching races.【F:src/app.js†L722-L734】
  - Confidence / assumptions: High confidence; assumes gameplay module fulfills `resetScene` and `startRaceSession` contracts and handles their own errors after logging.【F:src/app.js†L722-L734】



- `handleRaceFinish`
  - Purpose: Transitions the app from gameplay into the race-complete flow by clearing controls, capturing the finish time, and priming name-entry state for the leaderboard screen.【F:src/app.js†L736-L746】
  - Inputs: `timeMs` — reported finish duration in milliseconds; accepts any number (non-finite or negative values are coerced to `0`).【F:src/app.js†L738-L742】
  - Outputs: Returns `undefined`; populates `state.raceComplete` with a fresh descriptor for UI rendering and onboarding to the completion sequence.【F:src/app.js†L739-L746】
  - Side effects: Resets gameplay input flags, rebuilds the race-complete state object, clears any highlighted leaderboard entry, and switches UI mode to `'raceComplete'`.【F:src/app.js†L737-L746】
  - Shared state touched and where it’s used: Mutates `state.raceComplete` and `state.leaderboard.highlightId`, which feed the race-complete and leaderboard renderers; invoked exclusively from the gameplay callback wired in `setupCallbacks()` when a race ends.【F:src/app.js†L739-L746】【F:src/bootstrap.js†L38-L54】
  - Dependencies: Calls `resetGameplayInputs`, `createInitialRaceCompleteState`, and `setMode` to prep UI and inputs.【F:src/app.js†L737-L746】
  - Edge cases handled or missed: Handles NaN/∞/negative times by clamping to zero but has no explicit branch for DNFs/DQs or manual retries.【F:src/app.js†L738-L742】
  - Performance: Constant-time state updates; no loops or I/O, so negligible overhead when a race finishes.【F:src/app.js†L736-L746】
  - Units / spaces: Interprets `timeMs` in milliseconds and stores the formatted result for later UI conversion.【F:src/app.js†L738-L745】
  - Determinism: Deterministic given the same `timeMs` and existing state; repeated calls overwrite the race-complete snapshot with the same derived values.【F:src/app.js†L736-L746】
  - Keep / change / delete: Keep; it is the single integration point from gameplay completion into the UI pipeline.【F:src/app.js†L736-L746】【F:src/bootstrap.js†L50-L54】
  - Confidence / assumptions: High confidence; assumes `createInitialRaceCompleteState` returns the canonical template used throughout the race-complete workflow.【F:src/app.js†L739-L745】




- `showLeaderboard`
  - Purpose: Brings the UI to the leaderboard screen and triggers a fetch if cached data is absent.【F:src/app.js†L749-L752】
  - Inputs: None; relies on current app state for context.【F:src/app.js†L749-L752】
  - Outputs: Returns `undefined`; relies on side effects for mode switching and data loading.【F:src/app.js†L749-L752】
  - Side effects: Sets the mode to `'leaderboard'` and kicks off `requestLeaderboard()` which may update loading/error flags and entries asynchronously.【F:src/app.js†L749-L828】
  - Shared state touched and where it’s used: Alters `state.mode`, feeding menu rendering logic; invoked when the main-menu option for the leaderboard is activated.【F:src/app.js†L749-L752】【F:src/app.js†L769-L778】
  - Dependencies: Calls `setMode` and `requestLeaderboard`.【F:src/app.js†L749-L752】
  - Edge cases handled or missed: Relies on `requestLeaderboard` to avoid duplicate fetches; does not guard against missing network access itself.【F:src/app.js†L749-L828】
  - Performance: Constant-time aside from the asynchronous fetch performed by `requestLeaderboard`.【F:src/app.js†L749-L828】
  - Units / spaces: Operates purely on UI mode flags; no special units involved.【F:src/app.js†L749-L752】
  - Determinism: Deterministic—same state leads to the same mode change and fetch attempt; eventual results depend on network data.【F:src/app.js†L749-L828】
  - Keep / change / delete: Keep; central helper for multiple entry points to the leaderboard.【F:src/app.js†L749-L778】
  - Confidence / assumptions: High confidence; assumes `requestLeaderboard` gracefully handles already-loaded state.【F:src/app.js†L800-L828】




- `showSettings`
  - Purpose: Switches the app into the settings menu without any additional setup.【F:src/app.js†L754-L756】
  - Inputs: None.【F:src/app.js†L754-L756】
  - Outputs: Returns `undefined`; relies on mode change for downstream behavior.【F:src/app.js†L754-L756】
  - Side effects: Updates `state.mode` to `'settings'`, triggering menu rerendering.【F:src/app.js†L754-L756】【F:src/app.js†L391-L417】
  - Shared state touched and where it’s used: Adjusts the mode consumed by `updateMenuLayer`; primarily invoked from the main menu option handler.【F:src/app.js†L754-L778】
  - Dependencies: Calls `setMode`.【F:src/app.js†L754-L756】
  - Edge cases handled or missed: No safeguards; assumes settings are always available.【F:src/app.js†L754-L756】
  - Performance: Constant-time mode assignment.【F:src/app.js†L754-L756】
  - Units / spaces: Uses the `'settings'` mode string only.【F:src/app.js†L754-L756】
  - Determinism: Deterministic for the same current state.【F:src/app.js†L754-L756】
  - Keep / change / delete: Keep; provides a single semantic entry point for settings navigation.【F:src/app.js†L754-L778】
  - Confidence / assumptions: High confidence; assumes `setMode` manages any cleanup like resetting indices when applicable.【F:src/app.js†L220-L235】




- `resumeRace`
  - Purpose: Leaves pause-or-menu states and returns the game to active play.【F:src/app.js†L758-L760】
  - Inputs: None.【F:src/app.js†L758-L760】
  - Outputs: Returns `undefined`; relies on mode swap for gameplay resumption.【F:src/app.js†L758-L760】
  - Side effects: Sets `state.mode` to `'playing'`, which suppresses menu rendering and resumes gameplay stepping.【F:src/app.js†L758-L760】【F:src/app.js†L391-L418】【F:src/app.js†L1106-L1116】
  - Shared state touched and where it’s used: Mode change influences `updateMenuLayer` and the main loop; invoked from pause menu selection, pause hotkey handling, and escape handling in the pause menu.【F:src/app.js†L781-L990】【F:src/app.js†L1052-L1063】
  - Dependencies: Calls `setMode`.【F:src/app.js†L758-L760】
  - Edge cases handled or missed: Does not reinitialize gameplay state; assumes gameplay can resume immediately.【F:src/app.js†L758-L760】
  - Performance: Constant-time.【F:src/app.js†L758-L760】
  - Units / spaces: Operates on mode flags only.【F:src/app.js†L758-L760】
  - Determinism: Deterministic; identical state yields identical mode transition.【F:src/app.js†L758-L760】
  - Keep / change / delete: Keep; central resume hook shared by UI and keyboard controls.【F:src/app.js†L781-L990】【F:src/app.js†L1052-L1063】
  - Confidence / assumptions: High confidence; assumes `setMode('playing')` handles resetting menu indices as needed.【F:src/app.js†L220-L228】




- `quitToMenu`
  - Purpose: Exits gameplay back to the main menu while ensuring controls and scene reset hooks run.【F:src/app.js†L762-L767】
  - Inputs: None.【F:src/app.js†L762-L767】
  - Outputs: Returns `undefined`; orchestrates side effects for quitting.【F:src/app.js†L762-L767】
  - Side effects: Sets mode to `'menu'`, clears gameplay inputs, and invokes `Gameplay.resetScene()` if available, logging failures.【F:src/app.js†L762-L767】
  - Shared state touched and where it’s used: Alters mode and indirectly triggers menu rendering; called from the pause menu option handler.【F:src/app.js†L762-L789】
  - Dependencies: Calls `setMode`, `resetGameplayInputs`, and optionally `Gameplay.resetScene`.【F:src/app.js†L762-L767】
  - Edge cases handled or missed: Safely handles missing `Gameplay.resetScene`; does not wait for reset completion before returning to menu.【F:src/app.js†L765-L767】
  - Performance: Constant-time aside from the asynchronous scene reset.【F:src/app.js†L762-L767】
  - Units / spaces: Mode strings only.【F:src/app.js†L762-L767】
  - Determinism: Deterministic control flow; asynchronous reset outcome may vary but is logged on error.【F:src/app.js†L762-L767】
  - Keep / change / delete: Keep; consolidates quit behavior for reuse across inputs.【F:src/app.js†L781-L789】
  - Confidence / assumptions: High confidence; assumes gameplay module tolerates repeated `resetScene` calls.【F:src/app.js†L765-L767】




- `activateMainMenuSelection`
  - Purpose: Executes the action tied to the currently highlighted main-menu option.【F:src/app.js†L769-L779】
  - Inputs: None; reads `state.mainMenuIndex` to determine the active option.【F:src/app.js†L769-L776】
  - Outputs: Returns `undefined`; defers to other helpers for observable outcomes.【F:src/app.js†L769-L779】
  - Side effects: Depending on selection, may trigger vehicle selection, leaderboard, or settings flows via dedicated helpers.【F:src/app.js†L772-L778】
  - Shared state touched and where it’s used: Relies on `state.mainMenuIndex` set elsewhere; primarily called from the main menu key handler on confirm.【F:src/app.js†L769-L778】【F:src/app.js†L879-L895】
  - Dependencies: Calls `showVehicleSelect`, `showLeaderboard`, or `showSettings` based on the option key.【F:src/app.js†L772-L778】
  - Edge cases handled or missed: Gracefully exits if the index is out of range (`!option`); no feedback for unsupported keys.【F:src/app.js†L769-L778】
  - Performance: Constant-time branching.【F:src/app.js†L769-L779】
  - Units / spaces: Uses option keys (`'start'`, `'leaderboard'`, `'settings'`) only.【F:src/app.js†L772-L778】
  - Determinism: Deterministic for a given menu index and options array.【F:src/app.js†L769-L779】
  - Keep / change / delete: Keep; keeps menu behavior centralized rather than scattering conditionals across input handlers.【F:src/app.js†L769-L895】
  - Confidence / assumptions: High confidence; assumes menu options array stays in sync with rendered menu order.【F:src/app.js†L251-L260】【F:src/app.js†L769-L778】




- `activatePauseMenuSelection`
  - Purpose: Executes the selected pause-menu action (resume or quit).【F:src/app.js†L781-L788】
  - Inputs: None; consumes `state.pauseMenuIndex`.【F:src/app.js†L781-L787】
  - Outputs: Returns `undefined`; relies on downstream helpers for observable behavior.【F:src/app.js†L781-L788】
  - Side effects: Calls `resumeRace` or `quitToMenu`, affecting mode and gameplay state.【F:src/app.js†L784-L788】
  - Shared state touched and where it’s used: Reads `state.pauseMenuIndex`; invoked by pause key handling and menu confirmation.【F:src/app.js†L781-L988】【F:src/app.js†L1052-L1062】
  - Dependencies: Calls `resumeRace` or `quitToMenu`.【F:src/app.js†L784-L788】
  - Edge cases handled or missed: Safely no-ops if index is invalid; no handling for additional pause options.【F:src/app.js†L781-L788】
  - Performance: Constant-time.【F:src/app.js†L781-L788】
  - Units / spaces: Works with option keys `'resume'` and `'quit'`.【F:src/app.js†L784-L787】
  - Determinism: Deterministic for a given index state.【F:src/app.js†L781-L788】
  - Keep / change / delete: Keep; isolates pause-menu behaviors for reuse by multiple input paths.【F:src/app.js†L781-L988】【F:src/app.js†L1052-L1062】
  - Confidence / assumptions: High confidence; assumes pause options remain limited to resume/quit until expanded.【F:src/app.js†L314-L322】【F:src/app.js†L781-L788】




- `activateSettingsSelection`
  - Purpose: Applies the settings menu action currently highlighted (toggle snow or leave the menu).【F:src/app.js†L791-L797】
  - Inputs: None; checks `settingsMenuKeys[state.settingsMenuIndex]`.【F:src/app.js†L791-L796】
  - Outputs: Returns `undefined`; relies on invoked helpers for visible outcomes.【F:src/app.js†L791-L797】
  - Side effects: Toggles snow rendering or returns to the main menu depending on selection.【F:src/app.js†L793-L797】
  - Shared state touched and where it’s used: Reads `state.settingsMenuIndex` and writes via `toggleSnowSetting`/`setMode`; triggered from settings key handling.【F:src/app.js†L791-L937】
  - Dependencies: Calls `toggleSnowSetting` or `setMode('menu')`.【F:src/app.js†L793-L797】
  - Edge cases handled or missed: Ignores unknown keys; only two options supported.【F:src/app.js†L791-L797】
  - Performance: Constant-time.【F:src/app.js†L791-L797】
  - Units / spaces: Works with `'snow'` and `'back'` keys only.【F:src/app.js†L793-L796】
  - Determinism: Deterministic for a given selection state.【F:src/app.js†L791-L797】
  - Keep / change / delete: Keep; centralizes side effects for the sparse settings menu.【F:src/app.js†L291-L311】【F:src/app.js†L791-L937】
  - Confidence / assumptions: High confidence; assumes `settingsMenuKeys` mirrors the rendered options order.【F:src/app.js†L291-L311】【F:src/app.js†L791-L797】




- `requestLeaderboard`
  - Purpose: Lazily loads remote leaderboard data, merges it with local entries, and updates loading state for the menu.【F:src/app.js†L800-L828】
  - Inputs: None; acts on `state.leaderboard` internals.【F:src/app.js†L800-L828】
  - Outputs: Returns `undefined`; populates `state.leaderboard.entries`, flags, and highlight metadata asynchronously.【F:src/app.js†L804-L828】
  - Side effects: Sets loading/error flags, triggers UI refreshes, fetches CSV data, parses entries, sorts them, and logs failures.【F:src/app.js†L804-L828】
  - Shared state touched and where it’s used: Mutates `state.leaderboard` fields that feed leaderboard rendering; invoked during initialization and when the leaderboard screen opens.【F:src/app.js†L264-L288】【F:src/app.js†L749-L828】【F:src/app.js†L1127-L1138】
  - Dependencies: Calls `updateMenuLayer`, `fetch`, `parseLeaderboardCsv`, and `sortLeaderboardEntries` (plus Promise chaining).【F:src/app.js†L804-L828】
  - Edge cases handled or missed: Skips fetch if already loading or entries exist; handles HTTP errors and missing/empty CSV, but doesn’t retry or debounce rapid toggling.【F:src/app.js†L800-L828】
  - Performance: Network-bound; otherwise linear in the number of CSV rows for parsing and sorting (delegated).【F:src/app.js†L804-L828】
  - Units / spaces: Treats scores as numeric points and timestamps as CSV strings; no special spatial units.【F:src/app.js†L813-L828】
  - Determinism: Deterministic for identical CSV input; external fetch results introduce variability.【F:src/app.js†L804-L828】
  - Keep / change / delete: Keep; encapsulates leaderboard loading concerns and guards against redundant fetches.【F:src/app.js†L800-L828】
  - Confidence / assumptions: High confidence; assumes CSV schema contains `name`, `points`, and `date` headers or defaults can be applied.【F:src/app.js†L831-L854】




- `parseLeaderboardCsv`
  - Purpose: Converts CSV leaderboard text into normalized entry objects sorted by score (then name) with ranks assigned.【F:src/app.js†L831-L864】
  - Inputs: `text` — raw CSV string; accepts empty/whitespace and gracefully handles missing data.【F:src/app.js†L831-L849】
  - Outputs: Returns an array of leaderboard entries with computed ranks.【F:src/app.js†L842-L864】
  - Side effects: None beyond local computations.【F:src/app.js†L831-L864】
  - Shared state touched and where it’s used: Pure helper invoked during leaderboard fetch to populate `state.leaderboard.entries`.【F:src/app.js†L813-L864】
  - Dependencies: Uses `createLeaderboardEntry` and `recomputeLeaderboardRanks` to build and annotate entries.【F:src/app.js†L850-L864】
  - Edge cases handled or missed: Ignores blank lines, tolerates missing headers by falling back to positional columns, clamps non-numeric scores to zero, but assumes comma separators and no quoted values.【F:src/app.js†L831-L864】
  - Performance: O(n log n) due to sorting after a single pass over rows.【F:src/app.js†L843-L863】
  - Units / spaces: Treats scores as numeric points and ranks as integers; no spatial units.【F:src/app.js†L842-L864】
  - Determinism: Deterministic for a given CSV input; stable tie-breaking via `localeCompare` on names.【F:src/app.js†L857-L863】
  - Keep / change / delete: Keep; isolates CSV parsing logic from network handling.【F:src/app.js†L813-L864】
  - Confidence / assumptions: High confidence; assumes CSV is simple (no embedded commas/quotes).【F:src/app.js†L833-L858】




- `handleMenuNavigation`
  - Purpose: Adjusts the main-menu selection index in response to navigation input.【F:src/app.js†L867-L869】
  - Inputs: `delta` — signed step applied to the menu index.【F:src/app.js†L867-L869】
  - Outputs: Returns `undefined`; delegates to `changeMainMenuSelection`.【F:src/app.js†L867-L869】
  - Side effects: Indirectly changes `state.mainMenuIndex` via the helper.【F:src/app.js†L867-L869】
  - Shared state touched and where it’s used: Ultimately mutates the menu index consumed by rendering; triggered from arrow-key handling.【F:src/app.js†L867-L889】
  - Dependencies: Calls `changeMainMenuSelection`.【F:src/app.js†L867-L869】
  - Edge cases handled or missed: Relies on helper for wraparound/clamping; no direct guards here.【F:src/app.js†L867-L869】
  - Performance: Constant-time.【F:src/app.js†L867-L869】
  - Units / spaces: Treats `delta` as integer step count.【F:src/app.js†L867-L869】
  - Determinism: Deterministic given the same starting state and delta.【F:src/app.js†L867-L869】
  - Keep / change / delete: Keep; preserves separation between navigation intent and index mutation logic.【F:src/app.js†L867-L889】
  - Confidence / assumptions: High confidence; assumes `changeMainMenuSelection` enforces bounds.【F:src/app.js†L867-L869】




- `handlePauseNavigation`
  - Purpose: Moves the pause-menu cursor according to user input.【F:src/app.js†L871-L873】
  - Inputs: `delta` — signed index offset.【F:src/app.js†L871-L873】
  - Outputs: Returns `undefined`; defers to `changePauseMenuSelection`.【F:src/app.js†L871-L873】
  - Side effects: Adjusts `state.pauseMenuIndex` via the helper.【F:src/app.js†L871-L873】
  - Shared state touched and where it’s used: Indirectly updates pause selection consumed by rendering and activation handlers.【F:src/app.js†L871-L986】
  - Dependencies: Calls `changePauseMenuSelection`.【F:src/app.js†L871-L873】
  - Edge cases handled or missed: Leaves wrap/limit behavior to the helper.【F:src/app.js†L871-L873】
  - Performance: Constant-time.【F:src/app.js†L871-L873】
  - Units / spaces: Delta step count only.【F:src/app.js†L871-L873】
  - Determinism: Deterministic per starting index and delta.【F:src/app.js†L871-L873】
  - Keep / change / delete: Keep; mirrors other menu navigation helpers for consistency.【F:src/app.js†L871-L986】
  - Confidence / assumptions: High confidence; assumes helper enforces limits.【F:src/app.js†L871-L873】




- `handleSettingsNavigation`
  - Purpose: Changes the highlighted option within the settings menu.【F:src/app.js†L875-L877】
  - Inputs: `delta` — signed navigation increment.【F:src/app.js†L875-L877】
  - Outputs: Returns `undefined`; passes control to `changeSettingsSelection`.【F:src/app.js†L875-L877】
  - Side effects: Indirectly mutates `state.settingsMenuIndex`.【F:src/app.js†L875-L877】
  - Shared state touched and where it’s used: Affects settings menu rendering and activation; invoked from arrow-key handling.【F:src/app.js†L875-L934】
  - Dependencies: Calls `changeSettingsSelection`.【F:src/app.js†L875-L877】
  - Edge cases handled or missed: Delegates wrapping/bounds to helper.【F:src/app.js†L875-L877】
  - Performance: Constant-time.【F:src/app.js†L875-L877】
  - Units / spaces: Integer step count only.【F:src/app.js†L875-L877】
  - Determinism: Deterministic for same inputs.【F:src/app.js†L875-L877】
  - Keep / change / delete: Keep; maintains symmetry with other navigation helpers.【F:src/app.js†L875-L934】
  - Confidence / assumptions: High confidence; assumes helper covers bounds.【F:src/app.js†L875-L877】




- `handleMenuKeyDown`
  - Purpose: Handles keyboard input on the main menu, supporting navigation and selection.【F:src/app.js†L879-L895】
  - Inputs: `e` — keyboard event; expects `code` property for arrow/space/enter keys.【F:src/app.js†L879-L895】
  - Outputs: Returns `true` when an input is consumed; otherwise `false`.【F:src/app.js†L879-L895】
  - Side effects: Updates menu selection, triggers activation, and prevents default browser behavior for handled keys.【F:src/app.js†L881-L894】
  - Shared state touched and where it’s used: Mutates selection via navigation helper; invoked from the global keydown dispatcher when in menu mode.【F:src/app.js†L879-L895】【F:src/app.js†L1075-L1089】
  - Dependencies: Calls `handleMenuNavigation` and `activateMainMenuSelection`.【F:src/app.js†L881-L892】
  - Edge cases handled or missed: Blocks arrow keys even if they don’t change selection; ignores other keys without side effects.【F:src/app.js†L879-L895】
  - Performance: Constant-time.【F:src/app.js†L879-L895】
  - Units / spaces: Works with keyboard `code` strings only.【F:src/app.js†L879-L895】
  - Determinism: Deterministic for a given event and menu state.【F:src/app.js†L879-L895】
  - Keep / change / delete: Keep; encapsulates menu key handling separate from global dispatch.【F:src/app.js†L879-L895】【F:src/app.js†L1075-L1089】
  - Confidence / assumptions: High confidence; assumes `preventDefault` is sufficient to stop browser scrolling.【F:src/app.js†L881-L894】




- `handleLeaderboardKeyDown`
  - Purpose: Processes inputs on the leaderboard screen, allowing dismissal and disabling navigation keys.【F:src/app.js†L898-L909】
  - Inputs: `e` — keyboard event focused on `code` for space/enter/escape/arrows.【F:src/app.js†L898-L907】
  - Outputs: Returns `true` when handled; otherwise `false`.【F:src/app.js†L898-L909】
  - Side effects: Returns to the main menu on confirmation keys and prevents default browser behavior for all targeted keys.【F:src/app.js†L898-L907】
  - Shared state touched and where it’s used: Delegates to `setMode('menu')`; invoked from the global keydown router in leaderboard mode.【F:src/app.js†L898-L907】【F:src/app.js†L1078-L1089】
  - Dependencies: Calls `setMode`.【F:src/app.js†L900-L907】
  - Edge cases handled or missed: Consumes arrow keys even though they have no effect; offers no paging or scrolling.【F:src/app.js†L904-L907】
  - Performance: Constant-time.【F:src/app.js†L898-L907】
  - Units / spaces: Keyboard codes only.【F:src/app.js†L898-L907】
  - Determinism: Deterministic for same event and state.【F:src/app.js†L898-L909】
  - Keep / change / delete: Keep; minimal but sufficient event handling for the static leaderboard view.【F:src/app.js†L898-L907】【F:src/app.js†L1078-L1089】
  - Confidence / assumptions: High confidence; assumes leaving the screen should always return to the main menu.【F:src/app.js†L900-L907】




- `handleSettingsKeyDown`
  - Purpose: Handles keyboard interaction on the settings menu, covering navigation, toggles, and exit.【F:src/app.js†L911-L940】
  - Inputs: `e` — keyboard event leveraging arrow, space, enter, and escape codes.【F:src/app.js†L911-L939】
  - Outputs: Returns `true` when the event is handled; otherwise `false`.【F:src/app.js†L911-L940】
  - Side effects: Adjusts selection, toggles snow setting, activates entries, and prevents default browser behavior.【F:src/app.js†L913-L938】
  - Shared state touched and where it’s used: Reads/writes settings indices and toggles; invoked from global keydown when in settings mode.【F:src/app.js†L911-L938】【F:src/app.js†L1078-L1089】
  - Dependencies: Calls `handleSettingsNavigation`, `toggleSnowSetting`, `activateSettingsSelection`, and `setMode`.【F:src/app.js†L913-L937】
  - Edge cases handled or missed: Consumes left/right even when not on a toggleable option; doesn’t support analog adjustments or additional options.【F:src/app.js†L923-L928】
  - Performance: Constant-time.【F:src/app.js†L911-L938】
  - Units / spaces: Works purely with keyboard codes and mode strings.【F:src/app.js†L911-L937】
  - Determinism: Deterministic for identical events and state.【F:src/app.js†L911-L940】
  - Keep / change / delete: Keep; concentrates all settings key handling logic for clarity.【F:src/app.js†L911-L938】【F:src/app.js†L1078-L1089】
  - Confidence / assumptions: High confidence; assumes only the snow toggle responds to left/right inputs.【F:src/app.js†L923-L928】




- `handleVehicleSelectKeyDown`
  - Purpose: Manages keyboard input on the vehicle selection screen, including cycling options and confirming choices.【F:src/app.js†L943-L968】
  - Inputs: `e` — keyboard event for arrow, space, enter, and escape codes.【F:src/app.js†L943-L967】
  - Outputs: Returns `true` when the key is handled; otherwise `false`.【F:src/app.js†L943-L968】
  - Side effects: Changes selected vehicle, triggers activation, and prevents default behavior for navigation keys.【F:src/app.js†L945-L966】
  - Shared state touched and where it’s used: Mutates selection indices and may kick off race start; invoked by the global keydown router when in vehicle-select mode.【F:src/app.js†L943-L966】【F:src/app.js†L1076-L1089】
  - Dependencies: Calls `changeVehicleSelection`, `activateVehicleSelection`, and `setMode`.【F:src/app.js†L945-L960】
  - Edge cases handled or missed: Blocks vertical arrows despite no vertical menu; relies on helper for bounds; no mouse/gamepad handling here.【F:src/app.js†L964-L966】
  - Performance: Constant-time.【F:src/app.js†L943-L966】
  - Units / spaces: Works with keyboard codes and option indices.【F:src/app.js†L943-L966】
  - Determinism: Deterministic for the same input and selection state.【F:src/app.js†L943-L968】
  - Keep / change / delete: Keep; contains all keyboard interactions for vehicle selection.【F:src/app.js†L943-L966】【F:src/app.js†L1076-L1089】
  - Confidence / assumptions: High confidence; assumes vehicle list is non-empty and helpers wrap safely.【F:src/app.js†L325-L342】【F:src/app.js†L943-L966】




- `handlePauseKeyDown`
  - Purpose: Responds to keyboard input while the pause menu is visible, covering navigation, confirmation, and quick resume.【F:src/app.js†L971-L993】
  - Inputs: `e` — keyboard event for arrow, space, enter, and escape codes.【F:src/app.js†L971-L991】
  - Outputs: Returns `true` when the event is consumed; otherwise `false`.【F:src/app.js†L971-L993】
  - Side effects: Moves the pause selection, activates items, resumes play via escape, and prevents browser defaults.【F:src/app.js†L973-L990】
  - Shared state touched and where it’s used: Mutates pause selection via helper and interacts with resume/quit flows; dispatched from the global keydown handler while paused.【F:src/app.js†L971-L990】【F:src/app.js†L1084-L1089】
  - Dependencies: Calls `handlePauseNavigation`, `activatePauseMenuSelection`, and `resumeRace`.【F:src/app.js†L973-L989】
  - Edge cases handled or missed: Escape always resumes even if already on resume; no direct support for extra menu options.【F:src/app.js†L987-L990】
  - Performance: Constant-time.【F:src/app.js†L971-L990】
  - Units / spaces: Keyboard codes and option indices only.【F:src/app.js†L971-L990】
  - Determinism: Deterministic for the same event/state.【F:src/app.js†L971-L993】
  - Keep / change / delete: Keep; required to make the pause overlay interactive.【F:src/app.js†L971-L990】【F:src/app.js†L1084-L1089】
  - Confidence / assumptions: High confidence; assumes pause options remain resume/quit and escape should always resume.【F:src/app.js†L314-L322】【F:src/app.js†L987-L990】




- `handleRaceCompleteKeyDown`
  - Purpose: Drives the race-complete input flow, handling name entry, advancing the celebration, and exiting to attract mode.【F:src/app.js†L995-L1034】
  - Inputs: `e` — keyboard event using escape, space, enter, and arrow codes.【F:src/app.js†L995-L1033】
  - Outputs: Returns `true` when handled; otherwise `false`.【F:src/app.js†L995-L1034】
  - Side effects: Routes to attract mode, edits the active name letter, locks characters, or advances the post-race sequence; prevents default behavior on handled keys.【F:src/app.js†L998-L1032】
  - Shared state touched and where it’s used: Reads and mutates `state.raceComplete`; dispatched from the global keydown router in race-complete mode.【F:src/app.js†L995-L1032】【F:src/app.js†L1086-L1089】
  - Dependencies: Calls `goToAttract`, `adjustCurrentNameLetter`, `lockCurrentNameLetter`, and `advanceRaceCompleteSequence`.【F:src/app.js†L998-L1032】
  - Edge cases handled or missed: Allows escape to abort even before saving; only supports three-letter cycling with arrows; no validation for duplicate letters.【F:src/app.js†L1002-L1032】
  - Performance: Constant-time operations per key press.【F:src/app.js†L995-L1032】
  - Units / spaces: Works with keyboard codes and name-letter indices.【F:src/app.js†L995-L1032】
  - Determinism: Deterministic for same state and inputs.【F:src/app.js†L995-L1034】
  - Keep / change / delete: Keep; consolidates the multi-phase race completion controls.【F:src/app.js†L995-L1032】【F:src/app.js†L1086-L1089】
  - Confidence / assumptions: High confidence; assumes race-complete state machine uses `active`/`phase` as documented.【F:src/app.js†L995-L1032】




- `handleAttractKeyDown`
  - Purpose: Lets any key press during attract mode return players to the main menu.【F:src/app.js†L1036-L1040】
  - Inputs: `e` — keyboard event; any key is treated the same.【F:src/app.js†L1036-L1039】
  - Outputs: Always returns `true` after handling.【F:src/app.js†L1036-L1040】
  - Side effects: Switches the app mode to `'menu'` and prevents browser defaults.【F:src/app.js†L1036-L1039】
  - Shared state touched and where it’s used: Updates mode for rendering; invoked from the global keydown dispatcher in attract mode.【F:src/app.js†L1036-L1039】【F:src/app.js†L1088-L1089】
  - Dependencies: Calls `setMode`.【F:src/app.js†L1036-L1039】
  - Edge cases handled or missed: No differentiation by key; ignores potential video playback state aside from mode change.【F:src/app.js†L1036-L1039】
  - Performance: Constant-time.【F:src/app.js†L1036-L1039】
  - Units / spaces: Mode string only.【F:src/app.js†L1036-L1039】
  - Determinism: Deterministic for any event.【F:src/app.js†L1036-L1040】
  - Keep / change / delete: Keep; ensures quick exit from attract loop on input.【F:src/app.js†L1036-L1039】【F:src/app.js†L1088-L1089】
  - Confidence / assumptions: High confidence; assumes any attract-mode key should re-enter the menu.【F:src/app.js†L1036-L1039】




- `handleKeyDown`
  - Purpose: Acts as the global keyboard dispatcher, handling debug toggles, pause shortcut, gameplay forwarding, and routing to mode-specific handlers.【F:src/app.js†L1042-L1095】
  - Inputs: `e` — keyboard event for all gameplay and menu interactions.【F:src/app.js†L1042-L1094】
  - Outputs: Returns `undefined`; may stop propagation by preventing default on handled keys.【F:src/app.js†L1042-L1094】
  - Side effects: Toggles debug mode, manages pause state, marks user interaction timestamps, delegates to gameplay handlers, and prevents default behavior for navigation keys when unhandled.【F:src/app.js†L1043-L1094】
  - Shared state touched and where it’s used: Mutates debug setting, mode, and interaction timestamp; registered with DOM via bootstrap to process all keydown events.【F:src/app.js†L1042-L1094】【F:src/bootstrap.js†L67-L75】
  - Dependencies: Calls `toggleDebugSetting`, `markInteraction`, `setMode`, `resetGameplayInputs`, `resumeRace`, various mode-specific handlers, and `Gameplay.keydownHandler`.【F:src/app.js†L1043-L1094】
  - Edge cases handled or missed: Treats `KeyP` specially during gameplay/pause but ignores it elsewhere; prevents arrow/space defaults even when no handler consumed the key.【F:src/app.js†L1043-L1094】
  - Performance: Constant-time dispatch with minimal branching; executed on every keydown.【F:src/app.js†L1042-L1094】
  - Units / spaces: Uses milliseconds indirectly via `markInteraction` (updates timestamp) and relies on keyboard `code` strings.【F:src/app.js†L1042-L1094】
  - Determinism: Deterministic for a given state and key event.【F:src/app.js†L1042-L1095】
  - Keep / change / delete: Keep; required as the top-level event handler bound by bootstrap.【F:src/app.js†L1042-L1094】【F:src/bootstrap.js†L67-L75】
  - Confidence / assumptions: High confidence; assumes gameplay exposes compatible `keydownHandler`.【F:src/app.js†L1070-L1094】




- `handleKeyUp`
  - Purpose: Forwards keyup events to gameplay while suppressing the pause shortcut release.【F:src/app.js†L1097-L1104】
  - Inputs: `e` — keyboard event; only processed in `'playing'` mode.【F:src/app.js†L1097-L1103】
  - Outputs: Returns `undefined`.【F:src/app.js†L1097-L1104】
  - Side effects: Calls into `Gameplay.keyupHandler` for active gameplay keys.【F:src/app.js†L1097-L1103】
  - Shared state touched and where it’s used: Depends on `state.mode`; registered globally by bootstrap alongside `handleKeyDown`.【F:src/app.js†L1097-L1103】【F:src/bootstrap.js†L70-L75】
  - Dependencies: Calls `Gameplay.keyupHandler`.【F:src/app.js†L1097-L1103】
  - Edge cases handled or missed: Ignores `KeyP` release to avoid unpausing; other modes swallow keyup entirely, so menu interactions rely solely on keydown.【F:src/app.js†L1097-L1103】
  - Performance: Constant-time.【F:src/app.js†L1097-L1103】
  - Units / spaces: Keyboard codes only.【F:src/app.js†L1097-L1103】
  - Determinism: Deterministic for the same mode and event.【F:src/app.js†L1097-L1104】
  - Keep / change / delete: Keep; necessary for gameplay control parity with the bootstrap fallback.【F:src/app.js†L1097-L1103】【F:src/bootstrap.js†L70-L75】
  - Confidence / assumptions: High confidence; assumes gameplay consumes keyup events appropriately.【F:src/app.js†L1097-L1103】




- `step`
  - Purpose: Runs the per-frame update loop, delegating to gameplay, race-complete animations, vehicle previews, and idle-attract timeout logic.【F:src/app.js†L1106-L1125】
  - Inputs: `dt` — frame delta time in seconds (as provided by `Renderer.frame`).【F:src/app.js†L1106-L1119】【F:src/bootstrap.js†L77-L83】
  - Outputs: Returns `undefined`; orchestrates side effects each frame.【F:src/app.js†L1106-L1125】
  - Side effects: Calls gameplay stepping, race-complete updater, vehicle preview animation, and transitions to attract mode when idle.【F:src/app.js†L1106-L1122】
  - Shared state touched and where it’s used: Reads/updates `state.mode`, `state.raceComplete`, and `state.lastInteractionAt`; invoked every frame via bootstrap’s render loop.【F:src/app.js†L1106-L1122】【F:src/bootstrap.js†L77-L83】
  - Dependencies: Calls `Gameplay.step`, `updateRaceComplete`, `updateVehiclePreviewAnimation`, `now`, and `goToAttract`.【F:src/app.js†L1106-L1122】
  - Edge cases handled or missed: Suppresses idle timeout while the player is actively finalizing race results; does not clamp `dt` spikes.【F:src/app.js†L1110-L1122】
  - Performance: Linear in work delegated to gameplay and animation helpers; executed once per frame.【F:src/app.js†L1106-L1122】
  - Units / spaces: Uses seconds for `dt` and milliseconds for idle timeout comparisons via `now()`.【F:src/app.js†L1106-L1121】
  - Determinism: Deterministic given the same state, elapsed time, and helper determinism (except any randomness inside delegates).【F:src/app.js†L1106-L1122】
  - Keep / change / delete: Keep; it is the application’s frame driver registered with the renderer.【F:src/app.js†L1106-L1122】【F:src/bootstrap.js†L77-L83】
  - Confidence / assumptions: High confidence; assumes helpers handle their own timing nuances (e.g., `updateRaceComplete`).【F:src/app.js†L1106-L1122】




- `init`
  - Purpose: Performs one-time application bootstrap: wiring DOM references, resetting state, applying selections, and loading the leaderboard.【F:src/app.js†L1127-L1138】
  - Inputs: None.【F:src/app.js†L1127-L1138】
  - Outputs: Returns `undefined`; establishes initial app state.【F:src/app.js†L1127-L1138】
  - Side effects: Ensures DOM nodes exist, resets menu indices and race-complete state, applies saved vehicle/debug settings, sets mode to menu, and triggers leaderboard loading.【F:src/app.js†L1127-L1138】
  - Shared state touched and where it’s used: Initializes fields read throughout the app; invoked from bootstrap after assets are wired.【F:src/app.js†L1127-L1138】【F:src/bootstrap.js†L57-L63】
  - Dependencies: Calls `ensureDom`, `resetRaceCompleteState`, `applyVehicleSelection`, `applyDebugModeSetting`, `setMode`, and `requestLeaderboard`.【F:src/app.js†L1127-L1138】
  - Edge cases handled or missed: Throws if required DOM elements are absent; assumes asset/manifests already loaded before invocation.【F:src/app.js†L237-L249】【F:src/app.js†L1127-L1138】
  - Performance: One-time setup with constant work aside from leaderboard fetch kicked off afterward.【F:src/app.js†L1127-L1138】
  - Units / spaces: Initializes timestamps in milliseconds via `now()`; other values are indices and booleans.【F:src/app.js†L1129-L1137】
  - Determinism: Deterministic given the same persisted state and helper behavior.【F:src/app.js†L1127-L1138】
  - Keep / change / delete: Keep; canonical entry point for app startup.【F:src/app.js†L1127-L1138】【F:src/bootstrap.js†L57-L63】
  - Confidence / assumptions: High confidence; assumes helper functions succeed (vehicle selection, debug application).【F:src/app.js†L1127-L1138】




- `isSnowEnabled`
  - Purpose: Exposes whether snow effects should be active based on app settings.【F:src/app.js†L1140-L1142】
  - Inputs: None.【F:src/app.js†L1140-L1142】
  - Outputs: Returns a boolean indicating the snow toggle state.【F:src/app.js†L1140-L1142】
  - Side effects: None; pure getter.【F:src/app.js†L1140-L1142】
  - Shared state touched and where it’s used: Reads `state.settings.snowEnabled`; queried by the renderer when deciding whether to spawn snow particles.【F:src/app.js†L1140-L1142】【F:src/render.js†L416-L426】
  - Dependencies: None beyond accessing `state`.【F:src/app.js†L1140-L1142】
  - Edge cases handled or missed: Coerces to boolean; no persistence handling here.【F:src/app.js†L1140-L1142】
  - Performance: Constant-time.【F:src/app.js†L1140-L1142】
  - Units / spaces: Boolean flag only.【F:src/app.js†L1140-L1142】
  - Determinism: Deterministic for a given state.【F:src/app.js†L1140-L1142】
  - Keep / change / delete: Keep; provides stable contract for render systems checking snow feature availability.【F:src/app.js†L1140-L1142】【F:src/render.js†L416-L426】
  - Confidence / assumptions: High confidence; assumes settings state is kept in sync with UI toggles.【F:src/app.js†L793-L797】【F:src/app.js†L1140-L1142】




- `isDebugEnabled`
  - Purpose: Reports whether debug overlays should be visible based on settings.【F:src/app.js†L1144-L1146】
  - Inputs: None.【F:src/app.js†L1144-L1146】
  - Outputs: Returns a boolean reflecting the debug toggle.【F:src/app.js†L1144-L1146】
  - Side effects: None; pure getter.【F:src/app.js†L1144-L1146】
  - Shared state touched and where it’s used: Reads `state.settings.debugEnabled`; renderer queries it to decide whether to show overlays.【F:src/app.js†L1144-L1146】【F:src/render.js†L554-L577】
  - Dependencies: None beyond state access.【F:src/app.js†L1144-L1146】
  - Edge cases handled or missed: Coerces to boolean; assumes state exists.【F:src/app.js†L1144-L1146】
  - Performance: Constant-time.【F:src/app.js†L1144-L1146】
  - Units / spaces: Boolean flag only.【F:src/app.js†L1144-L1146】
  - Determinism: Deterministic for a given state.【F:src/app.js†L1144-L1146】
  - Keep / change / delete: Keep; necessary for render overlay toggling without exposing entire state object.【F:src/app.js†L1144-L1146】【F:src/render.js†L554-L577】
  - Confidence / assumptions: High confidence; assumes debug setting is maintained by menu/debug shortcut flows.【F:src/app.js†L699-L709】【F:src/app.js†L1043-L1057】【F:src/app.js†L1144-L1146】

### 3.2 UI Screen Templates (`src/ui/screens.js`)



- `ensureEscapeHtml`
  - Purpose: Supplies a safe HTML-escaping helper, defaulting to a simple string conversion when none is provided.【F:src/ui/screens.js†L4-L6】
  - Inputs: `helpers` — optional object that may contain an `escapeHtml` function; any other shape falls back to a default converter.【F:src/ui/screens.js†L4-L6】
  - Outputs: Returns an escape function used by screen templates to sanitize text.【F:src/ui/screens.js†L4-L6】
  - Side effects: None; pure helper.【F:src/ui/screens.js†L4-L6】
  - Shared state touched and where it’s used: Independent function leveraged by every screen factory when preparing strings.【F:src/ui/screens.js†L8-L296】
  - Dependencies: None beyond optional helper injection.【F:src/ui/screens.js†L4-L6】
  - Edge cases handled or missed: Falls back gracefully when helpers are null/undefined; does not escape HTML beyond simple string coercion if no helper provided.【F:src/ui/screens.js†L4-L6】
  - Performance: Constant-time; returned function performance depends on provided helper.【F:src/ui/screens.js†L4-L6】
  - Units / spaces: Works with text strings only.【F:src/ui/screens.js†L4-L6】
  - Determinism: Deterministic for a given helper input.【F:src/ui/screens.js†L4-L6】
  - Keep / change / delete: Keep; centralizes escape helper fallback for all templates.【F:src/ui/screens.js†L4-L6】【F:src/ui/screens.js†L8-L296】
  - Confidence / assumptions: High confidence; assumes callers provide well-behaved escape functions when needed.【F:src/ui/screens.js†L4-L6】




- `mainMenuScreen`
  - Purpose: Renders the main menu HTML structure using provided titles and options, highlighting the selected entry.【F:src/ui/screens.js†L8-L37】
  - Inputs: `ctx` (`title`, `subtitle`, `options`, `selectedIndex`) and optional `helpers` (escape function).【F:src/ui/screens.js†L8-L26】
  - Outputs: Returns an HTML string for the main menu, including list items and hints.【F:src/ui/screens.js†L16-L36】
  - Side effects: None; pure template generator.【F:src/ui/screens.js†L8-L36】
  - Shared state touched and where it’s used: Consumed by `renderMainMenu()` to populate the menu layer in menu mode.【F:src/ui/screens.js†L8-L36】【F:src/app.js†L251-L260】【F:src/app.js†L391-L405】
  - Dependencies: Uses `ensureEscapeHtml` for sanitization.【F:src/ui/screens.js†L10-L24】
  - Edge cases handled or missed: Defaults missing strings to empty values and tolerates absent options, resulting in an empty list; does not localize hints.【F:src/ui/screens.js†L16-L35】
  - Performance: Iterates once over options to build list items.【F:src/ui/screens.js†L16-L27】
  - Units / spaces: Pure HTML markup; uses `is-selected` CSS class to denote selection.【F:src/ui/screens.js†L20-L25】
  - Determinism: Deterministic for the same context data.【F:src/ui/screens.js†L8-L36】
  - Keep / change / delete: Keep; core template used whenever the main menu is shown.【F:src/ui/screens.js†L8-L36】【F:src/app.js†L251-L260】
  - Confidence / assumptions: High confidence; assumes options array items contain `key`/`label` strings.【F:src/ui/screens.js†L16-L25】




- `pauseMenuScreen`
  - Purpose: Generates HTML for the pause menu, displaying available pause actions and the current selection.【F:src/ui/screens.js†L39-L63】
  - Inputs: `ctx` (`options`, `selectedIndex`) plus optional `helpers` with escape function.【F:src/ui/screens.js†L39-L53】
  - Outputs: Returns an HTML string with a title, option list, and control hint.【F:src/ui/screens.js†L43-L61】
  - Side effects: None; pure template.【F:src/ui/screens.js†L39-L61】
  - Shared state touched and where it’s used: Rendered by `renderPauseMenu()` when the app enters pause mode.【F:src/ui/screens.js†L39-L61】【F:src/app.js†L314-L322】【F:src/app.js†L391-L409】
  - Dependencies: Uses `ensureEscapeHtml`.【F:src/ui/screens.js†L41-L52】
  - Edge cases handled or missed: Gracefully handles empty options list (renders nothing inside `<ul>`); hint text is hard-coded.【F:src/ui/screens.js†L43-L61】
  - Performance: Linear over provided options.【F:src/ui/screens.js†L43-L54】
  - Units / spaces: HTML markup only with `is-selected` class toggles.【F:src/ui/screens.js†L47-L52】
  - Determinism: Deterministic for identical inputs.【F:src/ui/screens.js†L39-L63】
  - Keep / change / delete: Keep; required to render the pause overlay.【F:src/ui/screens.js†L39-L61】【F:src/app.js†L314-L322】
  - Confidence / assumptions: High confidence; assumes options include `key` and `label` values.【F:src/ui/screens.js†L43-L52】




- `vehicleSelectScreen`
  - Purpose: Builds the vehicle selection UI markup, including preview metadata for animations and contextual labels.【F:src/ui/screens.js†L65-L175】
  - Inputs: `ctx` fields (`title`, `vehicleLabel`, `vehicleDescription`, `optionIndex`, `optionCount`, `previewSrc`, `previewAtlas`) and optional `helpers` (`escapeHtml`, `resolveAssetUrl`).【F:src/ui/screens.js†L65-L112】
  - Outputs: Returns an HTML string with vehicle details, preview container, navigation hints, and counter text.【F:src/ui/screens.js†L99-L175】
  - Side effects: None; pure templating.【F:src/ui/screens.js†L65-L175】
  - Shared state touched and where it’s used: Consumed by `renderVehicleSelect()` to display selection UI when picking a car.【F:src/ui/screens.js†L65-L175】【F:src/app.js†L325-L342】【F:src/app.js†L391-L411】
  - Dependencies: Relies on `ensureEscapeHtml` and optional asset resolver helper for preview URLs.【F:src/ui/screens.js†L75-L118】
  - Edge cases handled or missed: Safely handles missing preview data, clamps option index/count, and only marks previews as animated when atlas metadata is complete; does not validate atlas integrity beyond numeric checks.【F:src/ui/screens.js†L80-L175】
  - Performance: Constant-time string assembly with a few arithmetic operations; no loops beyond small attribute list.【F:src/ui/screens.js†L98-L165】
  - Units / spaces: Uses counts for option indices, frame duration in seconds, and CSS custom properties for columns/rows; coordinates remain in CSS space.【F:src/ui/screens.js†L90-L160】
  - Determinism: Deterministic for the same context data.【F:src/ui/screens.js†L65-L175】
  - Keep / change / delete: Keep; encapsulates complex preview markup separate from logic.【F:src/ui/screens.js†L65-L175】【F:src/app.js†L325-L342】
  - Confidence / assumptions: High confidence; assumes atlas metadata follows expected structure when provided.【F:src/ui/screens.js†L81-L110】



- `settingsMenuScreen`
  - Purpose: Generates the Settings menu HTML, listing each configurable option and highlighting the current selection so the UI can be rendered without manual DOM manipulation.【F:src/ui/screens.js†L147-L175】
  - Inputs: `ctx` — expects `{ options, selectedIndex }` where `options` is an array of menu option objects (falls back to `[]`) and `selectedIndex` is the zero-based highlighted entry; `helpers` — optional object supplying `escapeHtml` for sanitization.【F:src/ui/screens.js†L147-L165】
  - Outputs: Returns an HTML string containing the Settings menu wrapper, option list, and control hint.【F:src/ui/screens.js†L168-L174】
  - Side effects: None; pure string builder.【F:src/ui/screens.js†L147-L174】
  - Shared state touched and where it’s used: None; invoked by `renderSettings()` when the app is in the settings mode to populate the overlay.【F:src/app.js†L291-L311】
  - Dependencies: Uses `ensureEscapeHtml` to obtain a safe text encoder before interpolating labels and values.【F:src/ui/screens.js†L149-L157】
  - Edge cases handled or missed: Safely handles missing options, blank keys, or values by defaulting to empty strings and omitting value spans; does not guard against duplicate option keys or non-string labels.【F:src/ui/screens.js†L151-L166】
  - Performance: Iterates once over the provided options to assemble list items; runs on demand when the settings screen renders.【F:src/ui/screens.js†L151-L166】
  - Units / spaces: Outputs semantic HTML using CSS classes for layout; no numeric unit conversions occur.【F:src/ui/screens.js†L168-L173】
  - Determinism: Deterministic given the same `ctx` and helper inputs, since it only formats provided data.【F:src/ui/screens.js†L147-L174】
  - Keep / change / delete: Keep; consolidates settings menu markup instead of duplicating template code elsewhere.
  - Confidence / assumptions: High confidence; assumes callers pass option objects with `key`, `label`, and optional `value` fields.




- `leaderboardScreen`
  - Purpose: Renders the leaderboard screen with loading/error/empty states so the UI communicates progress and results.【F:src/ui/screens.js†L177-L214】
  - Inputs: `ctx` — expects `{ loading, error, entries }` where `entries` is an array of objects with `rank`, `name`, `score`, and optional `isHighlight`; `helpers` — optional `escapeHtml` provider.【F:src/ui/screens.js†L177-L205】
  - Outputs: Returns an HTML string with a leaderboard title, message or list, and navigation hint.【F:src/ui/screens.js†L207-L213】
  - Side effects: None; purely formats strings.【F:src/ui/screens.js†L177-L213】
  - Shared state touched and where it’s used: None; consumed by `renderLeaderboard()` to fill the menu panel during leaderboard mode.【F:src/app.js†L281-L288】
  - Dependencies: Relies on `ensureEscapeHtml` to sanitize interpolated fields before embedding them in the markup.【F:src/ui/screens.js†L179-L203】
  - Edge cases handled or missed: Provides fallback messages for loading, fetch errors, and empty datasets; highlights entries via `isHighlight`; does not paginate long leaderboards.【F:src/ui/screens.js†L181-L205】
  - Performance: Maps over the supplied entry list once; invoked when the leaderboard is displayed.【F:src/ui/screens.js†L188-L205】
  - Units / spaces: Outputs HTML structure and CSS classes only; no numeric unit conversions.【F:src/ui/screens.js†L207-L213】
  - Determinism: Deterministic for a given input context and helper functions.【F:src/ui/screens.js†L177-L213】
  - Keep / change / delete: Keep; centralizes leaderboard templating rather than scattering markup across the app.
  - Confidence / assumptions: High confidence; assumes entries provide stringifiable ranks, names, and scores.




- `attractScreen`
  - Purpose: Produces the attract-mode video container so the game can loop a promotional clip when idle.【F:src/ui/screens.js†L216-L229】
  - Inputs: `ctx` — optional object with `videoSrc`, defaulting to the bundled attract-loop MP4.【F:src/ui/screens.js†L216-L224】
  - Outputs: Returns HTML for a full-screen video element with the configured source.【F:src/ui/screens.js†L222-L227】
  - Side effects: None; returns a string only.【F:src/ui/screens.js†L216-L228】
  - Shared state touched and where it’s used: None; rendered by `renderAttract()` when the application enters attract mode.【F:src/app.js†L346-L347】
  - Dependencies: No helper dependencies beyond template literals.【F:src/ui/screens.js†L216-L228】
  - Edge cases handled or missed: Omits the `<source>` tag when `videoSrc` is falsy; assumes MP4 encoding and does not expose playback controls.【F:src/ui/screens.js†L216-L226】
  - Performance: Constant work—only string interpolation; called when entering attract mode.【F:src/ui/screens.js†L216-L228】
  - Units / spaces: Generates HTML with CSS classes for layout; no numeric units handled.【F:src/ui/screens.js†L222-L227】
  - Determinism: Deterministic given the same `videoSrc` input.【F:src/ui/screens.js†L216-L228】
  - Keep / change / delete: Keep; isolates attract-mode markup from the controller logic.
  - Confidence / assumptions: High confidence; assumes the provided video path is valid and autoplay is acceptable.




- `raceCompleteScreen`
  - Purpose: Builds the race-complete UI, covering the preparation, name-entry, and results phases so players understand post-race flow.【F:src/ui/screens.js†L231-L296】
  - Inputs: `ctx` — object with `active`, `phase`, `timeLabel`, `letters`, `confirmed`, `currentIndex`, and `playerRank`; `helpers` — optional `escapeHtml` provider.【F:src/ui/screens.js†L231-L288】
  - Outputs: Returns HTML for the active race-complete screen, including prompts, timers, and rank readouts.【F:src/ui/screens.js†L244-L294】
  - Side effects: None; string generation only.【F:src/ui/screens.js†L231-L296】
  - Shared state touched and where it’s used: None; invoked by `renderRaceComplete()` whenever the app is in the race-complete mode to display status.【F:src/app.js†L351-L359】
  - Dependencies: Uses `ensureEscapeHtml` to sanitize user-entered letters and labels.【F:src/ui/screens.js†L241-L288】
  - Edge cases handled or missed: Displays a waiting message while inactive, highlights the current name-entry slot, and copes with missing rank/time strings; does not enforce character limits beyond the provided `letters` array.【F:src/ui/screens.js†L243-L287】
  - Performance: Maps over the `letters` array once per render; otherwise constant time and used only when the race-complete overlay is visible.【F:src/ui/screens.js†L252-L268】
  - Units / spaces: Renders HTML markup and CSS classes; no numeric units beyond textual rank/time labels.【F:src/ui/screens.js†L244-L294】
  - Determinism: Deterministic for a given context and helper set.【F:src/ui/screens.js†L231-L296】
  - Keep / change / delete: Keep; encapsulates nuanced race completion states without complicating controller logic.
  - Confidence / assumptions: High confidence; assumes controller supplies consistent `phase` strings and letter arrays.

### 3.3 Asset Loading & Bootstrapping (`src/bootstrap.js`)



- `loadManifestTextures`
  - Purpose: Asynchronously loads every texture listed in a manifest and registers it with the renderer so later systems can reference GPU resources by key.【F:src/bootstrap.js†L18-L27】
  - Inputs: `manifest` — object mapping texture keys to relative URLs; accepts `null`/`undefined` by treating them as an empty manifest.【F:src/bootstrap.js†L18-L24】
  - Outputs: Returns a promise that resolves once all textures are queued and stored; no direct return data on completion.【F:src/bootstrap.js†L18-L27】
  - Side effects: Populates `World.assets.textures` with loaded WebGL textures, enabling lookups by other modules.【F:src/bootstrap.js†L24-L27】
  - Shared state touched and where it’s used: Writes into `World.assets.textures`, which sprite metadata resolvers use to fetch materials when spawning sprites.【F:src/gameplay.js†L388-L399】
  - Dependencies: Uses `World.resolveAssetUrl` for path resolution when available and `glr.loadTexture` to fetch GPU-ready textures in parallel via `Promise.all`.【F:src/bootstrap.js†L21-L26】
  - Edge cases handled or missed: Skips work when the manifest is empty; does not retry or catch failed texture loads, so rejections propagate to callers.【F:src/bootstrap.js†L19-L27】
  - Performance: Issues concurrent loads for every manifest entry; invoked during startup so cost scales with manifest size.【F:src/bootstrap.js†L19-L27】
  - Units / spaces: Handles URL strings and WebGL texture objects; no numeric unit translation.【F:src/bootstrap.js†L21-L26】
  - Determinism: Deterministic for identical manifests and asset servers, though outcomes depend on network availability.
  - Keep / change / delete: Keep; isolates manifest loading logic and parallelization from higher-level bootstrap code.
  - Confidence / assumptions: High confidence; assumes manifests map to valid URLs and `glr.loadTexture` rejects on failure.




- `loadAssets`
  - Purpose: Coordinates startup asset loading by processing the core manifest and any sprite-catalog textures so rendering has everything it needs before the game starts.【F:src/bootstrap.js†L30-L35】
  - Inputs: None; reads manifests from global `World.assets` and optional `SpriteCatalog`.【F:src/bootstrap.js†L31-L34】
  - Outputs: Returns a promise that resolves after all manifest textures finish loading.【F:src/bootstrap.js†L30-L35】
  - Side effects: Triggers `loadManifestTextures`, thereby filling `World.assets.textures` for use by gameplay and rendering systems.【F:src/bootstrap.js†L31-L35】
  - Shared state touched and where it’s used: Ensures textures referenced by sprite metadata (e.g., vehicle and signage materials) are present before scene reset occurs.【F:src/gameplay.js†L388-L399】【F:src/bootstrap.js†L57-L65】
  - Dependencies: Calls `loadManifestTextures` twice—once for the world manifest and again for any sprite-catalog-defined textures.【F:src/bootstrap.js†L31-L34】
  - Edge cases handled or missed: Safely skips sprite-catalog loading when the API is unavailable; does not debounce duplicate keys across manifests.【F:src/bootstrap.js†L31-L35】
  - Performance: Sequentially awaits each manifest load; runs only during bootstrap.【F:src/bootstrap.js†L30-L35】
  - Units / spaces: Deals with manifest objects and promises only.【F:src/bootstrap.js†L30-L35】
  - Determinism: Deterministic given the same manifests and network conditions.
  - Keep / change / delete: Keep; provides a single entry point for boot-time asset fetching.
  - Confidence / assumptions: High confidence; assumes manifests remain relatively small and `SpriteCatalog` exposes `getTextureManifest` when present.




- `setupCallbacks`
  - Purpose: Hooks gameplay lifecycle callbacks into renderer and app handlers so UI elements respond to resets, respawns, and race finishes automatically.【F:src/bootstrap.js†L38-L55】
  - Inputs: None; operates on global `Gameplay`, `Renderer`, and optional `App` objects.【F:src/bootstrap.js†L38-L55】
  - Outputs: None; configures callbacks in place.【F:src/bootstrap.js†L38-L55】
  - Side effects: Assigns functions to `Gameplay.state.callbacks` entries that trigger renderer matte transitions, scene resets, and app race-finish handlers.【F:src/bootstrap.js†L39-L53】
  - Shared state touched and where it’s used: Sets callback hooks consumed when gameplay queues resets, respawns, or race completion events during the simulation loop.【F:src/gameplay.js†L2757-L2771】【F:src/gameplay.js†L2323-L2325】
  - Dependencies: Calls renderer matte helpers, `Gameplay.resetScene`, and optional `App.handleRaceFinish` when those callbacks fire.【F:src/bootstrap.js†L39-L53】
  - Edge cases handled or missed: Guards against missing respawn payloads and absent app handlers; does not reapply callbacks if `Gameplay.state.callbacks` is replaced later.【F:src/bootstrap.js†L42-L53】
  - Performance: Constant-time assignments executed once at startup.【F:src/bootstrap.js†L38-L55】
  - Units / spaces: Deals with callback references and time values passed in milliseconds for race finishes.【F:src/bootstrap.js†L50-L53】
  - Determinism: Deterministic, though effects depend on runtime gameplay events triggering the callbacks.【F:src/bootstrap.js†L38-L55】
  - Keep / change / delete: Keep; cleanly centralizes wiring between gameplay events and presentation layers.
  - Confidence / assumptions: High confidence; assumes `Gameplay.state.callbacks` remains mutable and renderer/app functions exist when needed.

### 3.4 Vehicle Control & Physics (`src/gameplay.js`)



- `trackLengthRef`
  - Purpose: Provides the current total track length so wrap calculations can stay in sync with dynamic track data.【F:src/gameplay.js†L73-L76】
  - Inputs: None; reads `World.data.trackLength` from the captured `data` object.【F:src/gameplay.js†L58-L76】
  - Outputs: Returns the track length in world-distance units (or `0` if unset).【F:src/gameplay.js†L74-L76】
  - Side effects: None; read-only accessor.【F:src/gameplay.js†L74-L76】
  - Shared state touched and where it’s used: Supplies length values to wrap helpers when spawning sprites and advancing effects, ensuring positions stay within track bounds.【F:src/gameplay.js†L841-L845】【F:src/gameplay.js†L1225-L1233】
  - Dependencies: Relies on the `data` object populated by the world builder; no function calls.【F:src/gameplay.js†L58-L76】
  - Edge cases handled or missed: Returns `0` when `trackLength` is falsy, which can disable wrapping logic but may hide configuration mistakes.【F:src/gameplay.js†L74-L76】
  - Performance: Constant-time property access; called frequently whenever `s` positions need wrapping.【F:src/gameplay.js†L74-L1233】
  - Units / spaces: Track length shares the same `s` coordinate space as segment positions (meters along the road).【F:src/gameplay.js†L74-L842】
  - Determinism: Deterministic for a given `World.data` state.【F:src/gameplay.js†L74-L76】
  - Keep / change / delete: Keep; lightweight accessor avoids hard-coding property lookups throughout the module.
  - Confidence / assumptions: High confidence; assumes `World.data.trackLength` is maintained by track-building routines.




- `hasSegments`
  - Purpose: Quickly reports whether the track has any segments so systems can bail out before doing segment-dependent work.【F:src/gameplay.js†L73-L78】
  - Inputs: None; inspects the captured `segments` array.【F:src/gameplay.js†L73-L78】
  - Outputs: Boolean indicating whether at least one segment exists.【F:src/gameplay.js†L77-L78】
  - Side effects: None.【F:src/gameplay.js†L77-L78】
  - Shared state touched and where it’s used: Governs early exits throughout gameplay—for example, wrapping segment indices and spawning drift effects both guard on `hasSegments()` before proceeding.【F:src/gameplay.js†L85-L90】【F:src/gameplay.js†L1213-L1236】
  - Dependencies: None beyond the `segments` closure array.【F:src/gameplay.js†L73-L78】
  - Edge cases handled or missed: Returns `false` during bootstrap before track data loads; does not validate segment integrity when count > 0.【F:src/gameplay.js†L73-L78】
  - Performance: Constant; called frequently in per-frame code paths.【F:src/gameplay.js†L77-L1236】
  - Units / spaces: N/A—boolean flag only.【F:src/gameplay.js†L77-L78】
  - Determinism: Deterministic for a given `segments` array state.【F:src/gameplay.js†L73-L78】
  - Keep / change / delete: Keep; tiny helper improves readability of guard clauses.
  - Confidence / assumptions: High confidence; assumes `segments` accurately reflects the loaded track.




- `wrapByLength`
  - Purpose: Wraps a longitudinal `s` value into the `[0, length)` track range so repeated laps stay numerically bounded.【F:src/gameplay.js†L79-L83】
  - Inputs: `value` — distance or coordinate to wrap; `length` — positive track length controlling the wrap window (no wrapping when `length <= 0`).【F:src/gameplay.js†L79-L83】
  - Outputs: Wrapped numeric position, preserving negative offsets by adding `length` when needed.【F:src/gameplay.js†L79-L83】
  - Side effects: None.【F:src/gameplay.js†L79-L83】
  - Shared state touched and where it’s used: Underpins segment lookups such as `segmentAtS`, ensuring player sampling stays inside the track loop.【F:src/gameplay.js†L1121-L1123】
  - Dependencies: None.【F:src/gameplay.js†L79-L83】
  - Edge cases handled or missed: Treats non-positive `length` as a no-op, which prevents NaNs but leaves callers responsible for zero-length tracks.【F:src/gameplay.js†L79-L83】
  - Performance: Constant arithmetic; often executed per frame for physics and spawning.【F:src/gameplay.js†L79-L1231】
  - Units / spaces: Works in the same `s` distance units as the rest of the track system.【F:src/gameplay.js†L79-L1123】
  - Determinism: Deterministic for numeric inputs.【F:src/gameplay.js†L79-L83】
  - Keep / change / delete: Keep; concise helper avoids duplicating modular arithmetic around the codebase.
  - Confidence / assumptions: High confidence; assumes callers pass finite numbers.




- `wrapSegmentIndex`
  - Purpose: Normalizes a segment index so lookups stay within bounds even when callers traverse past the ends of the segment array.【F:src/gameplay.js†L85-L90】
  - Inputs: `idx` — integer (or float) index to wrap into the valid `[0, segments.length)` range.【F:src/gameplay.js†L85-L90】
  - Outputs: Returns a wrapped non-negative integer index; passes through the original value when no segments are loaded.【F:src/gameplay.js†L85-L90】
  - Side effects: None.【F:src/gameplay.js†L85-L90】
  - Shared state touched and where it’s used: Enables `segmentAtIndex` and sprite placement logic to traverse the looped track safely.【F:src/gameplay.js†L1127-L1129】【F:src/gameplay.js†L2116-L2124】
  - Dependencies: Depends on the captured `segments` array and `hasSegments()` guard.【F:src/gameplay.js†L73-L90】
  - Edge cases handled or missed: Wraps negative indices by adding the segment count; when `segments.length` is zero it simply returns the input, leaving upstream code to handle emptiness.【F:src/gameplay.js†L85-L90】
  - Performance: Constant; frequently executed while generating sprite instances or iterating the track.【F:src/gameplay.js†L85-L2119】
  - Units / spaces: Operates on index positions only.【F:src/gameplay.js†L85-L1129】
  - Determinism: Deterministic for given inputs and segment count.【F:src/gameplay.js†L85-L90】
  - Keep / change / delete: Keep; prevents repeated modulus boilerplate in callers.
  - Confidence / assumptions: High confidence; assumes `segments.length` fits within standard number precision.




- `ensureArray`
  - Purpose: Guarantees that an object owns an array under the requested key, creating one when absent, so callers can push into it without guards.【F:src/gameplay.js†L92-L96】
  - Inputs: `obj` — target object (can be falsy); `key` — property name to ensure as an array.【F:src/gameplay.js†L92-L96】
  - Outputs: Returns the existing or newly created array; falls back to an empty array when `obj` is falsy.【F:src/gameplay.js†L92-L96】
  - Side effects: Initializes `obj[key]` to `[]` when missing, mutating the supplied object.【F:src/gameplay.js†L92-L96】
  - Shared state touched and where it’s used: Populates per-segment sprite and car collections during gameplay and spawning routines.【F:src/gameplay.js†L863-L865】【F:src/gameplay.js†L1213-L1236】
  - Dependencies: None.【F:src/gameplay.js†L92-L96】
  - Edge cases handled or missed: Safely handles falsy objects by returning a new array, though callers must recognize that pushes into the returned array won't persist when `obj` is null.【F:src/gameplay.js†L92-L96】
  - Performance: Constant-time check; invoked frequently while managing per-segment entities.【F:src/gameplay.js†L92-L1236】
  - Units / spaces: N/A—creates arrays only.【F:src/gameplay.js†L92-L96】
  - Determinism: Deterministic for the same object and key.【F:src/gameplay.js†L92-L96】
  - Keep / change / delete: Keep; reduces repetitive `if (!obj[key]) obj[key] = []` patterns.
  - Confidence / assumptions: High confidence; assumes callers respect the returned array semantics.




- `atlasFrameUv`
  - Purpose: Converts a frame index within a sprite atlas into normalized UV coordinates for rendering.【F:src/gameplay.js†L98-L112】
  - Inputs: `frameIndex` — desired frame number; `columns` — number of columns in the atlas; `totalFrames` — total frames available (clamped to ≥1).【F:src/gameplay.js†L98-L111】
  - Outputs: Returns an object with the four UV corners (`u1`…`v4`) covering the frame tile.【F:src/gameplay.js†L108-L111】
  - Side effects: None.【F:src/gameplay.js†L98-L111】
  - Shared state touched and where it’s used: Supplies UVs when updating sprite frames and when fallback atlas metadata computes frame coordinates.【F:src/gameplay.js†L198-L205】【F:src/gameplay.js†L356-L363】
  - Dependencies: Pure math helper; no external calls beyond `Math` functions.【F:src/gameplay.js†L98-L111】
  - Edge cases handled or missed: Clamps frame indices into the valid range and enforces at least one column/row; does not handle atlases with irregular layouts or padding.【F:src/gameplay.js†L98-L111】
  - Performance: Constant arithmetic invoked per frame update for animated sprites.【F:src/gameplay.js†L98-L205】
  - Units / spaces: UV coordinates in normalized [0,1] texture space.【F:src/gameplay.js†L108-L111】
  - Determinism: Deterministic for identical numeric inputs.【F:src/gameplay.js†L98-L111】
  - Keep / change / delete: Keep; encapsulates atlas math that would otherwise be error-prone when repeated.
  - Confidence / assumptions: High confidence; assumes uniform grids without per-frame offsets.




- `normalizeAnimClip`
  - Purpose: Sanitizes raw animation clip definitions into a canonical shape with validated frame lists and playback mode.【F:src/gameplay.js†L114-L124】
  - Inputs: `rawClip` — potentially sparse clip object; `fallbackFrame` — numeric frame to insert when no frames exist; `useFallback` — boolean controlling fallback insertion.【F:src/gameplay.js†L114-L123】
  - Outputs: Returns `{ frames, playback }` where frames is a filtered array of finite numbers and playback is one of `loop`, `pingpong`, `once`, or `none`.【F:src/gameplay.js†L114-L123】
  - Side effects: None.【F:src/gameplay.js†L114-L123】
  - Shared state touched and where it’s used: Feeds into `createSpriteAnimationState` so sprite instances can initialize consistent animation state.【F:src/gameplay.js†L126-L140】
  - Dependencies: Uses local `Number.isFinite` filtering and lowercase string comparisons; no external modules.【F:src/gameplay.js†L114-L123】
  - Edge cases handled or missed: Filters out non-numeric frames and provides a fallback when desired; treats unrecognized playback strings as `none` but does not deduplicate frames.【F:src/gameplay.js†L114-L123】
  - Performance: Clones the frame array once; invoked during sprite instantiation, not per frame.【F:src/gameplay.js†L117-L140】
  - Units / spaces: Works with animation frame indices; no time units until playback occurs.【F:src/gameplay.js†L114-L123】
  - Determinism: Deterministic for the same input clip and fallback options.【F:src/gameplay.js†L114-L123】
  - Keep / change / delete: Keep; centralizes clip sanitization logic that would otherwise be duplicated wherever clips are loaded.
  - Confidence / assumptions: High confidence; assumes clips, when provided, already follow general structure (e.g., `frames` array).




- `createSpriteAnimationState`
  - Purpose: Combines base and interaction clips into a runtime animation state object that tracks frame progression, playback rules, and defaults.【F:src/gameplay.js†L126-L150】
  - Inputs: `baseClipRaw`, `interactClipRaw` — clip definitions; `frameDuration` — seconds per frame (defaults to 1/60 when invalid); `fallbackFrame` — frame to use when clips are empty.【F:src/gameplay.js†L126-L148】
  - Outputs: Returns an animation state object with clip references, frame indices, timers, and flags, or `null` when no usable frames exist.【F:src/gameplay.js†L131-L149】
  - Side effects: None; constructs a new object.【F:src/gameplay.js†L126-L149】
  - Shared state touched and where it’s used: Used when instantiating sprites so each sprite tracks its own playback state.【F:src/gameplay.js†L848-L855】
  - Dependencies: Calls `normalizeAnimClip` for each clip before assembling the state.【F:src/gameplay.js†L127-L130】
  - Edge cases handled or missed: Returns `null` when both clips lack frames, ensures fallback frames populate static animations, and configures playback flags based on clip modes; does not validate that fallback frames exist within atlas ranges.【F:src/gameplay.js†L126-L149】
  - Performance: Constant work per sprite instantiation.【F:src/gameplay.js†L126-L149】
  - Units / spaces: Uses frame indices and seconds for duration/accumulator values.【F:src/gameplay.js†L138-L147】
  - Determinism: Deterministic for given clip inputs.【F:src/gameplay.js†L126-L149】
  - Keep / change / delete: Keep; encapsulates animation state initialization logic for reuse.
  - Confidence / assumptions: High confidence; assumes clips are relatively small arrays.




- `currentAnimationClip`
  - Purpose: Returns the clip currently designated as active so frame advancement code knows which frame list to use.【F:src/gameplay.js†L153-L157】
  - Inputs: `anim` — animation state object with `active` and `clips` fields.【F:src/gameplay.js†L153-L157】
  - Outputs: The active clip object or `null` when unavailable.【F:src/gameplay.js†L153-L157】
  - Side effects: None.【F:src/gameplay.js†L153-L157】
  - Shared state touched and where it’s used: Consulted by `advanceSpriteAnimation` on every frame tick before updating frame indices.【F:src/gameplay.js†L207-L214】
  - Dependencies: None beyond reading the `anim` object.【F:src/gameplay.js†L153-L157】
  - Edge cases handled or missed: Falls back to the base clip when the active mode is not `interact` or the interaction clip is missing; returns `null` when the state object is malformed.【F:src/gameplay.js†L153-L157】
  - Performance: Constant; executed per sprite per frame.【F:src/gameplay.js†L207-L214】
  - Units / spaces: N/A—returns clip objects only.【F:src/gameplay.js†L153-L157】
  - Determinism: Deterministic for identical animation state input.【F:src/gameplay.js†L153-L157】
  - Keep / change / delete: Keep; isolates clip-selection logic for clarity.
  - Confidence / assumptions: High confidence; assumes animation states follow the structure produced by `createSpriteAnimationState`.




- `clampFrameIndex`
  - Purpose: Constrains a frame index to the valid range for a clip, preventing out-of-bounds access when switching or advancing animations.【F:src/gameplay.js†L159-L166】
  - Inputs: `idx` — desired frame index; `length` — number of frames available.【F:src/gameplay.js†L159-L165】
  - Outputs: Returns a non-negative integer within `[0, length - 1]`, or `0` when inputs are invalid.【F:src/gameplay.js†L159-L165】
  - Side effects: None.【F:src/gameplay.js†L159-L165】
  - Shared state touched and where it’s used: Used by clip switching and playback updates to keep `frameIndex` and `currentFrame` in bounds.【F:src/gameplay.js†L168-L195】【F:src/gameplay.js†L226-L283】
  - Dependencies: Relies on `Math.floor` and local logic only.【F:src/gameplay.js†L159-L165】
  - Edge cases handled or missed: Handles NaN indices and non-positive lengths by returning `0`; does not clamp to wrap-around behavior (callers handle looping separately).【F:src/gameplay.js†L159-L165】
  - Performance: Constant, invoked frequently during animation updates.【F:src/gameplay.js†L159-L283】
  - Units / spaces: Index positions only.【F:src/gameplay.js†L159-L165】
  - Determinism: Deterministic for numeric inputs.【F:src/gameplay.js†L159-L165】
  - Keep / change / delete: Keep; essential safeguard against array bounds errors.
  - Confidence / assumptions: High confidence; assumes callers pass finite lengths.




- `switchSpriteAnimationClip`
  - Purpose: Activates a different clip on an animation state, optionally restarting timing so sprites can transition between base and interaction animations.【F:src/gameplay.js†L168-L196】
  - Inputs: `anim` — animation state to mutate; `clipName` — `'base'` or `'interact'`; `restart` — boolean indicating whether to reset timers and indices.【F:src/gameplay.js†L168-L188】
  - Outputs: None; mutates the animation state in place.【F:src/gameplay.js†L168-L195】
  - Side effects: Updates `anim.active`, `frameIndex`, `direction`, `accumulator`, and playback flags; may update `currentFrame`.【F:src/gameplay.js†L172-L195】
  - Shared state touched and where it’s used: Called when interactive sprites finish interacting to return to the base clip, and when gameplay triggers interaction animations.【F:src/gameplay.js†L274-L283】【F:src/gameplay.js†L1934-L1944】
  - Dependencies: Uses `clampFrameIndex` to keep indices valid before sampling frames.【F:src/gameplay.js†L177-L194】
  - Edge cases handled or missed: Ignores requests when the desired clip is absent, and supports non-restarting transitions; does not provide blended transitions between clips.【F:src/gameplay.js†L168-L195】
  - Performance: Constant per invocation, typically triggered on discrete events rather than every frame.【F:src/gameplay.js†L168-L195】
  - Units / spaces: Operates on frame indices and seconds stored in the animation state.【F:src/gameplay.js†L168-L195】
  - Determinism: Deterministic given the same animation state and parameters.【F:src/gameplay.js†L168-L195】
  - Keep / change / delete: Keep; encapsulates clip-toggle logic that would be verbose inline.
  - Confidence / assumptions: High confidence; assumes animation states follow the structure from `createSpriteAnimationState`.




- `updateSpriteUv`
  - Purpose: Recomputes a sprite’s UV coordinates whenever its animation frame changes so rendering samples the correct atlas tile.【F:src/gameplay.js†L198-L205】
  - Inputs: `sprite` — object expected to contain `atlasInfo` metadata and the current `animFrame` index.【F:src/gameplay.js†L198-L204】
  - Outputs: None directly; assigns a `uv` object onto the sprite when data is valid.【F:src/gameplay.js†L198-L205】
  - Side effects: Mutates `sprite.uv` in place after validating atlas info.【F:src/gameplay.js†L198-L205】
  - Shared state touched and where it’s used: Called immediately after sprite creation and every time animation advances to keep GPU buffers in sync.【F:src/gameplay.js†L862-L865】【F:src/gameplay.js†L268-L283】
  - Dependencies: Uses `atlasFrameUv` to compute the coordinate data.【F:src/gameplay.js†L202-L205】
  - Edge cases handled or missed: Exits early when atlas metadata or frame index is missing, preventing crashes but leaving `sprite.uv` unchanged; does not fallback to default UVs when atlas info is absent.【F:src/gameplay.js†L198-L204】
  - Performance: Constant per invocation; runs each frame for animated sprites and on spawn for static sprites.【F:src/gameplay.js†L198-L205】【F:src/gameplay.js†L862-L865】
  - Units / spaces: Produces normalized [0,1] UV coordinates compatible with WebGL buffers.【F:src/gameplay.js†L202-L205】
  - Determinism: Deterministic with identical sprite metadata.【F:src/gameplay.js†L198-L205】
  - Keep / change / delete: Keep; central utility avoids duplicating atlas logic across render paths.
  - Confidence / assumptions: High confidence; assumes sprites that require UVs provide valid `atlasInfo`.




- `advanceSpriteAnimation`
  - Purpose: Steps a sprite’s animation forward based on elapsed time, handling looping, once, and ping-pong playback while updating sprite frames and UVs.【F:src/gameplay.js†L207-L285】
  - Inputs: `sprite` — expects an `animation` state from `createSpriteAnimationState`; `dt` — delta time in seconds since the last update.【F:src/gameplay.js†L207-L285】
  - Outputs: None; mutates the sprite’s animation state and `animFrame`/`uv` properties.【F:src/gameplay.js†L207-L285】
  - Side effects: Updates frame indices, accumulators, playback flags, current frame, and triggers clip switches back to the base animation when interaction clips finish.【F:src/gameplay.js†L220-L283】
  - Shared state touched and where it’s used: Invoked during gameplay updates to animate active sprites each frame.【F:src/gameplay.js†L2067-L2069】
  - Dependencies: Leverages `currentAnimationClip`, `clampFrameIndex`, `updateSpriteUv`, and `switchSpriteAnimationClip` to manage playback safely.【F:src/gameplay.js†L210-L283】
  - Edge cases handled or missed: Handles missing animation data, empty frame lists, and ensures playback stops at ends for `once` clips; ping-pong mode reverses direction; does not account for variable frame durations per frame.【F:src/gameplay.js†L210-L283】
  - Performance: While-loop can iterate multiple frames if `dt` is large, but otherwise runs in constant time per sprite per frame; frequency equals the sprite update cadence.【F:src/gameplay.js†L233-L266】【F:src/gameplay.js†L2067-L2072】
  - Units / spaces: Uses seconds for `dt` and frame durations, and frame indices for atlas lookups.【F:src/gameplay.js†L222-L283】
  - Determinism: Deterministic for the same sprite state and `dt`; dependent on floating-point accumulation order.【F:src/gameplay.js†L207-L285】
  - Keep / change / delete: Keep; consolidates complex playback behavior in one tested routine.
  - Confidence / assumptions: High confidence; assumes `dt` is non-negative and relatively small (per-frame timestep).




- `createSpriteMetaEntry`
  - Purpose: Produces a sprite metadata descriptor by merging defaults with catalog-provided metrics so runtime systems know scale, tint, textures, and atlas layout.【F:src/gameplay.js†L378-L409】
  - Inputs: `metrics` — optional object supplying overrides such as `wN`, `aspect`, `tint`, `textureKey`, and `atlas` data; defaults to `SPRITE_METRIC_FALLBACK`.【F:src/gameplay.js†L378-L406】
  - Outputs: Returns a new metadata object with scalar fields plus `tex` and `frameUv` helper functions tailored to the sprite.【F:src/gameplay.js†L384-L407】
  - Side effects: None; creates and returns a new object each call.【F:src/gameplay.js†L378-L407】
  - Shared state touched and where it’s used: Catalog building code calls this when converting sprite definitions into runtime metadata used during sprite instantiation.【F:src/gameplay.js†L732-L738】
  - Dependencies: Reads `World.assets.textures` when resolving textures and reuses `atlasFrameUv` for atlas frame lookups.【F:src/gameplay.js†L388-L407】
  - Edge cases handled or missed: Provides cloned tint arrays to avoid shared mutation, falls back to default texture lookups, and handles missing atlas info by returning `null`; does not deep-clone nested atlas objects beyond spread syntax.【F:src/gameplay.js†L384-L407】
  - Performance: Constant-time object construction per catalog entry.【F:src/gameplay.js†L378-L407】
  - Units / spaces: Encapsulates normalized width (`wN`) and aspect ratios, which correspond to world-space scaling parameters.【F:src/gameplay.js†L384-L399】
  - Determinism: Deterministic for the same metrics input and current world texture map.【F:src/gameplay.js†L384-L407】
  - Keep / change / delete: Keep; centralizes sprite metadata normalization across catalogs.
  - Confidence / assumptions: High confidence; assumes metrics resemble SpriteCatalog definitions and that textures may be missing during early bootstrap.




- `createInitialMetrics`
  - Purpose: Initializes the player metrics tracker with zeroed counters and timers so race statistics start from a clean slate.【F:src/gameplay.js†L1043-L1057】
  - Inputs: None.【F:src/gameplay.js†L1043-L1057】
  - Outputs: Returns a fresh metrics object containing counters for hits, boosts, air time, and other race stats.【F:src/gameplay.js†L1043-L1057】
  - Side effects: None; creates a new object.【F:src/gameplay.js†L1043-L1057】
  - Shared state touched and where it’s used: Assigned to `state.metrics` on initialization and whenever stats reset after a race.【F:src/gameplay.js†L1108-L1110】【F:src/gameplay.js†L2738-L2739】
  - Dependencies: None.【F:src/gameplay.js†L1043-L1057】
  - Edge cases handled or missed: Sets guard-rail cooldown and boolean flags to sensible defaults; does not include derived metrics like average speed (calculated elsewhere).【F:src/gameplay.js†L1043-L1057】
  - Performance: Constant; invoked on startup and resets only.【F:src/gameplay.js†L1043-L1057】
  - Units / spaces: Fields represent counts, seconds, or booleans depending on metric (e.g., `airTime` in seconds).【F:src/gameplay.js†L1043-L1057】
  - Determinism: Deterministic—always returns identical baseline data.【F:src/gameplay.js†L1043-L1057】
  - Keep / change / delete: Keep; provides a single source of truth for metric defaults.
  - Confidence / assumptions: High confidence; assumes downstream code increments these properties directly.




- `getSpriteMeta`
  - Purpose: Retrieves the sprite metadata definition for a given kind, falling back to defaults when overrides are absent.【F:src/gameplay.js†L1112-L1117】
  - Inputs: `kind` — sprite kind identifier string.【F:src/gameplay.js†L1112-L1117】
  - Outputs: Returns a metadata object describing size, tint, texture resolver, and atlas info.【F:src/gameplay.js†L1112-L1117】
  - Side effects: None; returns references without modifying state.【F:src/gameplay.js†L1112-L1117】
  - Shared state touched and where it’s used: Consulted whenever gameplay needs sprite dimensions—for example, to compute the player hitbox or spawn interactions.【F:src/gameplay.js†L1209-L1210】【F:src/gameplay.js†L1926-L1934】
  - Dependencies: Reads from `state.spriteMeta` (runtime overrides) and `DEFAULT_SPRITE_META` constants.【F:src/gameplay.js†L1102-L1117】
  - Edge cases handled or missed: Falls back to a generic default when neither overrides nor built-ins cover the requested kind, ensuring callers still receive reasonable metrics.【F:src/gameplay.js†L1112-L1117】
  - Performance: Constant lookup; executed frequently during gameplay loops.【F:src/gameplay.js†L1112-L1934】
  - Units / spaces: Metadata fields (e.g., `wN`, `aspect`) correspond to normalized world width and scaling ratios.【F:src/gameplay.js†L1112-L1117】
  - Determinism: Deterministic for the same state configuration.【F:src/gameplay.js†L1112-L1117】
  - Keep / change / delete: Keep; central accessor prevents scattering fallback logic.
  - Confidence / assumptions: High confidence; assumes `state.spriteMeta` is kept up to date with overrides from sprite data.




- `defaultGetKindScale`
  - Purpose: Supplies the default scaling rule for sprite kinds, scaling the player sprite while leaving others unchanged.【F:src/gameplay.js†L1041-L1093】
  - Inputs: `kind` — sprite kind identifier (string).【F:src/gameplay.js†L1041-L1042】
  - Outputs: Returns `player.scale` when the kind is `'PLAYER'`, otherwise `1`.【F:src/gameplay.js†L1041-L1042】
  - Side effects: None.【F:src/gameplay.js†L1041-L1042】
  - Shared state touched and where it’s used: Assigned to `state.getKindScale` so width calculations and hitboxes can scale sprites appropriately by kind.【F:src/gameplay.js†L1092-L1093】
  - Dependencies: Reads `player.scale` from configuration captured earlier in the module.【F:src/gameplay.js†L9-L22】【F:src/gameplay.js†L1041-L1042】
  - Edge cases handled or missed: Provides a simple fallback when no specialized scaler is injected; does not handle other kinds needing non-unit scale without overrides.【F:src/gameplay.js†L1041-L1093】
  - Performance: Constant; invoked whenever width calculations run.【F:src/gameplay.js†L1041-L1210】
  - Units / spaces: Returns scalar multipliers applied to normalized sprite widths.【F:src/gameplay.js†L1041-L1210】
  - Determinism: Deterministic for a given config.【F:src/gameplay.js†L1041-L1042】
  - Keep / change / delete: Keep; provides a safe default when no dynamic scaling strategy is supplied.
  - Confidence / assumptions: High confidence; assumes player scale is defined in configuration.




- `segmentAtS`
  - Purpose: Finds the track segment that covers a given longitudinal `s` position, wrapping around the track length as needed.【F:src/gameplay.js†L1119-L1123】
  - Inputs: `s` — world distance along the track (can be outside `[0, trackLength)`).【F:src/gameplay.js†L1119-L1123】
  - Outputs: Returns the corresponding segment object or `null` if no segments exist.【F:src/gameplay.js†L1119-L1123】
  - Side effects: None.【F:src/gameplay.js†L1119-L1123】
  - Shared state touched and where it’s used: Drives numerous gameplay queries—e.g., boost detection and effects rely on it to inspect the player’s current segment.【F:src/gameplay.js†L1188-L1191】【F:src/gameplay.js†L1213-L1236】
  - Dependencies: Depends on `trackLengthRef`, `wrapByLength`, `segmentLength`, and the `segments` array.【F:src/gameplay.js†L73-L1133】
  - Edge cases handled or missed: Returns `null` when no segments are available or track length is non-positive; uses floor division to select a segment but assumes evenly sized segments.【F:src/gameplay.js†L1119-L1133】
  - Performance: Constant time; executed frequently each frame for physics and rendering.【F:src/gameplay.js†L1119-L1236】
  - Units / spaces: Operates in the track’s `s` distance space; segment length derived from configuration.【F:src/gameplay.js†L73-L1133】
  - Determinism: Deterministic for given `s` and current track state.【F:src/gameplay.js†L1119-L1123】
  - Keep / change / delete: Keep; core utility for spatial queries along the track.
  - Confidence / assumptions: High confidence; assumes segment data is continuous and segment lengths are consistent.




- `segmentAtIndex`
  - Purpose: Retrieves a segment by index with automatic wrapping so callers can iterate forwards or backwards around the loop safely.【F:src/gameplay.js†L1125-L1129】
  - Inputs: `idx` — integer index (may be negative or beyond the segment count).【F:src/gameplay.js†L1125-L1129】
  - Outputs: Returns the wrapped segment or `null` when no segments exist.【F:src/gameplay.js†L1125-L1129】
  - Side effects: None.【F:src/gameplay.js†L1125-L1129】
  - Shared state touched and where it’s used: Used extensively when generating sprite placements and when computing neighbor segments for effects.【F:src/gameplay.js†L742-L783】【F:src/gameplay.js†L2116-L2124】
  - Dependencies: Utilizes `hasSegments()` and `wrapSegmentIndex` to ensure safe access.【F:src/gameplay.js†L77-L90】【F:src/gameplay.js†L1125-L1129】
  - Edge cases handled or missed: Returns `null` when the segment list is empty; does not validate that the returned segment is fully populated (assumes data integrity).【F:src/gameplay.js†L1125-L1129】
  - Performance: Constant lookup; used frequently during placement loops.【F:src/gameplay.js†L742-L2124】
  - Units / spaces: Works with zero-based segment indices.【F:src/gameplay.js†L1125-L1129】
  - Determinism: Deterministic for a given index and segment list.【F:src/gameplay.js†L1125-L1129】
  - Keep / change / delete: Keep; wrapper simplifies repetitive modulo logic.
  - Confidence / assumptions: High confidence; assumes `segments` array remains stable during iteration.




- `elevationAt`
  - Purpose: Computes the interpolated road height at a longitudinal position using the current segment geometry.【F:src/gameplay.js†L1131-L1137】
  - Inputs: `s` — world distance along the track.【F:src/gameplay.js†L1131-L1137】
  - Outputs: Returns the vertical world coordinate at that `s`, defaulting to `0` when no segments exist.【F:src/gameplay.js†L1131-L1137】
  - Side effects: None.【F:src/gameplay.js†L1131-L1137】
  - Shared state touched and where it’s used: Feeds into ground-profile calculations and physics routines when determining vehicle height and camera tilt.【F:src/gameplay.js†L1139-L1148】【F:src/gameplay.js†L2412-L2416】
  - Dependencies: Uses `trackLengthRef`, `wrapByLength`, `segmentLength`, and `lerp` to blend between segment endpoints.【F:src/gameplay.js†L52-L1137】
  - Edge cases handled or missed: Safely handles empty track or zero length by returning `0`; assumes segments provide `p1.world`/`p2.world` coordinates.【F:src/gameplay.js†L1131-L1137】
  - Performance: Constant; invoked frequently each frame during physics and rendering.【F:src/gameplay.js†L1131-L2416】
  - Units / spaces: Works in world height units consistent with segment `y` values.【F:src/gameplay.js†L1131-L1137】
  - Determinism: Deterministic for a given `s` and track data.【F:src/gameplay.js†L1131-L1137】
  - Keep / change / delete: Keep; central interpolation helper for vertical sampling.
  - Confidence / assumptions: High confidence; assumes segment endpoints are valid and ordered along `s`.




- `groundProfileAt`
  - Purpose: Estimates the road’s slope and curvature around a position so physics and rendering can react to elevation changes smoothly.【F:src/gameplay.js†L1139-L1148】
  - Inputs: `s` — world distance along the track.【F:src/gameplay.js†L1139-L1148】
  - Outputs: Returns `{ y, dy, d2y }` containing elevation, first derivative, and second derivative.【F:src/gameplay.js†L1139-L1148】
  - Side effects: None.【F:src/gameplay.js†L1139-L1148】
  - Shared state touched and where it’s used: Supplies height data to player floor calculations and other slope-aware systems.【F:src/gameplay.js†L1153-L1160】【F:src/gameplay.js†L1888-L1897】
  - Dependencies: Relies on `elevationAt` sampled slightly ahead and behind the target point, using a step based on segment length.【F:src/gameplay.js†L1139-L1148】
  - Edge cases handled or missed: Provides zero derivatives when segments are missing; uses a minimum sampling distance to avoid division by zero but may underrepresent very sharp transitions.【F:src/gameplay.js†L1139-L1148】
  - Performance: Calls `elevationAt` three times per invocation; used repeatedly in physics updates.【F:src/gameplay.js†L1139-L1897】
  - Units / spaces: Elevation (`y`) in world units, slopes (`dy`, `d2y`) per unit `s`.【F:src/gameplay.js†L1139-L1148】
  - Determinism: Deterministic given current track geometry.【F:src/gameplay.js†L1139-L1148】
  - Keep / change / delete: Keep; encapsulates derivative sampling needed for physics smoothing.
  - Confidence / assumptions: High confidence; assumes segment spacing is fine-grained enough for finite difference approximation.




- `playerFloorHeightAt`
  - Purpose: Determines the player vehicle’s floor height at a given `s` and lateral position, respecting custom floor overrides when available.【F:src/gameplay.js†L1150-L1159】
  - Inputs: `s` — longitudinal position (defaults to current player `s`); `nNorm` — normalized lateral offset (defaults to player N); `groundProfile` — optional precomputed `{ y, dy, d2y }` to reuse.【F:src/gameplay.js†L1150-L1159】
  - Outputs: Returns the height value the player should rest on.【F:src/gameplay.js†L1150-L1159】
  - Side effects: None.【F:src/gameplay.js†L1150-L1159】
  - Shared state touched and where it’s used: Called throughout physics updates to keep the player aligned with the road surface during movement and landings.【F:src/gameplay.js†L1897-L1903】【F:src/gameplay.js†L2215-L2221】
  - Dependencies: Prefers `World.floorElevationAt` when defined, falling back to `groundProfileAt` otherwise.【F:src/gameplay.js†L1151-L1160】
  - Edge cases handled or missed: Handles missing floor samplers by using the road profile; assumes provided `groundProfile` matches the same `s`/`nNorm`.【F:src/gameplay.js†L1150-L1160】
  - Performance: Constant after optional profile reuse; invoked every frame for player physics.【F:src/gameplay.js†L1150-L2221】
  - Units / spaces: Returns height in world units (same scale as elevation samples).【F:src/gameplay.js†L1150-L1159】
  - Determinism: Deterministic for the same track state and inputs.【F:src/gameplay.js†L1150-L1159】
  - Keep / change / delete: Keep; consolidates multi-source floor sampling logic.
  - Confidence / assumptions: High confidence; assumes `floorElevationAt` (when provided) returns finite values.




- `boostZonesOnSegment`
  - Purpose: Retrieves the list of boost zones attached to a segment so gameplay and rendering can highlight or process them.【F:src/gameplay.js†L1162-L1165】
  - Inputs: `seg` — segment object, expected to carry a `features.boostZones` array.【F:src/gameplay.js†L1162-L1165】
  - Outputs: Returns the boost-zone array or an empty list when absent.【F:src/gameplay.js†L1162-L1165】
  - Side effects: None.【F:src/gameplay.js†L1162-L1165】
  - Shared state touched and where it’s used: Used to detect player boost interactions and to render boost indicators on the road.【F:src/gameplay.js†L1180-L1184】【F:src/render.js†L1092-L1098】
  - Dependencies: None; simple property accessor.【F:src/gameplay.js†L1162-L1165】
  - Edge cases handled or missed: Returns an empty array when the property is missing or not an array; does not deep-copy results, so callers should avoid mutating shared zone definitions.【F:src/gameplay.js†L1162-L1165】
  - Performance: Constant; invoked every frame for the active segment during boost checks and drawing.【F:src/gameplay.js†L1180-L1184】【F:src/render.js†L1092-L1098】
  - Units / spaces: Boost zones encode normalized lateral bounds and types, consistent with other gameplay zone data.【F:src/gameplay.js†L1162-L1184】
  - Determinism: Deterministic for a given segment object.【F:src/gameplay.js†L1162-L1165】
  - Keep / change / delete: Keep; small helper keeps feature access consistent and safe.
  - Confidence / assumptions: High confidence; assumes segments store boost-zone definitions under `features.boostZones`.
  
  
  
  - `playerWithinBoostZone`
    - Purpose: Checks whether a player's normalized lateral position falls between a boost zone's start and end bounds, defaulting to lane clamps when the zone omits them.【F:src/gameplay.js†L1170-L1178】
    - Inputs: `zone` — boost zone with optional `nStart`/`nEnd`; `nNorm` — player lateral offset clamped to lane range (defaults come from ±2 passed through `clampBoostLane`).【F:src/gameplay.js†L69-L75】【F:src/gameplay.js†L1170-L1178】
    - Outputs: Returns `true` when `nNorm` lies between the zone bounds, otherwise `false`.【F:src/gameplay.js†L1176-L1178】
    - Side effects: None; purely computes a boolean.【F:src/gameplay.js†L1170-L1178】
    - Shared state touched and where it’s used: Does not mutate shared state; consumed by `boostZonesForPlayer` while evaluating the player's active boost zones in jump detection and physics updates.【F:src/gameplay.js†L1182-L1191】【F:src/gameplay.js†L2178-L2184】
    - Dependencies: Uses `clampBoostLane` plus `Math.min`/`Math.max` to sanitize bounds.【F:src/gameplay.js†L1172-L1177】
    - Edge cases handled or missed: Returns `false` when the zone object is missing; handles reversed start/end ordering via `Math.min`/`Math.max`, but assumes `nNorm` is finite.【F:src/gameplay.js†L1171-L1178】
    - Performance: Constant time; invoked once per zone when filtering the current segment each frame.【F:src/gameplay.js†L1182-L1184】【F:src/gameplay.js†L2178-L2184】
    - Units / spaces: Operates in normalized lane (`N`) space shared with `state.playerN` and lane clamps.【F:src/gameplay.js†L1172-L1178】【F:src/gameplay.js†L2170-L2184】
    - Determinism: Deterministic for given inputs because it performs only arithmetic comparisons.【F:src/gameplay.js†L1170-L1178】
    - Keep / change / delete: Keep; consolidates lane-bound fallback logic that would otherwise repeat inside callers.
    - Confidence / assumptions: High confidence; assumes `clampBoostLane` returns consistent bounds and `nNorm` already reflects the player.

  
  
  
  - `boostZonesForPlayer`
    - Purpose: Collects only the boost zones on a segment that currently cover the player's lateral position so other systems can react.【F:src/gameplay.js†L1181-L1184】
    - Inputs: `seg` — segment containing potential zones; `nNorm` — player’s normalized lane offset to test.【F:src/gameplay.js†L1181-L1184】
    - Outputs: Returns a filtered array of zones that include `nNorm`, or an empty array when none match.【F:src/gameplay.js†L1182-L1184】
    - Side effects: None; produces a new filtered array and leaves segment data untouched.【F:src/gameplay.js†L1181-L1184】
    - Shared state touched and where it’s used: Reads segment feature data but no globals; used by `jumpZoneForPlayer` and by the per-frame physics step to drive boost behavior.【F:src/gameplay.js†L1187-L1191】【F:src/gameplay.js†L2178-L2184】
    - Dependencies: Calls `boostZonesOnSegment` and `playerWithinBoostZone` for filtering.【F:src/gameplay.js†L1182-L1184】
    - Edge cases handled or missed: Short-circuits when no zones exist; assumes zone objects are well-formed and does not deep-clone them, so later mutation would affect segment data.【F:src/gameplay.js†L1182-L1184】
    - Performance: Iterates over the existing zone array; runs every frame for the current segment so zone lists should stay small.【F:src/gameplay.js†L1182-L1184】【F:src/gameplay.js†L2178-L2184】
    - Units / spaces: Uses normalized lane coordinates for comparisons consistent with boost zone definitions.【F:src/gameplay.js†L1181-L1184】
    - Determinism: Deterministic given the segment’s zone order and player position.【F:src/gameplay.js†L1181-L1184】
    - Keep / change / delete: Keep; clear helper isolates boost-zone filtering away from callers.
    - Confidence / assumptions: High confidence; assumes segment `features.boostZones` contains immutable zone descriptors during a frame.

  
  
  
  - `jumpZoneForPlayer`
    - Purpose: Finds the jump-type boost zone currently under the player so hops can trigger air boosts.【F:src/gameplay.js†L1187-L1192】
    - Inputs: None; derives the player's segment `s` and lateral position from global state.【F:src/gameplay.js†L1187-L1191】
    - Outputs: Returns the matching zone object or `null` when no jump zone applies.【F:src/gameplay.js†L1189-L1192】
    - Side effects: None; performs lookups only.【F:src/gameplay.js†L1187-L1192】
    - Shared state touched and where it’s used: Reads `state.phys.s` and `state.playerN`; used during hop attempts and spacebar boosts to decide whether to award jump bonuses.【F:src/gameplay.js†L1187-L1191】【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2586-L2590】
    - Dependencies: Calls `segmentAtS`, `boostZonesForPlayer`, and compares against `boost.types.jump`.【F:src/gameplay.js†L1187-L1192】
    - Edge cases handled or missed: Returns `null` if the segment is missing or no jump zone exists; assumes `state.phys.s` is finite and segment data is current.【F:src/gameplay.js†L1187-L1192】
    - Performance: Constant time; executed when hopping or polling jump zones during input handling.【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2586-L2590】
    - Units / spaces: Works in track distance (`s`) and normalized lane space, matching the rest of the boost system.【F:src/gameplay.js†L1187-L1191】
    - Determinism: Deterministic for a given game state snapshot.【F:src/gameplay.js†L1187-L1192】
    - Keep / change / delete: Keep; encapsulates jump-zone lookup so callers remain concise.
    - Confidence / assumptions: High confidence; assumes boost zone data stays synchronized with `segmentAtS`.

  
  
  
  - `applyBoostImpulse`
    - Purpose: Adds a forward speed impulse to the player capped by the boosted top speed when a boost event fires.【F:src/gameplay.js†L1194-L1199】
    - Inputs: None; uses `state.phys.vtan`, `player.topSpeed`, and boost tuning constants.【F:src/gameplay.js†L1194-L1199】
    - Outputs: No return value; updates `state.phys.vtan` in place.【F:src/gameplay.js†L1194-L1199】
    - Side effects: Clamps and mutates the player's tangential velocity.【F:src/gameplay.js†L1194-L1199】
    - Shared state touched and where it’s used: Modifies `state.phys`; invoked by `applyJumpZoneBoost` and by drive boost handling inside the physics step.【F:src/gameplay.js†L1202-L1206】【F:src/gameplay.js†L2201-L2205】
    - Dependencies: Relies on `clamp`, player/drift tuning, and the shared physics state object.【F:src/gameplay.js†L1194-L1199】
    - Edge cases handled or missed: Prevents negative speeds via `Math.max`, and exits gracefully when boost cap is zero; assumes `player.topSpeed` and `drift.boostScale` are finite.【F:src/gameplay.js†L1194-L1199】
    - Performance: Constant; triggered only when boosts are awarded, not every frame.【F:src/gameplay.js†L1202-L1206】【F:src/gameplay.js†L2201-L2205】
    - Units / spaces: Operates on tangential world speed (`vtan`).【F:src/gameplay.js†L1194-L1199】
    - Determinism: Deterministic given the same state and tuning constants.【F:src/gameplay.js†L1194-L1199】
    - Keep / change / delete: Keep; centralizes boost capping so the impulse logic stays consistent.
    - Confidence / assumptions: High confidence; assumes physics state is mutable and accessible here.

  
  
  
  - `applyJumpZoneBoost`
    - Purpose: Activates the player's boost timer and flash effect when entering a jump zone, layering on a speed impulse.【F:src/gameplay.js†L1202-L1207】
    - Inputs: `zone` — jump zone descriptor; ignored when falsy.【F:src/gameplay.js†L1202-L1203】
    - Outputs: None; mutates state timers and velocity.【F:src/gameplay.js†L1204-L1207】
    - Side effects: Extends `state.boostTimer`, bumps `state.phys.boostFlashTimer`, and calls `applyBoostImpulse`.【F:src/gameplay.js†L1204-L1207】
    - Shared state touched and where it’s used: Writes to global state and physics timers; triggered by hops and by spacebar boost input.【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2586-L2590】
    - Dependencies: Uses `applyBoostImpulse` along with `Math.max` and boost timing constants from `drift`.【F:src/gameplay.js†L1204-L1207】
    - Edge cases handled or missed: Returns immediately if no zone is provided; assumes timers are numeric and non-negative.【F:src/gameplay.js†L1202-L1207】
    - Performance: Constant; runs only when a jump boost is triggered.【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2586-L2590】
    - Units / spaces: Timer values are measured in seconds, aligning with physics time `phys.t`.【F:src/gameplay.js†L1204-L1207】
    - Determinism: Deterministic; no randomness involved.【F:src/gameplay.js†L1202-L1207】
    - Keep / change / delete: Keep; bundles jump-specific boost side effects in one place.
    - Confidence / assumptions: High confidence; assumes `state.phys.boostFlashTimer` exists and is time-based.

  
  
  
  - `playerHalfWN`
    - Purpose: Computes half of the player's sprite width in normalized lane units for spacing and collision checks.【F:src/gameplay.js†L1209-L1211】
    - Inputs: None; references player sprite metadata and scale from state.【F:src/gameplay.js†L1209-L1211】
    - Outputs: Returns half-width in normalized units (may be `0` if metadata is missing).【F:src/gameplay.js†L1209-L1211】
    - Side effects: None.【F:src/gameplay.js†L1209-L1211】
    - Shared state touched and where it’s used: Reads sprite meta via `getSpriteMeta` and `state.getKindScale`; widely used for smoke spawning, sparks, lateral limits, and collision tests.【F:src/gameplay.js†L1209-L1211】【F:src/gameplay.js†L1213-L1296】【F:src/gameplay.js†L1904-L1917】【F:src/gameplay.js†L1922-L1975】
    - Dependencies: Depends on `getSpriteMeta('PLAYER')` and `state.getKindScale('PLAYER')`.【F:src/gameplay.js†L1209-L1211】
    - Edge cases handled or missed: Returns `NaN` if player metadata lacks `wN`, so it assumes the metadata is populated.【F:src/gameplay.js†L1209-L1211】
    - Performance: Constant; invoked in several per-frame loops so keeping it lightweight avoids repeated metadata math in callers.【F:src/gameplay.js†L1213-L1975】
    - Units / spaces: Normalized road-width (`N`) units.【F:src/gameplay.js†L1209-L1211】
    - Determinism: Deterministic for the same sprite meta and scale.【F:src/gameplay.js†L1209-L1211】
    - Keep / change / delete: Keep; avoids duplicating scale logic throughout gameplay code.
    - Confidence / assumptions: Medium confidence; assumes metadata is loaded before use.

  
  
  
  - `spawnDriftSmokeSprites`
    - Purpose: Spawns transient drift-smoke sprites at both sides of the player while drifting to visualize tire slip.【F:src/gameplay.js†L1213-L1247】
    - Inputs: None; relies on current physics state for position, velocity, and segment selection.【F:src/gameplay.js†L1213-L1247】
    - Outputs: Returns nothing; appends new sprite objects into the current segment's `sprites` list.【F:src/gameplay.js†L1221-L1247】
    - Side effects: Allocates sprites via `allocDriftSmokeSprite`, mutates segment sprite arrays, and uses `Math.random` for jitter and inherited speed, introducing nondeterminism.【F:src/gameplay.js†L1221-L1247】
    - Shared state touched and where it’s used: Reads and writes segment sprite arrays and physics data; called repeatedly during the drift state update loop.【F:src/gameplay.js†L1213-L1247】【F:src/gameplay.js†L2289-L2299】
    - Dependencies: Uses `hasSegments`, `segmentAtS`, `playerHalfWN`, `ensureArray`, `trackLengthRef`, `wrapDistance`, and sprite allocation helpers.【F:src/gameplay.js†L1213-L1247】
    - Edge cases handled or missed: Early-outs if segments/physics are unavailable or the player is airborne; assumes `allocDriftSmokeSprite` succeeds and does not guard against allocation failure.【F:src/gameplay.js†L1213-L1247】
    - Performance: Loops over two offsets and allocates per iteration; triggered repeatedly while drifting so excessive drift duration can create many sprites.【F:src/gameplay.js†L1220-L1247】【F:src/gameplay.js†L2289-L2299】
    - Units / spaces: Positions sprites using normalized lateral offsets and wrapped track distance `s`; TTL measured in seconds.【F:src/gameplay.js†L1219-L1238】
    - Determinism: Non-deterministic because of multiple `Math.random()` samples for jitter and speed variance.【F:src/gameplay.js†L1230-L1233】
    - Keep / change / delete: Keep; encapsulates all drift-smoke initialization logic though pooling could limit allocations further.
    - Confidence / assumptions: Medium confidence; assumes sprite pools are large enough to satisfy allocations without leaks.

  
  
  
  - `spawnSparksSprites`
    - Purpose: Emits spark sprites near the contact side when the player scrapes a guard rail for visual feedback.【F:src/gameplay.js†L1250-L1296】
    - Inputs: `contactSide` — optional sign indicating which side triggered the sparks (defaults to player leaning side).【F:src/gameplay.js†L1250-L1259】
    - Outputs: No return; appends configured spark sprites to the current segment.【F:src/gameplay.js†L1260-L1296】
    - Side effects: Allocates sprites, mutates segment arrays, and samples random jitter, velocities, and screen offsets, affecting determinism.【F:src/gameplay.js†L1260-L1296】
    - Shared state touched and where it’s used: Uses physics state, player lateral position, and guard-rail contact; invoked inside the guard-rail handling loop in the physics update.【F:src/gameplay.js†L1250-L1296】【F:src/gameplay.js†L2366-L2377】
    - Dependencies: Relies on `hasSegments`, `segmentAtS`, `playerHalfWN`, `ensureArray`, `trackLengthRef`, `wrapDistance`, `allocSparksSprite`, and interpolation helpers like `lerp`.【F:src/gameplay.js†L1250-L1296】
    - Edge cases handled or missed: Exits when no segments, when the player is airborne, or when contact side is indeterminate; assumes sprite allocation succeeds.【F:src/gameplay.js†L1251-L1296】
    - Performance: Creates one sprite per call with several random computations; executed repeatedly while scraping rails, so sustained contact spawns many particles.【F:src/gameplay.js†L1259-L1296】【F:src/gameplay.js†L2366-L2377】
    - Units / spaces: Positions use normalized offsets and wrapped track distance; motion data mixes track units with screen-space velocities.【F:src/gameplay.js†L1259-L1295】
    - Determinism: Non-deterministic because of jitter and random velocity sampling.【F:src/gameplay.js†L1269-L1291】
    - Keep / change / delete: Keep; encapsulates spark setup though random seeds could be injected for replay determinism.
    - Confidence / assumptions: Medium confidence; assumes guard-rail contact detection prevents duplicate spawns within a frame.

  
  
  
  - `applyDriftSmokeMotion`
    - Purpose: Advances drift-smoke sprite motion over time, applying drag and moving sprites between segments when necessary.【F:src/gameplay.js†L1299-L1338】
    - Inputs: `sprite` — expected to be a drift-smoke sprite; `dt` — simulation step in seconds; `currentSeg` — segment currently iterated (optional).【F:src/gameplay.js†L1299-L1305】
    - Outputs: Returns a new segment reference when the sprite crosses into another segment; otherwise `null`.【F:src/gameplay.js†L1308-L1338】
    - Side effects: Mutates the sprite’s position, offsets, and drift motion velocities with drag decay.【F:src/gameplay.js†L1308-L1334】
    - Shared state touched and where it’s used: Reads track length and segment data; invoked during the per-frame sprite animation update loop.【F:src/gameplay.js†L1299-L1338】【F:src/gameplay.js†L2040-L2108】
    - Dependencies: Uses `trackLengthRef`, `wrapDistance`, and `segmentAtS` for wrapping and segment lookup.【F:src/gameplay.js†L1306-L1334】
    - Edge cases handled or missed: Returns early for missing sprites, wrong kinds, or non-positive time steps; assumes `sprite.driftMotion` exists.【F:src/gameplay.js†L1299-L1334】
    - Performance: Constant work per sprite; executed for every drift-smoke sprite each frame, so large numbers of smoke puffs can add up.【F:src/gameplay.js†L1299-L1338】【F:src/gameplay.js†L2040-L2108】
    - Units / spaces: Evolves both track-distance `s` and normalized lateral offset values; drag factors interpreted per second.【F:src/gameplay.js†L1308-L1334】
    - Determinism: Deterministic for given initial motion values and `dt`.【F:src/gameplay.js†L1299-L1338】
    - Keep / change / delete: Keep; isolates physics integration for smoke particles.
    - Confidence / assumptions: High confidence; assumes calling code initializes `sprite.driftMotion`.

  
  
  
  - `applySparksMotion`
    - Purpose: Updates spark sprite motion, including track movement, lateral slide, and screen-space trails.【F:src/gameplay.js†L1341-L1406】
    - Inputs: `sprite` — spark sprite; `dt` — time step; `currentSeg` — current segment context.【F:src/gameplay.js†L1341-L1346】
    - Outputs: Returns a different segment when the sprite crosses boundaries, otherwise `null`.【F:src/gameplay.js†L1350-L1404】
    - Side effects: Mutates track position, normalized offset, screen offsets, and motion velocities with drag and gravity.【F:src/gameplay.js†L1350-L1394】
    - Shared state touched and where it’s used: Reads track length and segment data; invoked during sprite animation updates for every spark sprite.【F:src/gameplay.js†L1341-L1404】【F:src/gameplay.js†L2040-L2108】
    - Dependencies: Uses `trackLengthRef`, `wrapDistance`, `segmentAtS`, and drag parameters stored on the sprite.【F:src/gameplay.js†L1348-L1404】
    - Edge cases handled or missed: Early returns for invalid sprites or zero time steps; assumes `sprite.driftMotion` carries screen-motion parameters.【F:src/gameplay.js†L1341-L1394】
    - Performance: Constant per sprite; cost grows with number of active sparks spawned during scraping.【F:src/gameplay.js†L1341-L1404】【F:src/gameplay.js†L2366-L2377】【F:src/gameplay.js†L2040-L2108】
    - Units / spaces: Mixes track-distance `s`, normalized offsets, and pixel-space offsets for screen trails.【F:src/gameplay.js†L1350-L1394】
    - Determinism: Deterministic once initial motion parameters are set (randomness happens at spawn time).【F:src/gameplay.js†L1341-L1404】
    - Keep / change / delete: Keep; provides encapsulated kinematics for sparks.
    - Confidence / assumptions: High confidence; assumes spark sprites always own a motion payload.

  
  
  
  - `carMeta`
    - Purpose: Retrieves the metadata describing a car sprite, defaulting to generic car data when custom metadata is absent.【F:src/gameplay.js†L1408-L1411】
    - Inputs: `car` — NPC car object that may include `type` and `meta`.【F:src/gameplay.js†L1408-L1411】
    - Outputs: Returns a metadata object for the car sprite.【F:src/gameplay.js†L1408-L1411】
    - Side effects: None.【F:src/gameplay.js†L1408-L1411】
    - Shared state touched and where it’s used: Reads from the sprite metadata table via `getSpriteMeta`; used by width/height helpers before collision logic.【F:src/gameplay.js†L1408-L1415】【F:src/gameplay.js†L1574-L1583】
    - Dependencies: Depends on `getSpriteMeta` and optional `car.meta` overrides.【F:src/gameplay.js†L1408-L1411】
    - Edge cases handled or missed: Falls back to `'CAR'` metadata when car type/meta missing; assumes `getSpriteMeta` returns something meaningful.【F:src/gameplay.js†L1408-L1411】
    - Performance: Constant and inexpensive; called for each collision width/height calculation.【F:src/gameplay.js†L1408-L1415】【F:src/gameplay.js†L1574-L1583】
    - Units / spaces: Metadata includes normalized width/height values used elsewhere.【F:src/gameplay.js†L1408-L1415】
    - Determinism: Deterministic for a given car object and metadata table.【F:src/gameplay.js†L1408-L1411】
    - Keep / change / delete: Keep; centralizes metadata fallback logic.
    - Confidence / assumptions: High confidence; assumes metadata table is already loaded.

  
  
  
  - `carHalfWN`
    - Purpose: Calculates half the normalized width of an NPC car to support spacing, avoidance, and collision checks.【F:src/gameplay.js†L1413-L1415】
    - Inputs: `car` — NPC car descriptor.【F:src/gameplay.js†L1413-L1415】
    - Outputs: Returns half-width in normalized units, defaulting to `0` if metadata lacks `wN`.【F:src/gameplay.js†L1413-L1415】
    - Side effects: None.【F:src/gameplay.js†L1413-L1415】
    - Shared state touched and where it’s used: Leverages `carMeta`; referenced by player smoke spawning and collision avoidance routines.【F:src/gameplay.js†L1413-L1415】【F:src/gameplay.js†L1213-L1296】【F:src/gameplay.js†L1965-L2000】【F:src/gameplay.js†L2455-L2535】
    - Dependencies: Calls `carMeta` to fetch the metadata.【F:src/gameplay.js†L1413-L1415】
    - Edge cases handled or missed: Returns `0` if metadata is missing or lacks `wN`, which may underrepresent actual car width.【F:src/gameplay.js†L1413-L1415】
    - Performance: Constant; computed frequently inside loops so avoiding repeated metadata lookups via this helper keeps code concise.【F:src/gameplay.js†L1413-L1415】
    - Units / spaces: Normalized road width units shared with NPC positioning.【F:src/gameplay.js†L1413-L1415】
    - Determinism: Deterministic for the same car metadata.【F:src/gameplay.js†L1413-L1415】
    - Keep / change / delete: Keep; simple helper aids readability.
    - Confidence / assumptions: High confidence; assumes metadata is static per car.

  
  
  
  - `currentPlayerForwardSpeed`
    - Purpose: Returns the player's current forward (tangential) speed clamped to a non-negative value.【F:src/gameplay.js†L1418-L1421】
    - Inputs: None; reads from `state.phys.vtan`.【F:src/gameplay.js†L1418-L1421】
    - Outputs: Non-negative numeric forward speed.【F:src/gameplay.js†L1418-L1421】
    - Side effects: None.【F:src/gameplay.js†L1418-L1421】
    - Shared state touched and where it’s used: Reads physics state; leveraged when computing near misses and sprite collision pushes.【F:src/gameplay.js†L1418-L1421】【F:src/gameplay.js†L1449-L1451】【F:src/gameplay.js†L1515-L1525】
    - Dependencies: Uses `Math.max` and `Number.isFinite` to sanitize values.【F:src/gameplay.js†L1418-L1421】
    - Edge cases handled or missed: Treats non-finite speeds as zero; assumes physics state exists.【F:src/gameplay.js†L1418-L1421】
    - Performance: Constant; often called during collision handling but trivial in cost.【F:src/gameplay.js†L1418-L1451】
    - Units / spaces: Tangential world speed units.【F:src/gameplay.js†L1418-L1421】
    - Determinism: Deterministic.【F:src/gameplay.js†L1418-L1421】
    - Keep / change / delete: Keep; avoids repeating guard logic on `state.phys.vtan`.
    - Confidence / assumptions: High confidence; assumes physics state object stays defined.

  
  
  
  - `npcForwardSpeed`
    - Purpose: Sanitizes an NPC car's forward speed for collision comparisons.【F:src/gameplay.js†L1423-L1425】
    - Inputs: `car` — NPC car with a `speed` property.【F:src/gameplay.js†L1423-L1425】
    - Outputs: Returns a non-negative forward speed.【F:src/gameplay.js†L1423-L1425】
    - Side effects: None.【F:src/gameplay.js†L1423-L1425】
    - Shared state touched and where it’s used: Reads the car object; used in near-miss scoring and collision resolution to determine push direction.【F:src/gameplay.js†L1423-L1425】【F:src/gameplay.js†L1450-L1451】【F:src/gameplay.js†L1991-L1995】
    - Dependencies: None beyond basic math checks.【F:src/gameplay.js†L1423-L1425】
    - Edge cases handled or missed: Returns `0` when the car or speed is invalid; assumes speeds are already in player-forward units.【F:src/gameplay.js†L1423-L1425】
    - Performance: Constant.【F:src/gameplay.js†L1423-L1425】
    - Units / spaces: Tangential world speed.【F:src/gameplay.js†L1423-L1425】
    - Determinism: Deterministic.【F:src/gameplay.js†L1423-L1425】
    - Keep / change / delete: Keep; keeps sanity checks centralized.
    - Confidence / assumptions: High confidence; assumes car objects expose `speed`.

  
  
  
  - `ensureCarNearMissReset`
    - Purpose: Marks an NPC car as ready for a future near-miss when the player is sufficiently far laterally away.【F:src/gameplay.js†L1428-L1436】
    - Inputs: `car` — NPC object; `combinedHalf` — sum of player and car half-widths; `lateralGap` — current lateral separation.【F:src/gameplay.js†L1428-L1436】
    - Outputs: None.【F:src/gameplay.js†L1428-L1436】
    - Side effects: Mutates the car’s `CAR_NEAR_MISS_READY` flag.【F:src/gameplay.js†L1428-L1436】
    - Shared state touched and where it’s used: Operates on car state within collision loops; called each time cars are evaluated for overlap.【F:src/gameplay.js†L1428-L1436】【F:src/gameplay.js†L1965-L1975】
    - Dependencies: Relies on numeric checks and `NEAR_MISS_RESET_SCALE` constant.【F:src/gameplay.js†L1434-L1436】
    - Edge cases handled or missed: Immediately readies the flag when parameters are invalid or combined width is non-positive; assumes `car` is mutable.【F:src/gameplay.js†L1428-L1436】
    - Performance: Constant per car.【F:src/gameplay.js†L1428-L1436】
    - Units / spaces: Lateral distances in normalized lane units.【F:src/gameplay.js†L1434-L1436】
    - Determinism: Deterministic.【F:src/gameplay.js†L1428-L1436】
    - Keep / change / delete: Keep; keeps near-miss gating logic separate from collision detection.
    - Confidence / assumptions: High confidence; assumes callers provide consistent gap measurements.

  
  
  
  - `tryRegisterCarNearMiss`
    - Purpose: Detects and records a near-miss event when the player passes close to an NPC without colliding.【F:src/gameplay.js†L1439-L1455】
    - Inputs: `car`, `combinedHalf`, and `lateralGap` matching the collision context.【F:src/gameplay.js†L1439-L1444】
    - Outputs: None.【F:src/gameplay.js†L1439-L1455】
    - Side effects: Updates the car’s `CAR_NEAR_MISS_READY` flag and increments `state.metrics.nearMisses`.【F:src/gameplay.js†L1453-L1455】
    - Shared state touched and where it’s used: Requires `state.metrics` and physics state; invoked in the car collision loop after separation checks.【F:src/gameplay.js†L1439-L1455】【F:src/gameplay.js†L1965-L1975】
    - Dependencies: Uses `shortestSignedTrackDistance`, `currentPlayerForwardSpeed`, and `npcForwardSpeed` to verify near-miss conditions.【F:src/gameplay.js†L1445-L1451】
    - Edge cases handled or missed: Exits when metrics are absent, when the car isn’t ready, or when gaps exceed thresholds; assumes `phys.s` and `car.z` are finite.【F:src/gameplay.js†L1439-L1451】
    - Performance: Constant per candidate car.【F:src/gameplay.js†L1439-L1455】
    - Units / spaces: Mixes track distance (`s`) with normalized lateral distance checks.【F:src/gameplay.js†L1445-L1451】
    - Determinism: Deterministic given state and inputs.【F:src/gameplay.js†L1439-L1455】
    - Keep / change / delete: Keep; isolates metrics bookkeeping from collision logic.
    - Confidence / assumptions: Medium confidence; assumes metrics object is initialized before collisions are processed.

  
  
  
  - `computeCollisionPush`
    - Purpose: Calculates forward and lateral push velocities to separate the player from another object after contact.【F:src/gameplay.js†L1457-L1491】
    - Inputs: `forwardSpeed` — player speed; `playerOffset`/`targetOffset` — normalized lateral positions; `forwardMaxSegments`/`lateralMax` — tuning caps (defaults supplied).【F:src/gameplay.js†L1457-L1463】
    - Outputs: Returns `{ forwardVel, lateralVel }` or `null` when no push is needed.【F:src/gameplay.js†L1470-L1491】
    - Side effects: None.【F:src/gameplay.js†L1457-L1491】
    - Shared state touched and where it’s used: Reads tuning constants and `segmentLength`; used when applying pushes to sprites and NPC cars after collisions.【F:src/gameplay.js†L1457-L1491】【F:src/gameplay.js†L1515-L1526】【F:src/gameplay.js†L1596-L1610】
    - Dependencies: Uses `clamp01`, `Math.sign`, and collision tuning constants such as `COLLISION_PUSH_DURATION`.【F:src/gameplay.js†L1470-L1489】
    - Edge cases handled or missed: Returns `null` for zero speeds, missing segment length, or negligible offsets; assumes offsets are normalized to [-1,1].【F:src/gameplay.js†L1464-L1486】
    - Performance: Constant; called only when a collision requires response.【F:src/gameplay.js†L1457-L1491】
    - Units / spaces: Converts normalized distances and segment counts into world velocities via segment length and duration.【F:src/gameplay.js†L1470-L1491】
    - Determinism: Deterministic for given inputs.【F:src/gameplay.js†L1457-L1491】
    - Keep / change / delete: Keep; reusable push computation shared by sprites and cars.
    - Confidence / assumptions: High confidence; assumes tuning constants remain positive.

  
  
  
  - `configureImpactableSprite`
    - Purpose: Initializes and sanitizes the impact motion state on an impactable sprite so collision pushes can be applied safely.【F:src/gameplay.js†L1494-L1506】
    - Inputs: `sprite` — sprite descriptor expected to carry `impactable` flag.【F:src/gameplay.js†L1494-L1496】
    - Outputs: Returns the sprite’s `impactState` object or `null` when not impactable.【F:src/gameplay.js†L1497-L1506】
    - Side effects: Creates or normalizes `sprite.impactState`, setting default timers and velocities to zero.【F:src/gameplay.js†L1497-L1505】
    - Shared state touched and where it’s used: Called during sprite creation and whenever pushes update impactable sprites; mutates the sprite object in place.【F:src/gameplay.js†L858-L861】【F:src/gameplay.js†L1494-L1506】【F:src/gameplay.js†L1512-L1515】【F:src/gameplay.js†L1531-L1532】
    - Dependencies: Relies on `Number.isFinite` checks and the sprite’s `impactable` flag.【F:src/gameplay.js†L1494-L1505】
    - Edge cases handled or missed: Returns `null` when the sprite is absent or not impactable; resets NaN timers/velocities to zero but assumes the sprite object is mutable.【F:src/gameplay.js†L1494-L1505】
    - Performance: Constant and cheap; invoked per impactable sprite during interactions and animation updates.【F:src/gameplay.js†L1494-L1532】【F:src/gameplay.js†L2040-L2108】
    - Units / spaces: Stores velocities in track/lateral units consistent with collision push logic.【F:src/gameplay.js†L1497-L1505】
    - Determinism: Deterministic; no randomness involved.【F:src/gameplay.js†L1494-L1506】
    - Keep / change / delete: Keep; provides a safe initialization point for impactable sprites.
    - Confidence / assumptions: High confidence; assumes all impactable sprites should carry a mutable `impactState`.

  
  
  
  - `applyImpactPushToSprite`
    - Purpose: Applies a freshly computed collision push to an impactable sprite, starting its impact timer and velocity.【F:src/gameplay.js†L1509-L1526】
    - Inputs: `sprite` — candidate sprite to push.【F:src/gameplay.js†L1509-L1515】
    - Outputs: None.【F:src/gameplay.js†L1509-L1526】
    - Side effects: Configures the sprite’s impact state and writes new lateral/forward velocities plus timer duration.【F:src/gameplay.js†L1512-L1526】
    - Shared state touched and where it’s used: Reads player state for offsets and stores results on the sprite; called when resolving sprite interactions with the player.【F:src/gameplay.js†L1515-L1526】【F:src/gameplay.js†L1951-L1953】
    - Dependencies: Uses `configureImpactableSprite`, `computeCollisionPush`, `currentPlayerForwardSpeed`, and collision tuning constants.【F:src/gameplay.js†L1512-L1526】
    - Edge cases handled or missed: Returns early if the sprite is absent, not impactable, or if no push is produced; assumes `sprite.offset` is valid.【F:src/gameplay.js†L1509-L1525】
    - Performance: Constant; runs when the player collides with an impactable sprite, which is relatively infrequent.【F:src/gameplay.js†L1509-L1526】【F:src/gameplay.js†L1924-L1958】
    - Units / spaces: Velocities align with track distance per second and normalized lateral offsets.【F:src/gameplay.js†L1515-L1526】
    - Determinism: Deterministic for identical collision contexts.【F:src/gameplay.js†L1509-L1526】
    - Keep / change / delete: Keep; bridges collision detection and sprite motion in a focused helper.
    - Confidence / assumptions: High confidence; assumes `sprite.offset` mirrors normalized N space.

  
  
  
  - `updateImpactableSprite`
    - Purpose: Steps an impactable sprite’s push motion forward, updating offsets, timers, and optionally moving it to a new segment.【F:src/gameplay.js†L1529-L1572】
    - Inputs: `sprite` — impactable sprite; `dt` — elapsed time; `currentSeg` — segment currently iterated (optional).【F:src/gameplay.js†L1529-L1537】
    - Outputs: Returns the new segment when the sprite crosses into another, otherwise `null`.【F:src/gameplay.js†L1548-L1571】
    - Side effects: Mutates sprite offsets, wrapped `s` position, and impact velocities/timer; may update `sprite.segIndex`.【F:src/gameplay.js†L1536-L1568】
    - Shared state touched and where it’s used: Uses track queries and physics state for wrapping; invoked inside the sprite animation loop each frame.【F:src/gameplay.js†L1529-L1571】【F:src/gameplay.js†L2040-L2108】
    - Dependencies: Calls `configureImpactableSprite`, `trackLengthRef`, `segmentAtIndex`, `wrapDistance`, and `segmentAtS`.【F:src/gameplay.js†L1531-L1558】
    - Edge cases handled or missed: Returns early for invalid sprites or non-positive `dt`; clamps timers and zeroes velocities when finished, but assumes `sprite.segIndex` is valid when wrapping.【F:src/gameplay.js†L1529-L1568】
    - Performance: Constant work per sprite per frame; heavy numbers of impactable sprites could add cost.【F:src/gameplay.js†L1529-L1571】【F:src/gameplay.js†L2040-L2108】
    - Units / spaces: Handles normalized lateral offsets and wrapped track distance (`s`), with timers in seconds.【F:src/gameplay.js†L1544-L1568】
    - Determinism: Deterministic given identical initial impact state and `dt`.【F:src/gameplay.js†L1529-L1571】
    - Keep / change / delete: Keep; cleanly separates impact motion from interaction detection.
    - Confidence / assumptions: Medium confidence; assumes referenced segments remain valid while sprites move.

  
  
  
  - `carHitboxHeight`
    - Purpose: Calculates an NPC car’s hitbox height in world units, honoring explicit overrides or deriving it from width and aspect ratio.【F:src/gameplay.js†L1574-L1583】
    - Inputs: `car` — NPC descriptor; `s` — optional longitudinal position for road-width queries (defaults to player `s`).【F:src/gameplay.js†L1574-L1580】
    - Outputs: Returns a numeric height in world units.【F:src/gameplay.js†L1578-L1583】
    - Side effects: None.【F:src/gameplay.js†L1574-L1583】
    - Shared state touched and where it’s used: Reads track width functions and car metadata; used when checking if the player is above an NPC during collisions.【F:src/gameplay.js†L1574-L1589】【F:src/gameplay.js†L1978-L1988】
    - Dependencies: Calls `carMeta`, `roadWidthAt`, and falls back to `track.roadWidth`.【F:src/gameplay.js†L1574-L1580】
    - Edge cases handled or missed: Supports explicit `hitbox.height` or `heightN`; assumes aspect ratios and widths are finite and returns `0` otherwise.【F:src/gameplay.js†L1576-L1583】
    - Performance: Constant; invoked for each collision height check.【F:src/gameplay.js†L1574-L1583】
    - Units / spaces: World height units consistent with elevation samples.【F:src/gameplay.js†L1579-L1583】
    - Determinism: Deterministic given car metadata and track width.【F:src/gameplay.js†L1574-L1583】
    - Keep / change / delete: Keep; centralizes hitbox derivation logic.
    - Confidence / assumptions: Medium confidence; assumes `roadWidthAt` is available or falls back to `track.roadWidth`.

  
  
  
  - `carHitboxTopY`
    - Purpose: Computes the world-space Y coordinate of an NPC car’s hitbox top, blending road elevation with hitbox height.【F:src/gameplay.js†L1586-L1591】
    - Inputs: `car` — NPC descriptor (uses its `z` and lateral offset when available).【F:src/gameplay.js†L1586-L1589】
    - Outputs: Returns a world Y coordinate.【F:src/gameplay.js†L1589-L1591】
    - Side effects: None.【F:src/gameplay.js†L1586-L1591】
    - Shared state touched and where it’s used: Reads from physics state and elevation functions; used to ensure airborne players clear NPC roofs before treating contacts as collisions.【F:src/gameplay.js†L1586-L1591】【F:src/gameplay.js†L1978-L1988】
    - Dependencies: Uses `floorElevationAt` when available, falling back to `elevationAt`, plus `carHitboxHeight`.【F:src/gameplay.js†L1588-L1591】
    - Edge cases handled or missed: Defaults to player `s` and zero lateral offset when car data is missing; assumes elevation helpers return finite numbers.【F:src/gameplay.js†L1586-L1591】
    - Performance: Constant.【F:src/gameplay.js†L1586-L1591】
    - Units / spaces: World vertical units consistent with road elevation.【F:src/gameplay.js†L1588-L1591】
    - Determinism: Deterministic given the same inputs.【F:src/gameplay.js†L1586-L1591】
    - Keep / change / delete: Keep; simplifies collision height comparisons.
    - Confidence / assumptions: High confidence; assumes elevation helpers are reliable at the queried positions.

  
  
  
  - `applyNpcCollisionPush`
    - Purpose: Starts a collision push response on an NPC car when the player rear-ends it, mirroring the player-side push.【F:src/gameplay.js†L1593-L1610】
    - Inputs: `car` — NPC to push; `playerForwardSpeed` — player speed at impact.【F:src/gameplay.js†L1593-L1600】
    - Outputs: None.【F:src/gameplay.js†L1593-L1610】
    - Side effects: Ensures `car.collisionPush` exists then sets its velocities and timer.【F:src/gameplay.js†L1605-L1610】
    - Shared state touched and where it’s used: Mutates the NPC car object; called during player-vs-NPC collision resolution.【F:src/gameplay.js†L1593-L1610】【F:src/gameplay.js†L1993-L2015】
    - Dependencies: Uses `computeCollisionPush` and collision tuning constants including `COLLISION_PUSH_DURATION`.【F:src/gameplay.js†L1596-L1610】
    - Edge cases handled or missed: Returns if the car is missing or if `computeCollisionPush` yields nothing; assumes NPC object is mutable.【F:src/gameplay.js†L1593-L1608】
    - Performance: Constant per collision event.【F:src/gameplay.js†L1593-L1610】
    - Units / spaces: Push velocities share the same track-distance and normalized lateral units as the player push.【F:src/gameplay.js†L1596-L1610】
    - Determinism: Deterministic for a given collision context.【F:src/gameplay.js†L1593-L1610】
    - Keep / change / delete: Keep; mirrors player push logic for NPC feedback.
    - Confidence / assumptions: High confidence; assumes `COLLISION_PUSH_DURATION` positive.

  
  
  
  - `playerBaseHeight`
    - Purpose: Determines the player’s current floor height, choosing the road surface when grounded or the physics Y when airborne.【F:src/gameplay.js†L1613-L1618】
    - Inputs: None.【F:src/gameplay.js†L1613-L1618】
    - Outputs: Returns a world Y value.【F:src/gameplay.js†L1613-L1618】
    - Side effects: None.【F:src/gameplay.js†L1613-L1618】
    - Shared state touched and where it’s used: Reads from `state.phys` and `floorElevationAt`; used in collision checks to skip NPC hits while airborne.【F:src/gameplay.js†L1613-L1618】【F:src/gameplay.js†L1978-L1988】
    - Dependencies: Uses `floorElevationAt` when grounded.【F:src/gameplay.js†L1614-L1617】
    - Edge cases handled or missed: Falls back to `phys.y` when ungrounded or when floor samplers are unavailable; assumes physics state exists.【F:src/gameplay.js†L1613-L1618】
    - Performance: Constant.【F:src/gameplay.js†L1613-L1618】
    - Units / spaces: World height units.【F:src/gameplay.js†L1613-L1618】
    - Determinism: Deterministic.【F:src/gameplay.js†L1613-L1618】
    - Keep / change / delete: Keep; clarifies base-height logic across collision checks.
    - Confidence / assumptions: High confidence; assumes `phys.grounded` flag accurately reflects landing state.

  
  
  
  - `npcLateralLimit`
    - Purpose: Calculates how far an NPC car may move laterally, respecting its width, safety padding, and guard-rail constraints.【F:src/gameplay.js†L1621-L1629】
    - Inputs: `segIndex` — segment index; `car` — NPC descriptor.【F:src/gameplay.js†L1621-L1628】
    - Outputs: Returns a symmetric lateral limit in normalized units.【F:src/gameplay.js†L1621-L1629】
    - Side effects: None.【F:src/gameplay.js†L1621-L1629】
    - Shared state touched and where it’s used: Reads car metadata, track rail info, and NPC tuning; used across NPC spawn, steering, and collision logic to clamp offsets.【F:src/gameplay.js†L1621-L1629】【F:src/gameplay.js†L2455-L2535】
    - Dependencies: Uses `carHalfWN`, `segmentAtIndex`, and track guard-rail configuration.【F:src/gameplay.js†L1621-L1628】
    - Edge cases handled or missed: Accounts for guard rails when present; assumes `track.railInset` and NPC padding values are valid numbers.【F:src/gameplay.js†L1623-L1628】
    - Performance: Constant; invoked repeatedly while steering NPCs.【F:src/gameplay.js†L1621-L1629】【F:src/gameplay.js†L2455-L2535】
    - Units / spaces: Normalized lane units relative to the road width.【F:src/gameplay.js†L1621-L1629】
    - Determinism: Deterministic.【F:src/gameplay.js†L1621-L1629】
    - Keep / change / delete: Keep; encapsulates guard-rail aware clamping.
    - Confidence / assumptions: Medium confidence; assumes segment guard-rail data stays synchronized with indices.

  
  
  
  - `slopeAngleDeg`
    - Purpose: Converts a slope ratio into an absolute angle in degrees for cliff limit comparisons.【F:src/gameplay.js†L1632-L1635】
    - Inputs: `slope` — rise/run ratio.【F:src/gameplay.js†L1632-L1635】
    - Outputs: Returns the absolute slope angle in degrees (or `0` for invalid input).【F:src/gameplay.js†L1632-L1635】
    - Side effects: None.【F:src/gameplay.js†L1632-L1635】
    - Shared state touched and where it’s used: Used by `slopeLimitRatio` and cliff-steepness evaluation code.【F:src/gameplay.js†L1632-L1639】【F:src/gameplay.js†L1848-L1853】
    - Dependencies: Relies on `Math.atan`, `Math.abs`, and conversion to degrees.【F:src/gameplay.js†L1632-L1635】
    - Edge cases handled or missed: Returns `0` when slope is non-finite, preventing downstream NaNs.【F:src/gameplay.js†L1632-L1635】
    - Performance: Constant.【F:src/gameplay.js†L1632-L1635】
    - Units / spaces: Outputs degrees derived from slope ratios.【F:src/gameplay.js†L1632-L1635】
    - Determinism: Deterministic.【F:src/gameplay.js†L1632-L1635】
    - Keep / change / delete: Keep; small helper keeps degree conversion centralized.
    - Confidence / assumptions: High confidence; assumes slope inputs are numeric.

  
  
  
  - `slopeLimitRatio`
    - Purpose: Expresses how close a slope is to the configured cliff angle limit as a 0..1+ ratio.【F:src/gameplay.js†L1637-L1641】
    - Inputs: `slope` — rise/run ratio.【F:src/gameplay.js†L1637-L1641】
    - Outputs: Returns `angleDeg / CLIFF_LIMIT_DEG`, or `0` when the limit is disabled.【F:src/gameplay.js†L1637-L1641】
    - Side effects: None.【F:src/gameplay.js†L1637-L1641】
    - Shared state touched and where it’s used: Reads global `CLIFF_LIMIT_DEG`; used by `slopeExceedsLimit` and cliff steepness heuristics.【F:src/gameplay.js†L1637-L1645】【F:src/gameplay.js†L1850-L1853】
    - Dependencies: Calls `slopeAngleDeg`.【F:src/gameplay.js†L1637-L1640】
    - Edge cases handled or missed: Returns `0` when the limit is missing or non-positive, effectively disabling ratio-based logic.【F:src/gameplay.js†L1637-L1641】
    - Performance: Constant.【F:src/gameplay.js†L1637-L1641】
    - Units / spaces: Ratio (unitless).【F:src/gameplay.js†L1637-L1641】
    - Determinism: Deterministic.【F:src/gameplay.js†L1637-L1641】
    - Keep / change / delete: Keep; simple ratio helper clarifies limit math.
    - Confidence / assumptions: High confidence; assumes `CLIFF_LIMIT_DEG` describes a positive degree limit when enabled.

  
  
  
  - `slopeExceedsLimit`
    - Purpose: Flags slopes whose angle surpasses the configured cliff safety threshold.【F:src/gameplay.js†L1643-L1645】
    - Inputs: `slope` — rise/run ratio.【F:src/gameplay.js†L1643-L1645】
    - Outputs: Boolean indicating whether the slope is over the limit.【F:src/gameplay.js†L1643-L1645】
    - Side effects: None.【F:src/gameplay.js†L1643-L1645】
    - Shared state touched and where it’s used: Checks `CLIFF_LIMIT_DEG`; referenced by section and surface evaluators when warning about steep cliffs.【F:src/gameplay.js†L1643-L1663】
    - Dependencies: Calls `slopeLimitRatio`.【F:src/gameplay.js†L1644-L1645】
    - Edge cases handled or missed: Returns `false` when the limit is unset or non-positive; assumes slope ratio input is finite.【F:src/gameplay.js†L1643-L1645】
    - Performance: Constant.【F:src/gameplay.js†L1643-L1645】
    - Units / spaces: Operates on slope ratios; result unitless.【F:src/gameplay.js†L1643-L1645】
    - Determinism: Deterministic.【F:src/gameplay.js†L1643-L1645】
    - Keep / change / delete: Keep; keeps slope comparisons consistent.
    - Confidence / assumptions: High confidence; assumes `slopeLimitRatio` returns sensible ratios.

  
  
  
  - `cliffSectionExceedsLimit`
    - Purpose: Evaluates a cliff cross-section’s slope to determine if it breaches the configured steepness limit.【F:src/gameplay.js†L1648-L1654】
    - Inputs: `section` — object containing `dx`/`dy` components.【F:src/gameplay.js†L1648-L1653】
    - Outputs: Boolean indicating whether the section exceeds the limit.【F:src/gameplay.js†L1648-L1654】
    - Side effects: None.【F:src/gameplay.js†L1648-L1654】
    - Shared state touched and where it’s used: Consumed by `segmentHasSteepCliff` when scanning cliff samples.【F:src/gameplay.js†L1674-L1688】
    - Dependencies: Calls `slopeExceedsLimit` after computing slope magnitude from `dx`/`dy`.【F:src/gameplay.js†L1652-L1654】
    - Edge cases handled or missed: Returns `false` when the section is missing or nearly flat (both deltas near zero); assumes `dx`/`dy` measured in consistent units.【F:src/gameplay.js†L1648-L1654】
    - Performance: Constant.【F:src/gameplay.js†L1648-L1654】
    - Units / spaces: Works in cliff geometric units (`dx`/`dy`) relative to world scale.【F:src/gameplay.js†L1650-L1654】
    - Determinism: Deterministic.【F:src/gameplay.js†L1648-L1654】
    - Keep / change / delete: Keep; localized helper simplifies `segmentHasSteepCliff`.
    - Confidence / assumptions: Medium confidence; assumes `dx` is non-zero for meaningful slopes.

  
  
  
  - `cliffInfoExceedsLimit`
    - Purpose: Checks aggregated cliff surface info for any slope component that surpasses the configured limit.【F:src/gameplay.js†L1659-L1664】
    - Inputs: `info` — structure with `slope`, `slopeA`, and `slopeB` fields.【F:src/gameplay.js†L1659-L1664】
    - Outputs: Boolean indicating whether any component is too steep.【F:src/gameplay.js†L1659-L1664】
    - Side effects: None.【F:src/gameplay.js†L1659-L1664】
    - Shared state touched and where it’s used: Used within `segmentHasSteepCliff` as part of the per-sample evaluation.【F:src/gameplay.js†L1681-L1687】
    - Dependencies: Calls `slopeExceedsLimit` on each slope component.【F:src/gameplay.js†L1661-L1664】
    - Edge cases handled or missed: Returns `false` when info is missing; assumes slope fields are numeric.【F:src/gameplay.js†L1659-L1664】
    - Performance: Constant.【F:src/gameplay.js†L1659-L1664】
    - Units / spaces: Uses slope ratios derived from cliff surface sampling.【F:src/gameplay.js†L1659-L1664】
    - Determinism: Deterministic.【F:src/gameplay.js†L1659-L1664】
    - Keep / change / delete: Keep; keeps multi-slope checks concise inside segment scanning.
    - Confidence / assumptions: High confidence; assumes upstream samplers populate slope fields consistently.
  
  
  
  - `segmentHasSteepCliff`
    - Purpose: Scans a segment’s cliff samples to detect any section whose slope exceeds the configured limit, aborting early once a violation is found.【F:src/gameplay.js†L1667-L1689】
    - Inputs: `segIndex` — segment index to inspect; should correspond to cached cliff parameters for sampling positions `t` and lateral offsets `n`.【F:src/gameplay.js†L1669-L1684】
    - Outputs: Returns `true` if any sampled cliff section fails the limit check; otherwise `false`.【F:src/gameplay.js†L1667-L1689】
    - Side effects: None; only reads configuration and helper outputs.【F:src/gameplay.js†L1667-L1689】
    - Shared state touched and where it’s used: Reads global cliff sampling arrays and delegates to `cliffParamsAt`/`cliffSurfaceInfoAt`; used by `playerLateralLimit` to tighten lateral bounds on hazardous segments.【F:src/gameplay.js†L1668-L1687】【F:src/gameplay.js†L1913-L1915】
    - Dependencies: Calls `cliffParamsAt`, `cliffSectionExceedsLimit`, `cliffSurfaceInfoAt`, and `cliffInfoExceedsLimit`.【F:src/gameplay.js†L1671-L1685】
    - Edge cases it handles or misses: Gracefully skips work when the cliff limit is disabled or data is missing, but assumes the sampling arrays contain finite values.【F:src/gameplay.js†L1668-L1688】
    - Performance: Iterates across the configured angle and lateral sample arrays per invocation; low constant cost per queried segment.【F:src/gameplay.js†L1669-L1687】
    - Units / spaces: Works in segment indices with depth samples `t` (0..1) and normalized lateral offsets beyond ±1 road width.【F:src/gameplay.js†L1669-L1683】
    - Determinism: Deterministic given the same track data and configuration.【F:src/gameplay.js†L1667-L1689】
    - Keep / change / delete: Keep; localized helper avoids duplicating steep-cliff scans (alternate would be inlining into `playerLateralLimit`).
    - Confidence / assumptions: Medium confidence; assumes `cliffParamsAt` returns consistent `dx`/`dy` measurements for both cliff sides.
  
  
  
  - `wrapDistance`
    - Purpose: Adds a delta to a track position and wraps it to the track length so movers seamlessly loop around the circuit.【F:src/gameplay.js†L1692-L1694】
    - Inputs: `v` — starting S position; `dv` — delta to apply; `max` — wrap length (typically total track S). Accepts finite numbers; if `max` is non-positive the downstream helper defines the behavior.【F:src/gameplay.js†L1692-L1694】
    - Outputs: Returns the wrapped S coordinate produced by `wrapByLength`.【F:src/gameplay.js†L1692-L1694】
    - Side effects: None.【F:src/gameplay.js†L1692-L1694】
    - Shared state touched and where it’s used: Touches no shared state; reused when moving sprites and NPC cars to keep them within track bounds.【F:src/gameplay.js†L1311-L1314】【F:src/gameplay.js†L2527-L2534】
    - Dependencies: Thin wrapper over `wrapByLength`.【F:src/gameplay.js†L1693-L1694】
    - Edge cases it handles or misses: Relies on `wrapByLength` for handling invalid lengths; does not validate NaNs itself.【F:src/gameplay.js†L1692-L1694】
    - Performance: Constant-time.【F:src/gameplay.js†L1692-L1694】
    - Units / spaces: Operates in longitudinal track `s` units.【F:src/gameplay.js†L1692-L1694】
    - Determinism: Deterministic for deterministic inputs.【F:src/gameplay.js†L1692-L1694】
    - Keep / change / delete: Keep; single-purpose helper clarifies intent (alternatively call `wrapByLength` directly).
    - Confidence / assumptions: High confidence; assumes callers supply finite numbers.
  
  
  
  - `shortestSignedTrackDistance`
    - Purpose: Computes the minimal signed longitudinal separation between two positions on the looping track.【F:src/gameplay.js†L1696-L1705】
    - Inputs: `a` — reference S position; `b` — comparison S position; expects finite numbers, falling back to raw subtraction when track length is invalid.【F:src/gameplay.js†L1696-L1703】
    - Outputs: Returns a signed distance in S units, normalized to ±half the track length when available.【F:src/gameplay.js†L1696-L1705】
    - Side effects: None.【F:src/gameplay.js†L1696-L1705】
    - Shared state touched and where it’s used: Reads the dynamic track length via `trackLengthRef`; used when registering NPC near-misses to measure forward gaps.【F:src/gameplay.js†L1697-L1704】【F:src/gameplay.js†L1445-L1454】
    - Dependencies: Calls `trackLengthRef` and uses modulo arithmetic.【F:src/gameplay.js†L1697-L1704】
    - Edge cases it handles or misses: Handles missing or non-positive track lengths and non-finite deltas, but assumes `trackLengthRef` reflects the active course.【F:src/gameplay.js†L1697-L1704】
    - Performance: Constant-time.【F:src/gameplay.js†L1696-L1705】
    - Units / spaces: Returns distances in world S units.【F:src/gameplay.js†L1696-L1705】
    - Determinism: Deterministic.【F:src/gameplay.js†L1696-L1705】
    - Keep / change / delete: Keep; encapsulates wrap-aware subtraction (alternative would be duplicating the modulo math inline).
    - Confidence / assumptions: High confidence; assumes `trackLengthRef` stays synchronized with course updates.
  
  
  
  - `nearestSegmentCenter`
    - Purpose: Snaps an arbitrary longitudinal position to the center of its nearest road segment for respawn logic.【F:src/gameplay.js†L1708-L1710】
    - Inputs: `s` — world S coordinate; expects finite numbers tied to segment length.【F:src/gameplay.js†L1708-L1710】
    - Outputs: Returns the S position at the midpoint of the nearest segment.【F:src/gameplay.js†L1708-L1710】
    - Side effects: None.【F:src/gameplay.js†L1708-L1710】
    - Shared state touched and where it’s used: Uses global `segmentLength`; leveraged by `queueRespawn` to drop players back on segment centers.【F:src/gameplay.js†L1708-L1710】【F:src/gameplay.js†L2764-L2767】
    - Dependencies: Math rounding only.【F:src/gameplay.js†L1708-L1710】
    - Edge cases it handles or misses: Assumes `segmentLength` is positive and finite; no extra guards present.【F:src/gameplay.js†L1708-L1710】
    - Performance: Constant-time.【F:src/gameplay.js†L1708-L1710】
    - Units / spaces: Works in track S units measured by `segmentLength`.【F:src/gameplay.js†L1708-L1710】
    - Determinism: Deterministic.【F:src/gameplay.js†L1708-L1710】
    - Keep / change / delete: Keep; concise helper clarifies respawn centering (alternative would be duplicating the rounding math).
    - Confidence / assumptions: High confidence; assumes `segmentLength` is initialized.
  
  
  
  - `cliffSurfaceInfoAt`
    - Purpose: Derives cliff height and slope information beyond the road edge at a sampled segment position, returning a normalized info object for downstream checks.【F:src/gameplay.js†L1724-L1801】
    - Inputs: `segIndex` — segment index being sampled; `nNorm` — normalized lateral coordinate where |n|>1 falls outside the road; `t` — longitudinal interpolation along the segment (defaults to 0).【F:src/gameplay.js†L1724-L1780】
    - Outputs: Returns an info object containing `heightOffset`, `slope`, `slopeA/B`, `coverageA/B`, and `section` flags describing the sampled cliff portions.【F:src/gameplay.js†L1724-L1801】
    - Side effects: None; allocates a new info object.【F:src/gameplay.js†L1724-L1801】
    - Shared state touched and where it’s used: Reads shared track data via `cliffParamsAt`, `segmentAtIndex`, `roadWidthAt`, and `track.roadWidth`; reused by steep-cliff detection and tilt computations.【F:src/gameplay.js†L1728-L1779】【F:src/gameplay.js†L1681-L1684】【F:src/gameplay.js†L1804-L1814】
    - Dependencies: Calls `cliffParamsAt`, `segmentAtIndex`, `roadWidthAt`, `clamp01`, and `createCliffInfo`.【F:src/gameplay.js†L1728-L1798】
    - Edge cases it handles or misses: Returns default info for in-road samples, missing params, or zero-width cliffs; assumes provided `dx`/`dy` pairs describe contiguous sections.【F:src/gameplay.js†L1725-L1799】
    - Performance: Constant-time despite several arithmetic branches.【F:src/gameplay.js†L1724-L1801】
    - Units / spaces: Uses segment S (`t`) and normalized lateral coordinates `n`, translating cliff widths/height deltas into slope ratios.【F:src/gameplay.js†L1734-L1794】
    - Determinism: Deterministic given the same cliff data.【F:src/gameplay.js†L1724-L1801】
    - Keep / change / delete: Keep; consolidates cliff sampling math (alternative would be duplicating calculations in each consumer).
    - Confidence / assumptions: Medium confidence; assumes cliff parameter objects include `left/right` sections with finite `dx`/`dy`.
  
  
  
  - `cliffLateralSlopeAt`
    - Purpose: Convenience accessor that returns the aggregate lateral slope component from `cliffSurfaceInfoAt` for a given sample.【F:src/gameplay.js†L1803-L1806】
    - Inputs: `segIndex` — segment index; `nNorm` — normalized lateral coordinate; `t` — optional longitudinal interpolation.【F:src/gameplay.js†L1803-L1806】
    - Outputs: Returns the `slope` field from the computed cliff info (defaults to 0).【F:src/gameplay.js†L1803-L1806】
    - Side effects: None.【F:src/gameplay.js†L1803-L1806】
    - Shared state touched and where it’s used: Delegates to `cliffSurfaceInfoAt`; consumed by `applyCliffPushForce` when applying lateral push-back near cliffs.【F:src/gameplay.js†L1803-L1806】【F:src/gameplay.js†L1869-L1878】
    - Dependencies: Calls `cliffSurfaceInfoAt`.【F:src/gameplay.js†L1803-L1805】
    - Edge cases it handles or misses: Inherits `cliffSurfaceInfoAt`’s handling; no additional guards.【F:src/gameplay.js†L1803-L1806】
    - Performance: Constant-time.【F:src/gameplay.js†L1803-L1806】
    - Units / spaces: Returns slope ratios derived from cliff geometry.【F:src/gameplay.js†L1803-L1806】
    - Determinism: Deterministic.【F:src/gameplay.js†L1803-L1806】
    - Keep / change / delete: Keep; keeps push-force code succinct (alternative is inlining the info lookup).
    - Confidence / assumptions: High confidence; assumes cliff info helpers stay stable.
  
  
  
  - `getAdditiveTiltDeg`
    - Purpose: Computes an additional player/camera roll angle based on local cliff slope to visually lean away from steep drops.【F:src/gameplay.js†L1808-L1825】
    - Inputs: None; derives data from current state, tilt configuration, and sampled cliff info.【F:src/gameplay.js†L1808-L1824】
    - Outputs: Returns a signed degree offset clamped by `tiltAdd.tiltAddMaxDeg` when configured.【F:src/gameplay.js†L1822-L1825】
    - Side effects: None; pure calculation.【F:src/gameplay.js†L1808-L1825】
    - Shared state touched and where it’s used: Reads `state.phys`, `state.playerN`, and cliff data; exposed via `state.getAdditiveTiltDeg` and consumed during render-time tilt smoothing.【F:src/gameplay.js†L1809-L1824】【F:src/gameplay.js†L1828-L1828】【F:src/render.js†L1032-L1049】
    - Dependencies: Calls `segmentAtS`, `clamp01`, `cliffSurfaceInfoAt`, `Math.atan`, and uses tilt config values.【F:src/gameplay.js†L1810-L1825】
    - Edge cases it handles or misses: Returns 0 when tilt add is disabled, no segment exists, or info is missing; assumes cliff slopes are finite.【F:src/gameplay.js†L1809-L1825】
    - Performance: Constant-time per call.【F:src/gameplay.js†L1808-L1825】
    - Units / spaces: Outputs degrees derived from slope ratios; depends on normalized player lateral position.【F:src/gameplay.js†L1813-L1825】
    - Determinism: Deterministic given the same game state.【F:src/gameplay.js†L1808-L1825】
    - Keep / change / delete: Keep; isolates camera-tilt math (alternative would be embedding logic in render loop).
    - Confidence / assumptions: Medium confidence; assumes tilt configuration flags remain synchronized with render expectations.
  
  
  
  - `updateCameraFromFieldOfView`
    - Purpose: Recomputes camera projection parameters (depth, near plane, playerZ) when the field of view changes.【F:src/gameplay.js†L1830-L1836】
    - Inputs: None; operates on `state.camera.fieldOfView`.【F:src/gameplay.js†L1830-L1836】
    - Outputs: No return value; updates `state.camera.cameraDepth`, `nearZ`, and `playerZ`.【F:src/gameplay.js†L1831-L1836】
    - Side effects: Mutates camera state fields derived from FOV.【F:src/gameplay.js†L1831-L1836】
    - Shared state touched and where it’s used: Writes to `state.camera`; invoked by `setFieldOfView` and during initialization to keep projection data current.【F:src/gameplay.js†L1831-L1836】【F:src/gameplay.js†L1838-L1844】
    - Dependencies: Uses `Math.tan` and camera constants.【F:src/gameplay.js†L1830-L1835】
    - Edge cases it handles or misses: Assumes a finite positive FOV; lacks guards for extreme values that would blow up `Math.tan`.【F:src/gameplay.js†L1830-L1836】
    - Performance: Constant-time.【F:src/gameplay.js†L1830-L1836】
    - Units / spaces: Converts degrees to radians and updates world depth offsets (`playerZ`).【F:src/gameplay.js†L1831-L1836】
    - Determinism: Deterministic.【F:src/gameplay.js†L1830-L1836】
    - Keep / change / delete: Keep; centralizes camera projection math (alternative is duplicating the trig in callers).
    - Confidence / assumptions: High confidence; assumes camera state exists before invocation.
  
  
  
  - `setFieldOfView`
    - Purpose: Setter that applies a new camera FOV and immediately refreshes dependent projection values.【F:src/gameplay.js†L1838-L1844】
    - Inputs: `fov` — field of view in degrees; expected to be finite.【F:src/gameplay.js†L1838-L1840】
    - Outputs: None.【F:src/gameplay.js†L1838-L1841】
    - Side effects: Updates `state.camera.fieldOfView` and calls `updateCameraFromFieldOfView`.【F:src/gameplay.js†L1838-L1844】
    - Shared state touched and where it’s used: Mutates camera state; exposed via `state.camera.updateFromFov` so other systems (e.g., reset) can reuse it.【F:src/gameplay.js†L1838-L1844】【F:src/gameplay.js†L2689-L2694】
    - Dependencies: Relies on `updateCameraFromFieldOfView`.【F:src/gameplay.js†L1839-L1844】
    - Edge cases it handles or misses: Does not clamp FOV values; assumes caller sanitizes input.【F:src/gameplay.js†L1838-L1844】
    - Performance: Constant-time.【F:src/gameplay.js†L1838-L1844】
    - Units / spaces: Input/field stored in degrees.【F:src/gameplay.js†L1838-L1839】
    - Determinism: Deterministic.【F:src/gameplay.js†L1838-L1844】
    - Keep / change / delete: Keep; simple setter keeps camera updates uniform (alternative is writing to the state and calling the helper manually).
    - Confidence / assumptions: High confidence; assumes camera object has been initialized.
  
  
  
  - `cliffSteepnessMultiplier`
    - Purpose: Converts a slope ratio into a multiplier that grows as the slope approaches or exceeds the configured cliff limit, intensifying push-back forces.【F:src/gameplay.js†L1846-L1860】
    - Inputs: `slope` — lateral slope ratio; expected finite number.【F:src/gameplay.js†L1846-L1853】
    - Outputs: Returns a multiplier ≥1 that scales with steepness.【F:src/gameplay.js†L1846-L1860】
    - Side effects: None.【F:src/gameplay.js†L1846-L1860】
    - Shared state touched and where it’s used: Reads `CLIFF_LIMIT_DEG` and slope helpers; consumed by `applyCliffPushForce` to weight the lateral correction.【F:src/gameplay.js†L1846-L1855】【F:src/gameplay.js†L1876-L1877】
    - Dependencies: Calls `slopeAngleDeg` and `slopeLimitRatio`.【F:src/gameplay.js†L1849-L1855】
    - Edge cases it handles or misses: Returns 1 when limits are disabled, slopes are near flat, or ratios are non-positive; assumes finite slopes.【F:src/gameplay.js†L1847-L1859】
    - Performance: Constant-time.【F:src/gameplay.js†L1846-L1860】
    - Units / spaces: Operates on dimensionless slope ratios and degree limits.【F:src/gameplay.js†L1846-L1855】
    - Determinism: Deterministic.【F:src/gameplay.js†L1846-L1860】
    - Keep / change / delete: Keep; encapsulates easing curve for steepness (alternative would be hard-coding math in `applyCliffPushForce`).
    - Confidence / assumptions: Medium confidence; assumes limit configuration matches slope sampling units.
  
  
  
  - `applyCliffPushForce`
    - Purpose: Nudges the player back toward the road when drifting beyond the guard rails, scaling the correction with distance and cliff steepness.【F:src/gameplay.js†L1863-L1879】
    - Inputs: `step` — base steering delta (used to scale the applied push); expects finite number.【F:src/gameplay.js†L1863-L1878】
    - Outputs: None (adjusts `state.playerN` in place).【F:src/gameplay.js†L1877-L1879】
    - Side effects: Reads the current segment and modifies `state.playerN`.【F:src/gameplay.js†L1865-L1879】
    - Shared state touched and where it’s used: Accesses `state.playerN`, `state.phys`, and cliff configuration; invoked from `updatePhysics` each frame while integrating steering.【F:src/gameplay.js†L1863-L1879】【F:src/gameplay.js†L2169-L2170】
    - Dependencies: Calls `segmentAtS`, `clamp01`, `cliffLateralSlopeAt`, and `cliffSteepnessMultiplier`.【F:src/gameplay.js†L1866-L1877】
    - Edge cases it handles or misses: No effect when the player is within road bounds, when slopes are flat, or when the direction cannot be determined; assumes cliff samples exist for off-road positions.【F:src/gameplay.js†L1864-L1878】
    - Performance: Constant-time per invocation.【F:src/gameplay.js†L1863-L1879】
    - Units / spaces: Operates on normalized lateral coordinate `state.playerN` and uses slopes derived from cliff geometry.【F:src/gameplay.js†L1873-L1879】
    - Determinism: Deterministic given the same state and sampling functions.【F:src/gameplay.js†L1863-L1879】
    - Keep / change / delete: Keep; encapsulates cliff push logic (alternative is embedding calculations inside `updatePhysics`).
    - Confidence / assumptions: Medium confidence; assumes cliff sampling returns meaningful slopes for |n|>1.
  
  
  
  - `doHop`
    - Purpose: Applies the player’s hop impulse, transitioning from grounded to airborne motion and seeding drift/boost interactions.【F:src/gameplay.js†L1884-L1902】
    - Inputs: None; relies on `state.phys`, jump zone info, and player tuning.【F:src/gameplay.js†L1884-L1901】
    - Outputs: Returns `true` when a hop is initiated, otherwise `false`.【F:src/gameplay.js†L1884-L1902】
    - Side effects: Mutates player physics (velocities, grounded flag, next hop timer) and triggers jump-zone boosts.【F:src/gameplay.js†L1884-L1901】
    - Shared state touched and where it’s used: Writes to `state.phys` and leverages jump zone helpers; called from `updatePhysics` when hop input is detected.【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2137-L2139】
    - Dependencies: Uses `jumpZoneForPlayer`, `groundProfileAt`, `tangentNormalFromSlope`, `playerFloorHeightAt`, and `applyJumpZoneBoost`.【F:src/gameplay.js†L1887-L1901】
    - Edge cases it handles or misses: Guarded by grounded state and hop cooldown; assumes terrain normals and impulses are finite.【F:src/gameplay.js†L1884-L1901】
    - Performance: Constant-time.【F:src/gameplay.js†L1884-L1902】
    - Units / spaces: Works in world velocities and positions relative to track S/Y coordinates.【F:src/gameplay.js†L1887-L1900】
    - Determinism: Deterministic given the same state and random-free dependencies.【F:src/gameplay.js†L1884-L1902】
    - Keep / change / delete: Keep; isolates hop physics (alternative is embedding hop logic directly into `updatePhysics`).
    - Confidence / assumptions: Medium confidence; assumes `player.hopImpulse` and normals are tuned for stable trajectories.
  
  
  
  - `playerLateralLimit`
    - Purpose: Computes the maximum lateral travel the player can have within a segment, considering car width, guard rails, and cliff safety limits.【F:src/gameplay.js†L1904-L1917】
    - Inputs: `segIndex` — segment index being evaluated.【F:src/gameplay.js†L1904-L1911】
    - Outputs: Returns a symmetric normalized bound (≥0).【F:src/gameplay.js†L1904-L1917】
    - Side effects: None.【F:src/gameplay.js†L1904-L1917】
    - Shared state touched and where it’s used: Reads player dimensions, lane bounds, guard-rail features, and steep-cliff status; used when clamping player motion and when respawning.【F:src/gameplay.js†L1904-L1916】【F:src/gameplay.js†L2346-L2354】【F:src/gameplay.js†L2684-L2686】
    - Dependencies: Calls `playerHalfWN`, `segmentAtIndex`, and `segmentHasSteepCliff`.【F:src/gameplay.js†L1904-L1915】
    - Edge cases it handles or misses: Falls back to lane width when no guard rail/cliff limit exists; assumes features metadata is present when rails apply.【F:src/gameplay.js†L1906-L1916】
    - Performance: Constant-time.【F:src/gameplay.js†L1904-L1917】
    - Units / spaces: Returns normalized lateral coordinate bounds relative to road width.【F:src/gameplay.js†L1904-L1917】
    - Determinism: Deterministic.【F:src/gameplay.js†L1904-L1917】
    - Keep / change / delete: Keep; centralizes lateral clamp logic (alternative is duplicating guard-rail math in callers).
    - Confidence / assumptions: Medium confidence; assumes guard-rail flags accurately match segment geometry.
  
  
  
  - `resolveSpriteInteractionsInSeg`
    - Purpose: Processes sprite-player interactions within a segment, triggering toggles, animations, impacts, and cleanup for collected props.【F:src/gameplay.js†L1920-L1959】
    - Inputs: `seg` — segment object whose `sprites` array is inspected.【F:src/gameplay.js†L1920-L1924】
    - Outputs: None; mutates sprites/segment arrays in place.【F:src/gameplay.js†L1920-L1959】
    - Side effects: Marks sprites as interacted, updates metrics, removes toggled sprites, and may recycle transient sprites.【F:src/gameplay.js†L1924-L1959】
    - Shared state touched and where it’s used: Reads player lateral position and metrics; invoked by `resolveSegmentCollisions` during collision passes.【F:src/gameplay.js†L1922-L1958】【F:src/gameplay.js†L2027-L2029】
    - Dependencies: Uses `playerHalfWN`, `getSpriteMeta`, `switchSpriteAnimationClip`, `applyImpactPushToSprite`, and `recycleTransientSprite`.【F:src/gameplay.js†L1922-L1956】
    - Edge cases it handles or misses: Skips empty segments, ignores zero-width sprites, and checks interaction flags before double-triggering; assumes sprite metadata supplies widths.【F:src/gameplay.js†L1920-L1957】
    - Performance: Iterates sprites in a segment; cost proportional to sprite count, typically limited to on-screen segments.【F:src/gameplay.js†L1922-L1959】
    - Units / spaces: Compares normalized lateral offsets (`state.playerN`) against sprite widths in normalized units.【F:src/gameplay.js†L1922-L1934】
    - Determinism: Deterministic, aside from reliance on deterministic sprite state transitions.【F:src/gameplay.js†L1920-L1959】
    - Keep / change / delete: Keep; isolates sprite-interaction logic (alternative is folding into the broader collision loop).
    - Confidence / assumptions: Medium confidence; assumes sprite metadata is accurate and `seg.sprites` holds mutable arrays.
  
  
  
  - `resolveCarCollisionsInSeg`
    - Purpose: Handles collisions between the player and NPC cars within a segment, applying velocity transfers, landing logic, and metrics updates.【F:src/gameplay.js†L1962-L2021】
    - Inputs: `seg` — segment whose `cars` array is tested.【F:src/gameplay.js†L1962-L1969】
    - Outputs: Returns `true` if a collision occurred, otherwise `false`.【F:src/gameplay.js†L1962-L2021】
    - Side effects: Mutates player physics, applies collision push to cars, stamps cooldown timers, and increments metrics counters.【F:src/gameplay.js†L1978-L2019】
    - Shared state touched and where it’s used: Reads and writes `state.phys`, `state.metrics`, and car metadata; orchestrated by `resolveSegmentCollisions`.【F:src/gameplay.js†L1962-L2019】【F:src/gameplay.js†L2025-L2029】
    - Dependencies: Uses `playerHalfWN`, `carHalfWN`, `ensureCarNearMissReset`, `tryRegisterCarNearMiss`, `groundProfileAt`, `tangentNormalFromSlope`, `playerFloorHeightAt`, and `applyNpcCollisionPush`.【F:src/gameplay.js†L1965-L2014】
    - Edge cases it handles or misses: Skips empty car arrays, respects airborne immunity unless hop height is low, enforces per-car cooldown, and forces landings when configured; assumes car data includes speeds and offsets.【F:src/gameplay.js†L1964-L2016】
    - Performance: Iterates cars within the segment; cost scales with local NPC density.【F:src/gameplay.js†L1964-L2017】
    - Units / spaces: Operates in normalized lateral offsets and world velocities/positions.【F:src/gameplay.js†L1966-L2012】
    - Determinism: Deterministic, barring any randomness in upstream car behavior.【F:src/gameplay.js†L1962-L2021】
    - Keep / change / delete: Keep; encapsulates complex collision handling (alternative is embedding logic in the integration loop).
    - Confidence / assumptions: Medium confidence; assumes car hitboxes and cooldown constants are tuned consistently.
  
  
  
  - `resolveSegmentCollisions`
    - Purpose: Processes both car and sprite collision handling for a single segment and reports whether a car impact occurred.【F:src/gameplay.js†L2025-L2029】
    - Inputs: `seg` — segment instance to resolve.【F:src/gameplay.js†L2025-L2028】
    - Outputs: Returns `true` when a car collision was registered; otherwise `false`.【F:src/gameplay.js†L2025-L2029】
    - Side effects: Delegates side effects to the underlying car/sprite helpers.【F:src/gameplay.js†L2025-L2029】
    - Shared state touched and where it’s used: Relies on `state` mutations performed inside delegated calls; invoked directly during the physics sweep to handle current and crossed segments.【F:src/gameplay.js†L2025-L2029】【F:src/gameplay.js†L2398-L2407】
    - Dependencies: Calls `resolveCarCollisionsInSeg` and `resolveSpriteInteractionsInSeg`.【F:src/gameplay.js†L2025-L2029】
    - Edge cases it handles or misses: Immediately returns `false` when the segment is falsy; assumes segment arrays exist when provided.【F:src/gameplay.js†L2025-L2028】
    - Performance: Constant overhead beyond delegated per-object loops.【F:src/gameplay.js†L2025-L2029】
    - Units / spaces: Inherits units from delegated helpers (normalized lateral, world velocities).【F:src/gameplay.js†L2025-L2029】
    - Determinism: Deterministic given deterministic delegates.【F:src/gameplay.js†L2025-L2029】
    - Keep / change / delete: Keep; provides a single entry point for collision resolution (alternative is calling the two helpers separately each time).
    - Confidence / assumptions: High confidence; assumes delegates remain side-effectful as intended.
  
  
  
  - `resolveCollisions`
    - Purpose: Convenience wrapper that resolves collisions in the player’s current segment.【F:src/gameplay.js†L2032-L2036】
    - Inputs: None; derives the segment from `state.phys.s`.【F:src/gameplay.js†L2032-L2035】
    - Outputs: Returns the result of `resolveSegmentCollisions`, or `false` if no segment exists.【F:src/gameplay.js†L2032-L2036】
    - Side effects: None beyond delegated collision work.【F:src/gameplay.js†L2032-L2036】
    - Shared state touched and where it’s used: Reads `state.phys.s` to fetch the segment; currently unused elsewhere, but available for debugging or scripting.【F:src/gameplay.js†L2033-L2036】
    - Dependencies: Calls `segmentAtS` and `resolveSegmentCollisions`.【F:src/gameplay.js†L2033-L2036】
    - Edge cases it handles or misses: Returns `false` when the segment lookup fails; assumes `state.phys.s` is finite.【F:src/gameplay.js†L2033-L2036】
    - Performance: Constant beyond delegated work.【F:src/gameplay.js†L2032-L2036】
    - Units / spaces: Uses track S positions for lookup.【F:src/gameplay.js†L2033-L2036】
    - Determinism: Deterministic.【F:src/gameplay.js†L2032-L2036】
    - Keep / change / delete: Keep; handy shim for potential external callers (alternative is invoking `resolveSegmentCollisions(segmentAtS(...))` manually).
    - Confidence / assumptions: Medium confidence; assumes future tooling may call it despite no in-repo uses.
  
  
  
  - `updateSpriteAnimations`
    - Purpose: Advances sprite animations, lifetimes, and motion effects across all segments, recycling expired instances and transferring moving effects between segments.【F:src/gameplay.js†L2038-L2108】
    - Inputs: `dt` — time step in seconds; expects non-negative finite value.【F:src/gameplay.js†L2038-L2107】
    - Outputs: None; mutates sprite state and segment arrays.【F:src/gameplay.js†L2038-L2107】
    - Side effects: Decrements TTLs, updates animation frames, moves impactable effects, and may relocate sprites between segment arrays.【F:src/gameplay.js†L2051-L2104】
    - Shared state touched and where it’s used: Iterates the global `segments` collection and sprite metadata; executed each physics tick to keep effects alive.【F:src/gameplay.js†L2039-L2106】【F:src/gameplay.js†L2409-L2410】
    - Dependencies: Calls helpers such as `recycleTransientSprite`, `applyDriftSmokeMotion`, `applySparksMotion`, `advanceSpriteAnimation`, `updateImpactableSprite`, and `ensureArray`.【F:src/gameplay.js†L2041-L2103】
    - Edge cases it handles or misses: Skips segments without sprites, guards against invalid animation data, and ensures frame indices stay within bounds; assumes sprite arrays are mutable.【F:src/gameplay.js†L2041-L2093】
    - Performance: Loops over all segments and their sprites each frame; cost proportional to active sprite count.【F:src/gameplay.js†L2039-L2106】
    - Units / spaces: Works with normalized offsets (`spr.offset`), TTL seconds, and animation frame indices.【F:src/gameplay.js†L2051-L2103】
    - Determinism: Deterministic provided helper motion/animation code is deterministic.【F:src/gameplay.js†L2038-L2107】
    - Keep / change / delete: Keep; central tick for sprite effects (alternative is distributing animation updates across multiple sites).
    - Confidence / assumptions: Medium confidence; assumes sprite helpers behave consistently and segments remain enumerable.
  
  
  
  - `collectSegmentsCrossed`
    - Purpose: Identifies which segments the player traversed during an integration step so collision checks can process them in order.【F:src/gameplay.js†L2111-L2124】
    - Inputs: `startS` — starting S position; `endS` — ending S position; expects finite numbers and positive `segmentLength`.【F:src/gameplay.js†L2111-L2118】
    - Outputs: Returns an array of segment objects encountered between the endpoints (excluding the starting segment).【F:src/gameplay.js†L2111-L2124】
    - Side effects: None.【F:src/gameplay.js†L2111-L2124】
    - Shared state touched and where it’s used: Uses `segmentLength`, `wrapSegmentIndex`, and `segmentAtIndex`; consumed by `updatePhysics` to replay collisions for crossed segments.【F:src/gameplay.js†L2112-L2123】【F:src/gameplay.js†L2254-L2261】
    - Dependencies: Calls `hasSegments`, `wrapSegmentIndex`, and `segmentAtIndex`.【F:src/gameplay.js†L2111-L2123】
    - Edge cases it handles or misses: Early-outs when there are no segments, length is invalid, or no segment crossing occurred.【F:src/gameplay.js†L2111-L2124】
    - Performance: Iterates once per crossed segment; cost proportional to the number of segments traversed in the step.【F:src/gameplay.js†L2119-L2123】
    - Units / spaces: Operates in track S units normalized by `segmentLength`.【F:src/gameplay.js†L2112-L2120】
    - Determinism: Deterministic.【F:src/gameplay.js†L2111-L2124】
    - Keep / change / delete: Keep; isolates wrap-aware traversal logic (alternative is duplicating the loop in `updatePhysics`).
    - Confidence / assumptions: High confidence; assumes segment indices wrap correctly via `wrapSegmentIndex`.
  
  
  
  - `updatePhysics`
    - Purpose: Advances the player’s physics simulation for one timestep, incorporating input, drift, boosts, collisions, effects, and race bookkeeping.【F:src/gameplay.js†L2127-L2431】
    - Inputs: `dt` — simulation timestep in seconds; expected non-negative finite value.【F:src/gameplay.js†L2127-L2135】
    - Outputs: None; mutates global game state.【F:src/gameplay.js†L2127-L2431】
    - Side effects: Updates player physics (`state.phys`), input flags, drift state, boost timers, metrics, zone effects, collision outcomes, sprite animations, and may queue respawns.【F:src/gameplay.js†L2137-L2430】
    - Shared state touched and where it’s used: Operates on `state.phys`, `state.input`, `state.metrics`, segment data, and effects timers; called each frame by `step`.【F:src/gameplay.js†L2127-L2430】【F:src/gameplay.js†L2785-L2787】
    - Dependencies: Invokes numerous helpers including `doHop`, `segmentAtS`, `boostZonesForPlayer`, `groundProfileAt`, `tangentNormalFromSlope`, `applyCliffPushForce`, `collectSegmentsCrossed`, `resolveSegmentCollisions`, `updateSpriteAnimations`, and `queueRespawn`.【F:src/gameplay.js†L2137-L2416】
    - Edge cases it handles or misses: Guards against missing segments, caps boost timers, handles landing transitions, enforces guard-rail scraping penalties, tracks lap completion, and prevents respawn queues while reset matte is active; assumes helper functions succeed and that `trackLengthRef` is valid when laps matter.【F:src/gameplay.js†L2129-L2416】
    - Performance: Executes once per frame; loops over crossed segments and active effects, making it one of the heaviest runtime functions.【F:src/gameplay.js†L2194-L2407】
    - Units / spaces: Works in world S/Y coordinates, normalized lateral positions, and seconds for timers.【F:src/gameplay.js†L2149-L2407】
    - Determinism: Deterministic given deterministic inputs and helper behavior (no randomness inside the routine).【F:src/gameplay.js†L2127-L2431】
    - Keep / change / delete: Keep; central integration loop is necessary (alternative would be decomposing into smaller orchestrated steps).
    - Confidence / assumptions: Medium confidence; assumes all referenced helpers and state fields are initialized before stepping.
  
  
  
  - `clearSegmentCars`
    - Purpose: Empties the per-segment car lists in preparation for respawning NPCs.【F:src/gameplay.js†L2433-L2437】
    - Inputs: None.【F:src/gameplay.js†L2433-L2437】
    - Outputs: None; mutates segment arrays.【F:src/gameplay.js†L2433-L2437】
    - Side effects: Truncates each segment’s `cars` array to zero length.【F:src/gameplay.js†L2433-L2437】
    - Shared state touched and where it’s used: Iterates the global `segments` collection; invoked by `spawnCars` before repopulating NPCs.【F:src/gameplay.js†L2433-L2437】【F:src/gameplay.js†L2445-L2446】
    - Dependencies: Calls `hasSegments`.【F:src/gameplay.js†L2433-L2436】
    - Edge cases it handles or misses: Skips work if segments are unavailable; assumes each segment’s `cars` property is an array when present.【F:src/gameplay.js†L2433-L2437】
    - Performance: O(number of segments).【F:src/gameplay.js†L2433-L2437】
    - Units / spaces: Works on collection indices; no physical units.【F:src/gameplay.js†L2433-L2437】
    - Determinism: Deterministic.【F:src/gameplay.js†L2433-L2437】
    - Keep / change / delete: Keep; dedicated reset helper keeps spawning routine clean (alternative is inlining the loop into `spawnCars`).
    - Confidence / assumptions: High confidence; assumes segments own mutable `cars` arrays.
  
  
  
  - `spawnCars`
    - Purpose: Populates the world with NPC cars at random segments, seeding their offsets, types, and speeds.【F:src/gameplay.js†L2440-L2463】
    - Inputs: None.【F:src/gameplay.js†L2440-L2463】
    - Outputs: None; fills `state.cars` and segment `cars` arrays.【F:src/gameplay.js†L2440-L2463】
    - Side effects: Clears previous cars, allocates new car objects, and mutates segment collections; relies on `Math.random`.【F:src/gameplay.js†L2441-L2463】
    - Shared state touched and where it’s used: Updates `state.cars` and segment `cars`; invoked during scene reset to refresh traffic.【F:src/gameplay.js†L2442-L2463】【F:src/gameplay.js†L2740-L2743】
    - Dependencies: Calls `hasSegments`, `clearSegmentCars`, `segmentAtS`, `npcLateralLimit`, `getSpriteMeta`, and `ensureArray`.【F:src/gameplay.js†L2440-L2462】
    - Edge cases it handles or misses: Bail outs when segments are absent; otherwise assumes NPC metadata exists and road bounds are valid.【F:src/gameplay.js†L2441-L2462】
    - Performance: O(number of NPCs); linear in configured `NPC.total`.【F:src/gameplay.js†L2447-L2463】
    - Units / spaces: Chooses longitudinal positions in segment units and normalized lateral offsets within computed bounds.【F:src/gameplay.js†L2449-L2458】
    - Determinism: Non-deterministic because of `Math.random`.【F:src/gameplay.js†L2449-L2460】
    - Keep / change / delete: Keep; encapsulates spawn logic (alternative is to expose a deterministic seeding method if needed).
    - Confidence / assumptions: Medium confidence; assumes NPC constants (`NPC.total`, `CAR_TYPES`) are configured.
  
  
  
  - `steerAvoidance`
    - Purpose: Computes a lateral offset adjustment for an NPC to avoid the player or other cars ahead within a configurable lookahead window.【F:src/gameplay.js†L2466-L2499】
    - Inputs: `car` — NPC descriptor; `carSeg` — current segment; `playerSeg` — player’s segment; `playerW` — player half-width in normalized units.【F:src/gameplay.js†L2466-L2470】
    - Outputs: Returns a signed lateral delta to add to the car’s offset (can be 0).【F:src/gameplay.js†L2466-L2499】
    - Side effects: None directly; only computes a value.【F:src/gameplay.js†L2466-L2499】
    - Shared state touched and where it’s used: Reads `state.phys` and `state.playerN` to gauge proximity; called by `tickCars` before advancing NPCs.【F:src/gameplay.js†L2471-L2499】【F:src/gameplay.js†L2509-L2513】
    - Dependencies: Uses `segments`, `segmentAtIndex`, `overlap`, `npcLateralLimit`, and car width helpers.【F:src/gameplay.js†L2471-L2498】
    - Edge cases it handles or misses: Skips computation when segments are missing, caps responses when cars leave their lateral bounds, and scales avoidance inversely with lookahead distance; assumes lookahead segments exist.【F:src/gameplay.js†L2467-L2499】
    - Performance: Loops through a limited lookahead and peer cars; cost proportional to lookahead × local car density.【F:src/gameplay.js†L2471-L2498】
    - Units / spaces: Operates in normalized lateral offsets and compares speeds in world units.【F:src/gameplay.js†L2477-L2493】
    - Determinism: Deterministic given deterministic state inputs.【F:src/gameplay.js†L2466-L2499】
    - Keep / change / delete: Keep; isolates avoidance heuristics (alternative is embedding logic directly in `tickCars`).
    - Confidence / assumptions: Medium confidence; assumes lookahead configuration and overlap thresholds are tuned.
  
  
  
  - `tickCars`
    - Purpose: Updates all NPC cars for the frame, applying avoidance steering, collision pushes, and longitudinal movement while syncing segment membership.【F:src/gameplay.js†L2502-L2538】
    - Inputs: `dt` — timestep in seconds.【F:src/gameplay.js†L2502-L2522】
    - Outputs: None; mutates car objects and segment arrays.【F:src/gameplay.js†L2502-L2537】
    - Side effects: Adjusts car offsets, advances positions with wrapping, applies collision push decay, and migrates cars between segment lists.【F:src/gameplay.js†L2510-L2536】
    - Shared state touched and where it’s used: Operates on `state.cars`, `segments`, and car-specific collision push state; executed each frame by `step`.【F:src/gameplay.js†L2502-L2537】【F:src/gameplay.js†L2785-L2787】
    - Dependencies: Calls `hasSegments`, `segmentAtS`, `steerAvoidance`, `playerHalfWN`, `wrapDistance`, `npcLateralLimit`, and `ensureArray`.【F:src/gameplay.js†L2503-L2536】
    - Edge cases it handles or misses: Skips processing when there are no segments or cars, clears stale collision pushes, clamps offsets within NPC limits, and updates segment ownership safely; assumes collision push structures are well-formed.【F:src/gameplay.js†L2503-L2536】
    - Performance: Linear in the number of active cars per frame.【F:src/gameplay.js†L2504-L2537】
    - Units / spaces: Uses world S for positions and normalized lateral offsets for lane clamping.【F:src/gameplay.js†L2511-L2536】
    - Determinism: Deterministic aside from any randomness embedded in prior spawn data.【F:src/gameplay.js†L2502-L2538】
    - Keep / change / delete: Keep; central NPC update loop (alternative is splitting into multiple passes).
    - Confidence / assumptions: Medium confidence; assumes car metadata (speed, offset) remains valid across frames.
  
  
  
  - `spawnProps`
    - Purpose: Loads sprite placement data and instantiates all static/ambient props across the track, rebuilding sprite metadata overrides.【F:src/gameplay.js†L2541-L2571】
    - Inputs: None (async).【F:src/gameplay.js†L2541-L2571】
    - Outputs: Returns a promise that resolves once props are spawned; updates `state.spriteMeta`.【F:src/gameplay.js†L2541-L2571】
    - Side effects: Clears existing segment sprite arrays, logs warnings on load failure, updates sprite metadata, and creates sprite instances via factories.【F:src/gameplay.js†L2542-L2570】
    - Shared state touched and where it’s used: Mutates `segments`, `state.spriteMeta`, and relies on asset loading; called during scene resets and exposed publicly.【F:src/gameplay.js†L2541-L2571】【F:src/gameplay.js†L2740-L2743】【F:src/gameplay.js†L2796-L2799】
    - Dependencies: Calls `hasSegments`, `ensureSpriteDataLoaded`, `buildSpriteMetaOverrides`, `generateSpriteInstances`, and `createSpriteFromInstance`.【F:src/gameplay.js†L2541-L2569】
    - Edge cases it handles or misses: Falls back to default metadata when loading fails or data is incomplete; assumes placement data is well-formed when present.【F:src/gameplay.js†L2542-L2569】
    - Performance: Iterates through all segments and generated instances; cost proportional to track size and placement count.【F:src/gameplay.js†L2542-L2570】
    - Units / spaces: Utilizes segment indices and sprite metadata defined in asset data.【F:src/gameplay.js†L2546-L2568】
    - Determinism: Deterministic given deterministic asset data (no randomization).【F:src/gameplay.js†L2541-L2571】
    - Keep / change / delete: Keep; centralizes prop loading (alternative is to inline asset handling in reset logic).
    - Confidence / assumptions: Medium confidence; assumes asset pipeline supplies consistent catalog and placement structures.
  
  
  
  - `resetPlayerState`
    - Purpose: Reinitializes the player’s physics, camera smoothing, drift state, and related timers to a known baseline, optionally overriding position and timers.【F:src/gameplay.js†L2631-L2676】
    - Inputs: Options object with optional `s`, `playerN`, `cameraHeight`, and `timers` overrides; defaults to current state values.【F:src/gameplay.js†L2631-L2651】
    - Outputs: None.【F:src/gameplay.js†L2631-L2676】
    - Side effects: Mutates `state.phys`, `state.playerN`, camera smoothing values, drift/boost timers, pending respawns, and metrics guards.【F:src/gameplay.js†L2637-L2675】
    - Shared state touched and where it’s used: Resets numerous `state` fields; invoked by respawn logic and scene resets.【F:src/gameplay.js†L2631-L2676】【F:src/gameplay.js†L2684-L2687】【F:src/gameplay.js†L2742-L2747】
    - Dependencies: Calls `playerFloorHeightAt`, `computeDriftSmokeInterval`, and `computeSparksInterval`.【F:src/gameplay.js†L2641-L2666】
    - Edge cases it handles or misses: Defaults to current player lateral position when not provided, resets timers when supplied, and clears metrics flags; assumes physics state object exists.【F:src/gameplay.js†L2637-L2676】
    - Performance: Constant-time.【F:src/gameplay.js†L2631-L2676】
    - Units / spaces: Works in world S/Y coordinates and normalized lateral offsets.【F:src/gameplay.js†L2637-L2644】
    - Determinism: Deterministic for given inputs.【F:src/gameplay.js†L2631-L2676】
    - Keep / change / delete: Keep; shared reset utility reduces duplication (alternative is scattering manual resets across call sites).
    - Confidence / assumptions: High confidence; assumes dependent helper intervals return valid numbers.
  
  
  
  - `respawnPlayerAt`
    - Purpose: Respawns the player at a specific longitudinal position and lateral offset, clamping within allowed bounds before delegating to `resetPlayerState`.【F:src/gameplay.js†L2679-L2687】
    - Inputs: `sTarget` — desired S position; `nNorm` — desired normalized lateral position (default 0).【F:src/gameplay.js†L2679-L2687】
    - Outputs: None.【F:src/gameplay.js†L2679-L2687】
    - Side effects: Wraps the S coordinate, clamps the lateral offset, and invokes `resetPlayerState`.【F:src/gameplay.js†L2679-L2687】
    - Shared state touched and where it’s used: Reads track length and player limits; used by the reset matte to complete respawns and exported on the Gameplay API.【F:src/gameplay.js†L2679-L2687】【F:src/render.js†L2032-L2055】
    - Dependencies: Calls `trackLengthRef`, `segmentAtS`, `playerLateralLimit`, `clamp`, and `resetPlayerState`.【F:src/gameplay.js†L2680-L2687】
    - Edge cases it handles or misses: Supports tracks with zero length (no wrap), ensures lateral offset respects local limits; assumes segment lookup succeeds or defaults to index 0.【F:src/gameplay.js†L2680-L2687】
    - Performance: Constant-time.【F:src/gameplay.js†L2679-L2687】
    - Units / spaces: Operates on track S units and normalized lateral offsets.【F:src/gameplay.js†L2680-L2686】
    - Determinism: Deterministic.【F:src/gameplay.js†L2679-L2687】
    - Keep / change / delete: Keep; thin wrapper ensures respawns respect limits (alternative is repeating wrap/limit math at call sites).
    - Confidence / assumptions: High confidence; assumes `playerLateralLimit` returns sensible bounds even if the segment lookup falls back to index 0.
  
  
  
  - `applyDefaultFieldOfView`
    - Purpose: Syncs the active camera state with the default gameplay FOV, either via the registered updater or by directly assigning the stored value.【F:src/gameplay.js†L2689-L2696】
    - Inputs: None.【F:src/gameplay.js†L2689-L2696】
    - Outputs: None.【F:src/gameplay.js†L2689-L2696】
    - Side effects: Invokes `state.camera.updateFromFov` if available or sets `cameraState.fieldOfView` directly.【F:src/gameplay.js†L2689-L2695】
    - Shared state touched and where it’s used: Reads from `state.camera` and `camera` defaults; called at scene reset to initialize the camera.【F:src/gameplay.js†L2689-L2696】【F:src/gameplay.js†L2699-L2706】
    - Dependencies: Uses camera state and the callback installed by `setFieldOfView`.【F:src/gameplay.js†L2689-L2695】
    - Edge cases it handles or misses: Falls back to direct assignment when no updater is registered; assumes `cameraState` exists when `state` is initialized.【F:src/gameplay.js†L2689-L2696】
    - Performance: Constant-time.【F:src/gameplay.js†L2689-L2696】
    - Units / spaces: Deals with degrees for FOV values.【F:src/gameplay.js†L2689-L2695】
    - Determinism: Deterministic.【F:src/gameplay.js†L2689-L2696】
    - Keep / change / delete: Keep; provides a safe way to reapply defaults (alternative is duplicating the callback-check each time).
    - Confidence / assumptions: High confidence; assumes `state.camera` is populated before reset.
  
  
  
  - `resetScene`
    - Purpose: Reinitializes the entire gameplay scene—reloading track/cliff data, resetting texture zones, metrics, props, cars, and player state to start a new session.【F:src/gameplay.js†L2699-L2751】
    - Inputs: None (async).【F:src/gameplay.js†L2699-L2751】
    - Outputs: Returns a promise that resolves when setup completes.【F:src/gameplay.js†L2699-L2751】
    - Side effects: Applies default FOV, rebuilds track/cliff data, resets zone arrays, recreates metrics, respawns props/cars, resets player/race state, and logs warnings on CSV issues.【F:src/gameplay.js†L2699-L2750】
    - Shared state touched and where it’s used: Mutates global `data` zone arrays, `state.metrics`, `state.cars`, and player/race state; invoked by bootstrap and app flows to start or restart gameplay.【F:src/gameplay.js†L2699-L2751】【F:src/bootstrap.js†L38-L65】【F:src/app.js†L722-L767】
    - Dependencies: Calls `applyDefaultFieldOfView`, `buildTrackFromCSV`, `buildCliffsFromCSV_Lite`, `enforceCliffWrap`, `pushZone`, `createInitialMetrics`, `spawnProps`, `spawnCars`, and `resetPlayerState`.【F:src/gameplay.js†L2700-L2747】
    - Edge cases it handles or misses: Catches and logs CSV load failures, ignores optional cliff build errors, and resets zones even when no segments exist; assumes asset paths are accessible.【F:src/gameplay.js†L2702-L2750】
    - Performance: Potentially heavy; performs async IO and iterates across segments to rebuild zones and props.【F:src/gameplay.js†L2702-L2750】
    - Units / spaces: Works in segment indices, track S units, and timer defaults.【F:src/gameplay.js†L2700-L2747】
    - Determinism: Deterministic aside from external IO results and randomness used by downstream spawns (e.g., car spawning).【F:src/gameplay.js†L2699-L2751】
    - Keep / change / delete: Keep; orchestrates full-scene setup (alternative would be splitting into multiple public calls but adds coordination complexity).
    - Confidence / assumptions: Medium confidence; assumes external CSV assets exist and `state.callbacks` handle optional notifications.
  
  
  
  - `queueReset`
    - Purpose: Requests a full scene reset by notifying callbacks, unless a reset matte is already active.【F:src/gameplay.js†L2754-L2759】
    - Inputs: None.【F:src/gameplay.js†L2754-L2759】
    - Outputs: None.【F:src/gameplay.js†L2754-L2759】
    - Side effects: Clears pending respawns and triggers `state.callbacks.onQueueReset` if provided.【F:src/gameplay.js†L2754-L2759】
    - Shared state touched and where it’s used: Mutates `state.pendingRespawn` and consults `state.resetMatteActive`; bound to the `R` key in the input handlers and exported via Gameplay API.【F:src/gameplay.js†L2754-L2759】【F:src/gameplay.js†L2596-L2598】【F:src/gameplay.js†L2799-L2802】
    - Dependencies: Relies on callback presence checks only.【F:src/gameplay.js†L2754-L2759】
    - Edge cases it handles or misses: No-ops if the reset matte is active; assumes callbacks handle asynchronous work safely.【F:src/gameplay.js†L2754-L2759】
    - Performance: Constant-time.【F:src/gameplay.js†L2754-L2759】
    - Units / spaces: Not applicable.【F:src/gameplay.js†L2754-L2759】
    - Determinism: Deterministic aside from callback behavior.【F:src/gameplay.js†L2754-L2759】
    - Keep / change / delete: Keep; provides a central reset hook (alternative is inlining callback invocation in input handlers).
    - Confidence / assumptions: High confidence; assumes callbacks manage visual reset flow.



- `queueRespawn`
  - Purpose: Queues a respawn by snapping to the nearest segment center and defers the actual reset to the matte flow.【F:src/gameplay.js†L2762-L2773】
  - Inputs: `sAtFail` — longitudinal S position where the failure occurred (can be non-finite).【F:src/gameplay.js†L2762-L2766】
  - Outputs: None; schedules data on `state.pendingRespawn`.【F:src/gameplay.js†L2764-L2767】
  - Side effects: Updates pending respawn data, bumps the respawn metric on first queue, and notifies callbacks.【F:src/gameplay.js†L2765-L2772】
  - Shared state touched and where it’s used: Writes `state.pendingRespawn`, reads `state.resetMatteActive` to early-out, increments `state.metrics.respawnCount`, and triggers `state.callbacks.onQueueRespawn`. Downstream reset logic consumes the pending data when matte completes.【F:src/gameplay.js†L2762-L2772】【F:src/render.js†L2032-L2055】
  - Dependencies: Uses `nearestSegmentCenter` for snapping and relies on callback presence checks.【F:src/gameplay.js†L2762-L2767】
  - Edge cases it handles or misses: No-ops while reset matte is active; otherwise assumes `state.metrics` exists when counting respawns.【F:src/gameplay.js†L2762-L2769】
  - Performance: Constant-time.【F:src/gameplay.js†L2762-L2773】
  - Units / spaces: Operates in track S units for respawn positioning.【F:src/gameplay.js†L2762-L2766】
  - Determinism: Deterministic aside from callback behaviour.【F:src/gameplay.js†L2762-L2772】
  - Keep / change / delete: Keep; centralizes respawn queuing without duplicating metric/callback handling.
  - Confidence / assumptions: High confidence; assumes matte flow will read `state.pendingRespawn`.



- `startRaceSession`
  - Purpose: Activates a race session with a validated lap target and stamps the start time.【F:src/gameplay.js†L2775-L2781】
  - Inputs: Destructured options object with `laps` (defaults to 1).【F:src/gameplay.js†L2775-L2777】
  - Outputs: None; mutates race state.【F:src/gameplay.js†L2777-L2781】
  - Side effects: Marks racing active, zeroes laps completed, records start time, and clears finish time.【F:src/gameplay.js†L2777-L2781】
  - Shared state touched and where it’s used: Writes `state.race` values that drive HUD and win-check logic elsewhere.【F:src/gameplay.js†L2777-L2781】【F:src/render.js†L2032-L2055】
  - Dependencies: Uses `state.phys.t` for the starting clock and `Math.floor` to sanitize lap counts.【F:src/gameplay.js†L2775-L2780】
  - Edge cases it handles or misses: Falls back to a single lap when `laps` is non-finite or non-positive.【F:src/gameplay.js†L2775-L2777】
  - Performance: Constant-time.【F:src/gameplay.js†L2775-L2781】
  - Units / spaces: Lap counts are integers; start time uses simulation seconds from physics state.【F:src/gameplay.js†L2775-L2781】
  - Determinism: Deterministic given the same inputs and physics clock.【F:src/gameplay.js†L2775-L2781】
  - Keep / change / delete: Keep; succinctly encapsulates race start initialization.
  - Confidence / assumptions: High confidence; assumes `state.phys.t` tracks elapsed simulation time.



- `step`
  - Purpose: Advances gameplay for a frame by running physics and car AI ticks.【F:src/gameplay.js†L2784-L2786】
  - Inputs: `dt` — time delta in seconds passed from the render loop.【F:src/gameplay.js†L2784-L2786】【F:src/render.js†L2114-L2120】
  - Outputs: None.【F:src/gameplay.js†L2784-L2786】
  - Side effects: Mutates player state via `updatePhysics` and NPC state via `tickCars`.【F:src/gameplay.js†L2784-L2786】【F:src/render.js†L2114-L2120】
  - Shared state touched and where it’s used: Indirectly updates `state.phys`, `state.cars`, and related metrics consumed by rendering and HUD logic.【F:src/gameplay.js†L2784-L2786】【F:src/render.js†L873-L887】
  - Dependencies: Delegates to `updatePhysics` and `tickCars`.【F:src/gameplay.js†L2784-L2786】
  - Edge cases it handles or misses: Assumes `dt` is provided; no internal guards for zero/negative deltas.【F:src/gameplay.js†L2784-L2786】
  - Performance: Linear in the complexity of physics and car updates; wrapper itself is constant-time.【F:src/gameplay.js†L2784-L2786】
  - Units / spaces: Uses seconds for `dt`.【F:src/gameplay.js†L2784-L2786】
  - Determinism: Follows determinism of underlying update functions and any RNG they use.【F:src/gameplay.js†L2784-L2786】
  - Keep / change / delete: Keep; provides a narrow stepping API for the render loop.
  - Confidence / assumptions: High confidence; assumes upstream caller normalizes `dt`.

### 3.5 Sprite Placement, RNG, & Effects (`src/gameplay.js`)



- `splitCsvLine`
  - Purpose: Splits a CSV row into trimmed cells with quote and escape handling.【F:src/gameplay.js†L412-L440】
  - Inputs: `line` — raw CSV line string.【F:src/gameplay.js†L412-L413】
  - Outputs: Array of trimmed cell strings preserving embedded commas inside quotes.【F:src/gameplay.js†L412-L440】
  - Side effects: None.【F:src/gameplay.js†L412-L440】
  - Shared state touched and where it’s used: None directly; consumed by `parseCsvWithHeader` when loading sprite CSVs.【F:src/gameplay.js†L442-L470】
  - Dependencies: String traversal and quote escaping logic only.【F:src/gameplay.js†L412-L440】
  - Edge cases it handles or misses: Handles doubled quotes inside quoted fields; trims whitespace; does not enforce consistent column counts.【F:src/gameplay.js†L412-L440】
  - Performance: Linear in line length.【F:src/gameplay.js†L412-L440】
  - Units / spaces: Works on raw text lines.【F:src/gameplay.js†L412-L440】
  - Determinism: Deterministic for a given string input.【F:src/gameplay.js†L412-L440】
  - Keep / change / delete: Keep; encapsulates CSV parsing quirks.
  - Confidence / assumptions: High confidence; assumes UTF-8 text and simple CSV quoting.



- `parseCsvWithHeader`
  - Purpose: Parses sprite placement CSV text, optionally extracting a header row, and returns normalized records.【F:src/gameplay.js†L442-L470】
  - Inputs: `text` — full CSV contents as a string.【F:src/gameplay.js†L442-L446】
  - Outputs: Object `{ header, rows }` where `header` is an array or `null`, and `rows` are arrays or keyed objects based on header presence.【F:src/gameplay.js†L442-L470】
  - Side effects: None.【F:src/gameplay.js†L442-L470】
  - Shared state touched and where it’s used: None directly; upstream loaders feed placements into sprite spawning.【F:src/gameplay.js†L2567-L2570】
  - Dependencies: Uses `splitCsvLine` for tokenization and lowercases cells to detect headers containing sprite-related columns.【F:src/gameplay.js†L451-L456】
  - Edge cases it handles or misses: Skips blank/comment lines; tolerates missing headers by returning raw cell arrays; assumes header appears before data.【F:src/gameplay.js†L442-L470】
  - Performance: Linear in line count and cell count.【F:src/gameplay.js†L442-L470】
  - Units / spaces: Operates on text; column names are case-insensitive for detection.【F:src/gameplay.js†L451-L456】
  - Determinism: Deterministic for given text input.【F:src/gameplay.js†L442-L470】
  - Keep / change / delete: Keep; simplifies ingesting authored CSV with comments and optional headers.
  - Confidence / assumptions: High confidence; assumes sprite placement files follow the expected naming conventions.



- `parseNumberRange`
  - Purpose: Converts a single value or `a-b` token into a numeric range object.【F:src/gameplay.js†L472-L487】
  - Inputs: `value` (any) plus optional `{ allowFloat }` to control parsing mode.【F:src/gameplay.js†L472-L477】
  - Outputs: `{ start, end }` when parsing succeeds, otherwise `null`.【F:src/gameplay.js†L479-L487】
  - Side effects: None.【F:src/gameplay.js†L472-L487】
  - Shared state touched and where it’s used: None directly; upstream parsing feeds sprite placement ranges.【F:src/gameplay.js†L886-L897】
  - Dependencies: Uses regex matching and `parseFloat`/`parseInt` based on `allowFloat`.【F:src/gameplay.js†L476-L479】
  - Edge cases it handles or misses: Trims whitespace; accepts negative numbers; returns `null` on NaN values; treats single numbers as degenerate ranges.【F:src/gameplay.js†L472-L487】
  - Performance: Constant-time for fixed-length strings.【F:src/gameplay.js†L472-L487】
  - Units / spaces: Generic numeric ranges (segments, lanes, scales).【F:src/gameplay.js†L472-L487】
  - Determinism: Deterministic.【F:src/gameplay.js†L472-L487】
  - Keep / change / delete: Keep; avoids duplicated range parsing logic.
  - Confidence / assumptions: High confidence; assumes well-formed numeric text.



- `parseNumericRange`
  - Purpose: Normalizes a parsed number range into an ordered `[min, max]` tuple.【F:src/gameplay.js†L489-L495】
  - Inputs: `value` (any) forwarded to `parseNumberRange` with float parsing enabled.【F:src/gameplay.js†L489-L491】
  - Outputs: Array `[min, max]` or `null` when parsing fails.【F:src/gameplay.js†L491-L495】
  - Side effects: None.【F:src/gameplay.js†L489-L495】
  - Shared state touched and where it’s used: None directly; consumed by sprite placement parsing for scales and jitters.【F:src/gameplay.js†L893-L897】
  - Dependencies: Relies on `parseNumberRange`.【F:src/gameplay.js†L489-L491】
  - Edge cases it handles or misses: Swaps start/end so order does not matter; returns `null` for invalid input.【F:src/gameplay.js†L491-L495】
  - Performance: Constant-time.【F:src/gameplay.js†L489-L495】
  - Units / spaces: Numeric ranges for scale/jitter values.【F:src/gameplay.js†L489-L495】
  - Determinism: Deterministic.【F:src/gameplay.js†L489-L495】
  - Keep / change / delete: Keep; provides concise normalization.
  - Confidence / assumptions: High confidence; assumes caller validates semantics.



- `parseSpritePool`
  - Purpose: Converts a comma-delimited sprite identifier list into an array.【F:src/gameplay.js†L497-L504】
  - Inputs: `value` — string/number/array-like convertible to string.【F:src/gameplay.js†L497-L500】
  - Outputs: Array of trimmed, non-empty sprite IDs.【F:src/gameplay.js†L501-L504】
  - Side effects: None.【F:src/gameplay.js†L497-L504】
  - Shared state touched and where it’s used: None directly; used by placement parsing before catalog lookups.【F:src/gameplay.js†L885-L888】
  - Dependencies: String split and trim only.【F:src/gameplay.js†L500-L503】
  - Edge cases it handles or misses: Returns empty array for nullish input; drops empty tokens.【F:src/gameplay.js†L497-L504】
  - Performance: Linear in token count.【F:src/gameplay.js†L497-L504】
  - Units / spaces: Sprite ID strings.【F:src/gameplay.js†L497-L504】
  - Determinism: Deterministic.【F:src/gameplay.js†L497-L504】
  - Keep / change / delete: Keep; small helper keeps parsing readable.
  - Confidence / assumptions: High confidence; assumes IDs are comma-separated.



- `parsePlacementMode`
  - Purpose: Normalizes placement mode strings into canonical enum values for tapering logic.【F:src/gameplay.js†L506-L525】
  - Inputs: `value` — placement mode token (string/any).【F:src/gameplay.js†L506-L508】
  - Outputs: One of `uniform`, `taperScale`, `taperAtlas`, or `taperBoth`.【F:src/gameplay.js†L509-L525】
  - Side effects: None.【F:src/gameplay.js†L506-L525】
  - Shared state touched and where it’s used: None directly; used while parsing sprite placements to control bias application.【F:src/gameplay.js†L897-L899】【F:src/gameplay.js†L774-L776】
  - Dependencies: String normalization only.【F:src/gameplay.js†L506-L525】
  - Edge cases it handles or misses: Accepts several delimiter variants; defaults to `uniform` for unknown input or nullish values.【F:src/gameplay.js†L506-L525】
  - Performance: Constant-time.【F:src/gameplay.js†L506-L525】
  - Units / spaces: String tokens.【F:src/gameplay.js†L506-L525】
  - Determinism: Deterministic.【F:src/gameplay.js†L506-L525】
  - Keep / change / delete: Keep; centralizes allowed mode aliases.
  - Confidence / assumptions: High confidence; assumes future modes would extend this mapping.



- `normalizeSeed`
  - Purpose: Produces a non-zero unsigned seed from numeric input or coordinate hashes for deterministic RNG.【F:src/gameplay.js†L528-L537】
  - Inputs: `seed` plus optional `a`, `b` numbers to mix when `seed` is non-finite.【F:src/gameplay.js†L528-L535】
  - Outputs: Unsigned 32-bit integer seed, defaulting to 1 when zero would result.【F:src/gameplay.js†L529-L536】
  - Side effects: None.【F:src/gameplay.js†L528-L536】
  - Shared state touched and where it’s used: None directly; feeds `createRng` for sprite placement randomness.【F:src/gameplay.js†L760-L763】
  - Dependencies: Bitwise mixing constants and `Math.floor`.【F:src/gameplay.js†L529-L535】
  - Edge cases it handles or misses: Handles null/NaN by hashing coordinates; forces non-zero seed to avoid degenerate RNG state.【F:src/gameplay.js†L528-L536】
  - Performance: Constant-time.【F:src/gameplay.js†L528-L536】
  - Units / spaces: Unitless seeds.【F:src/gameplay.js†L528-L536】
  - Determinism: Deterministic given inputs.【F:src/gameplay.js†L528-L536】
  - Keep / change / delete: Keep; protects RNG from zero state.
  - Confidence / assumptions: High confidence; assumes coordinate hashes stay within 32-bit math.



- `createRng`
  - Purpose: Returns a xorshift-like PRNG seeded with a non-zero integer for deterministic sampling.【F:src/gameplay.js†L539-L546】
  - Inputs: `seed` — unsigned integer seed (defaults to 1 when falsy).【F:src/gameplay.js†L539-L540】
  - Outputs: Function generating floats in [0,1).【F:src/gameplay.js†L541-L546】
  - Side effects: Maintains internal `state` closure variable.【F:src/gameplay.js†L540-L546】
  - Shared state touched and where it’s used: None global; used throughout sprite instance generation for repeatable randomness.【F:src/gameplay.js†L760-L764】
  - Dependencies: Integer arithmetic and bitwise mixing constants.【F:src/gameplay.js†L541-L545】
  - Edge cases it handles or misses: Forces non-zero default state; no overflow guards beyond 32-bit ops.【F:src/gameplay.js†L539-L546】
  - Performance: Constant-time per sample.【F:src/gameplay.js†L541-L546】
  - Units / spaces: Unitless random samples.【F:src/gameplay.js†L541-L546】
  - Determinism: Deterministic for a given seed sequence.【F:src/gameplay.js†L541-L546】
  - Keep / change / delete: Keep; lightweight deterministic RNG avoids global `Math.random` variability.
  - Confidence / assumptions: High confidence; assumes consumers reseed as needed.



- `randomInRange`
  - Purpose: Samples a float within a numeric range using the provided RNG or `Math.random`.【F:src/gameplay.js†L549-L556】
  - Inputs: `range` array `[min,max]`, optional `rng` function, and `fallback` default.【F:src/gameplay.js†L549-L556】
  - Outputs: Sampled number or fallback when inputs are invalid.【F:src/gameplay.js†L549-L556】
  - Side effects: None.【F:src/gameplay.js†L549-L556】
  - Shared state touched and where it’s used: None; used for jitter sampling in sprite placement.【F:src/gameplay.js†L791-L794】
  - Dependencies: Relies on provided RNG and arithmetic only.【F:src/gameplay.js†L549-L556】
  - Edge cases it handles or misses: Returns fallback for bad ranges, degenerates to endpoints when widths are ~0.【F:src/gameplay.js†L549-L556】
  - Performance: Constant-time.【F:src/gameplay.js†L549-L556】
  - Units / spaces: Same units as input range (segments, lanes, scale).【F:src/gameplay.js†L549-L556】
  - Determinism: Depends on RNG input; deterministic with deterministic RNG.【F:src/gameplay.js†L549-L556】
  - Keep / change / delete: Keep; concise reusable sampler.
  - Confidence / assumptions: High confidence; assumes caller validates range semantics.



- `computeAxisScaleWeight`
  - Purpose: Calculates a taper weight favoring central items along an axis for scale modulation.【F:src/gameplay.js†L559-L570】
  - Inputs: `count` — total slots; `index` — current slot index.【F:src/gameplay.js†L559-L566】
  - Outputs: Clamped weight in [0,1] (default 1).【F:src/gameplay.js†L564-L570】
  - Side effects: None.【F:src/gameplay.js†L559-L570】
  - Shared state touched and where it’s used: None directly; combined in `computePlacementBias` to bias sprite scale.【F:src/gameplay.js†L589-L606】
  - Dependencies: Uses `clamp` and `clamp01` utilities and simple math.【F:src/gameplay.js†L562-L570】
  - Edge cases it handles or misses: Returns neutral weight when counts <3 or non-finite indices; avoids divide-by-zero via epsilon guards.【F:src/gameplay.js†L559-L570】
  - Performance: Constant-time.【F:src/gameplay.js†L559-L570】
  - Units / spaces: Slot indices (unitless).【F:src/gameplay.js†L559-L570】
  - Determinism: Deterministic.【F:src/gameplay.js†L559-L570】
  - Keep / change / delete: Keep; reusable for both segment and lane tapering.
  - Confidence / assumptions: High confidence; assumes counts are modest integers.



- `computeAxisAtlasBias`
  - Purpose: Computes a normalized bias factor to steer atlas frame selection toward edges or center based on position.【F:src/gameplay.js†L573-L586】
  - Inputs: `count` total slots; `index` current slot.【F:src/gameplay.js†L573-L578】
  - Outputs: Bias in [0,1] (defaults to 0.5).【F:src/gameplay.js†L574-L586】
  - Side effects: None.【F:src/gameplay.js†L573-L586】
  - Shared state touched and where it’s used: Used by `computePlacementBias` to derive atlas bias per axis.【F:src/gameplay.js†L589-L606】
  - Dependencies: Clamp helpers and power falloff math.【F:src/gameplay.js†L574-L586】
  - Edge cases it handles or misses: Returns neutral 0.5 for small or invalid counts; clamps indices and distances with epsilon to avoid zero-division.【F:src/gameplay.js†L573-L586】
  - Performance: Constant-time.【F:src/gameplay.js†L573-L586】
  - Units / spaces: Unitless slots.【F:src/gameplay.js†L573-L586】
  - Determinism: Deterministic.【F:src/gameplay.js†L573-L586】
  - Keep / change / delete: Keep; supports tapered atlas sampling.
  - Confidence / assumptions: High confidence; assumes counts are integers.



- `computePlacementBias`
  - Purpose: Combines axis scale weights and atlas biases to produce per-placement bias values.【F:src/gameplay.js†L589-L606】
  - Inputs: Segment count/index and lane count/index.【F:src/gameplay.js†L589-L605】
  - Outputs: Object `{ scale, atlas }` or `null` when no axis meets bias criteria.【F:src/gameplay.js†L603-L606】
  - Side effects: None.【F:src/gameplay.js†L589-L606】
  - Shared state touched and where it’s used: Used inside sprite instance generation to taper scales and atlas frame selection.【F:src/gameplay.js†L788-L795】
  - Dependencies: `computeAxisScaleWeight` and `computeAxisAtlasBias`.【F:src/gameplay.js†L591-L605】
  - Edge cases it handles or misses: Returns `null` when both axes lack sufficient slots; clamps indices inside helper functions.【F:src/gameplay.js†L589-L606】
  - Performance: Constant-time.【F:src/gameplay.js†L589-L606】
  - Units / spaces: Slot counts/indices.【F:src/gameplay.js†L589-L606】
  - Determinism: Deterministic.【F:src/gameplay.js†L589-L606】
  - Keep / change / delete: Keep; central bias aggregator.
  - Confidence / assumptions: High confidence; assumes non-negative slot counts.



- `biasedRandom01`
  - Purpose: Blends a random sample toward a provided weight to bias values in [0,1].【F:src/gameplay.js†L609-L616】
  - Inputs: `weight` (0–1 bias) and optional `rng` function.【F:src/gameplay.js†L609-L615】
  - Outputs: Clamped float in [0,1].【F:src/gameplay.js†L609-L616】
  - Side effects: None.【F:src/gameplay.js†L609-L616】
  - Shared state touched and where it’s used: None directly; applied when tapering sprite scale sampling.【F:src/gameplay.js†L618-L626】
  - Dependencies: `clamp01` and optional RNG.【F:src/gameplay.js†L613-L616】
  - Edge cases it handles or misses: Falls back to unbiased random when weight is non-finite; averages sample and bias then clamps.【F:src/gameplay.js†L609-L616】
  - Performance: Constant-time.【F:src/gameplay.js†L609-L616】
  - Units / spaces: Unitless normalized values.【F:src/gameplay.js†L609-L616】
  - Determinism: Deterministic given RNG sequence.【F:src/gameplay.js†L609-L616】
  - Keep / change / delete: Keep; small helper for taper shapes.
  - Confidence / assumptions: High confidence.



- `sampleScaleValue`
  - Purpose: Picks a sprite scale within a range, optionally tapered by bias for gradual transitions.【F:src/gameplay.js†L618-L626】
  - Inputs: `scaleRange` `[min,max]`, optional `rng`, `bias`, and `useTaper` flag.【F:src/gameplay.js†L618-L625】
  - Outputs: Number representing chosen scale.【F:src/gameplay.js†L618-L626】
  - Side effects: None.【F:src/gameplay.js†L618-L626】
  - Shared state touched and where it’s used: Used during sprite instance generation to size sprites per placement mode.【F:src/gameplay.js†L788-L795】
  - Dependencies: `randomInRange`, `biasedRandom01`, and `lerp`.【F:src/gameplay.js†L621-L626】
  - Edge cases it handles or misses: Falls back to `min` when invalid or zero span; ignores bias when taper disabled.【F:src/gameplay.js†L618-L626】
  - Performance: Constant-time.【F:src/gameplay.js†L618-L626】
  - Units / spaces: Scale multipliers (unitless).【F:src/gameplay.js†L618-L626】
  - Determinism: Deterministic with deterministic RNG.【F:src/gameplay.js†L618-L626】
  - Keep / change / delete: Keep; encapsulates taper-aware sampling.
  - Confidence / assumptions: High confidence.



- `sampleUniformIndex`
  - Purpose: Samples a uniform integer index within `[0, count)`.【F:src/gameplay.js†L629-L634】
  - Inputs: `count` — total options; optional `rng` function.【F:src/gameplay.js†L629-L633】
  - Outputs: Integer index (defaults to 0 when invalid).【F:src/gameplay.js†L629-L634】
  - Side effects: None.【F:src/gameplay.js†L629-L634】
  - Shared state touched and where it’s used: None; used for random frame/asset selection when no bias provided.【F:src/gameplay.js†L722-L727】
  - Dependencies: Optional RNG and `clamp`.【F:src/gameplay.js†L631-L634】
  - Edge cases it handles or misses: Returns 0 for non-finite or small counts; modulus prevents overflow but not bias from non-uniform RNG.【F:src/gameplay.js†L629-L633】
  - Performance: Constant-time.【F:src/gameplay.js†L629-L634】
  - Units / spaces: Index units.【F:src/gameplay.js†L629-L634】
  - Determinism: Deterministic with deterministic RNG.【F:src/gameplay.js†L629-L634】
  - Keep / change / delete: Keep; standard uniform picker.
  - Confidence / assumptions: High confidence.



- `sampleBiasedIndex`
  - Purpose: Samples an index with controllable skew toward lower or higher indices via bias shaping.【F:src/gameplay.js†L636-L653】
  - Inputs: `count`, optional `rng`, and `bias` in [0,1].【F:src/gameplay.js†L636-L648】
  - Outputs: Integer index (0 when invalid).【F:src/gameplay.js†L636-L653】
  - Side effects: None.【F:src/gameplay.js†L636-L653】
  - Shared state touched and where it’s used: Used for atlas frame and asset selection when tapering is enabled.【F:src/gameplay.js†L723-L726】【F:src/gameplay.js†L710-L715】
  - Dependencies: `clamp01`, `sampleUniformIndex`, `Math.pow`.【F:src/gameplay.js†L639-L653】
  - Edge cases it handles or misses: Falls back to uniform when bias invalid; clamps bias; protects exponent with epsilon.【F:src/gameplay.js†L636-L653】
  - Performance: Constant-time.【F:src/gameplay.js†L636-L653】
  - Units / spaces: Index units.【F:src/gameplay.js†L636-L653】
  - Determinism: Deterministic given RNG and bias.【F:src/gameplay.js†L636-L653】
  - Keep / change / delete: Keep; enables nuanced tapering.
  - Confidence / assumptions: High confidence.



- `computeLaneStep`
  - Purpose: Determines the lateral step size between lane placements based on range and repeat hints.【F:src/gameplay.js†L656-L662】
  - Inputs: `range` with `start`/`end`, and `repeatLane` override.【F:src/gameplay.js†L656-L660】
  - Outputs: Step value (0 when degenerate).【F:src/gameplay.js†L656-L662】
  - Side effects: None.【F:src/gameplay.js†L656-L662】
  - Shared state touched and where it’s used: None directly; used when generating lane position lists for sprite placement.【F:src/gameplay.js†L755-L758】
  - Dependencies: Math only.【F:src/gameplay.js†L656-L662】
  - Edge cases it handles or misses: Returns 0 for zero-width ranges; respects positive repeat overrides when provided.【F:src/gameplay.js†L656-L662】
  - Performance: Constant-time.【F:src/gameplay.js†L656-L662】
  - Units / spaces: Lane units (normalized lateral positions).【F:src/gameplay.js†L656-L662】
  - Determinism: Deterministic.【F:src/gameplay.js†L656-L662】
  - Keep / change / delete: Keep; small helper clarifies spacing rules.
  - Confidence / assumptions: High confidence.



- `dedupePositions`
  - Purpose: Filters a list of numeric positions, removing near-duplicate entries within an epsilon.【F:src/gameplay.js†L664-L672】
  - Inputs: `values` — iterable of numbers.【F:src/gameplay.js†L664-L667】
  - Outputs: Array of unique positions.【F:src/gameplay.js†L664-L672】
  - Side effects: None.【F:src/gameplay.js†L664-L672】
  - Shared state touched and where it’s used: Used by lane position generation to avoid redundant placements.【F:src/gameplay.js†L674-L696】
  - Dependencies: Iteration and absolute difference checks.【F:src/gameplay.js†L665-L669】
  - Edge cases it handles or misses: Skips non-finite values; treats positions within 1e-6 as duplicates.【F:src/gameplay.js†L664-L672】
  - Performance: O(n²) in worst case due to nested `some` checks, but small lists expected.【F:src/gameplay.js†L664-L672】
  - Units / spaces: Position units mirror input.【F:src/gameplay.js†L664-L672】
  - Determinism: Deterministic.【F:src/gameplay.js†L664-L672】
  - Keep / change / delete: Keep; adequate for small placement arrays.
  - Confidence / assumptions: High confidence; assumes small n prevents perf issues.



- `computeLanePositions`
  - Purpose: Generates an ordered set of lane offsets between start and end using a given step, deduping endpoints.【F:src/gameplay.js†L674-L696】
  - Inputs: `start`, `end`, and `step`.【F:src/gameplay.js†L674-L681】
  - Outputs: Array of lane positions.【F:src/gameplay.js†L674-L696】
  - Side effects: None.【F:src/gameplay.js†L674-L696】
  - Shared state touched and where it’s used: Feeds placement generation to determine lateral spawn points.【F:src/gameplay.js†L755-L758】
  - Dependencies: Relies on `dedupePositions`.【F:src/gameplay.js†L677-L696】
  - Edge cases it handles or misses: Returns empty array when bounds invalid; caps loop iterations to 1024; handles directionality and near-end rounding.【F:src/gameplay.js†L674-L696】
  - Performance: Linear up to the iteration cap.【F:src/gameplay.js†L682-L695】
  - Units / spaces: Lane offsets (normalized road units).【F:src/gameplay.js†L674-L696】
  - Determinism: Deterministic.【F:src/gameplay.js†L674-L696】
  - Keep / change / delete: Keep; encapsulates stepping and dedupe logic.
  - Confidence / assumptions: High confidence; assumes small lane sets.



- `clampSegmentRange`
  - Purpose: Clamps a user-provided segment range to valid indices within the current track length.【F:src/gameplay.js†L698-L706】
  - Inputs: `range` with `start`/`end`, and `segCount` total segments.【F:src/gameplay.js†L698-L703】
  - Outputs: Normalized `{ start, end }` or `null` when invalid.【F:src/gameplay.js†L698-L705】
  - Side effects: None.【F:src/gameplay.js†L698-L706】
  - Shared state touched and where it’s used: Consumed by sprite instance generation to avoid out-of-bounds placements.【F:src/gameplay.js†L752-L754】
  - Dependencies: Math floor/clamp operations.【F:src/gameplay.js†L698-L704】
  - Edge cases it handles or misses: Handles negative/oversized bounds; returns null when segment count missing or non-positive.【F:src/gameplay.js†L698-L705】
  - Performance: Constant-time.【F:src/gameplay.js†L698-L706】
  - Units / spaces: Segment indices.【F:src/gameplay.js†L698-L705】
  - Determinism: Deterministic.【F:src/gameplay.js†L698-L706】
  - Keep / change / delete: Keep; prevents invalid segment access.
  - Confidence / assumptions: High confidence; assumes segment count reflects active track.



- `selectAsset`
  - Purpose: Chooses a sprite asset variant from an array, optionally biased for atlas tapering.【F:src/gameplay.js†L708-L716】
  - Inputs: `assets` array, optional `rng`, and `options.atlasBias`.【F:src/gameplay.js†L708-L714】
  - Outputs: Shallow-cloned asset object with frames copied, or `null`.【F:src/gameplay.js†L708-L716】
  - Side effects: None.【F:src/gameplay.js†L708-L716】
  - Shared state touched and where it’s used: None directly; used during sprite instance materialization to pick textures.【F:src/gameplay.js†L794-L795】
  - Dependencies: Relies on `sampleBiasedIndex` when multiple assets are available.【F:src/gameplay.js†L712-L714】
  - Edge cases it handles or misses: Returns null for empty arrays; defaults to first asset when selection fails.【F:src/gameplay.js†L708-L715】
  - Performance: Constant-time.【F:src/gameplay.js†L708-L716】
  - Units / spaces: Asset objects as authored in catalog.【F:src/gameplay.js†L708-L716】
  - Determinism: Deterministic with deterministic RNG.【F:src/gameplay.js†L708-L716】
  - Keep / change / delete: Keep; isolates selection and cloning concerns.
  - Confidence / assumptions: High confidence.



- `determineInitialFrame`
  - Purpose: Picks the starting animation frame for a sprite instance using clips or atlas frames with optional bias.【F:src/gameplay.js†L718-L730】
  - Inputs: `entry` catalog record, `asset`, optional `rng`, and `options.atlasBias`.【F:src/gameplay.js†L718-L725】
  - Outputs: Frame index number.【F:src/gameplay.js†L718-L730】
  - Side effects: None.【F:src/gameplay.js†L718-L730】
  - Shared state touched and where it’s used: Invoked during sprite instance creation to seed animation state.【F:src/gameplay.js†L794-L804】【F:src/gameplay.js†L848-L855】
  - Dependencies: Uses `sampleUniformIndex`/`sampleBiasedIndex` for atlas frames and checks base clip frames first.【F:src/gameplay.js†L719-L727】
  - Edge cases it handles or misses: Falls back to 0 when no frames available; honors provided base clip when present.【F:src/gameplay.js†L718-L730】
  - Performance: Constant-time.【F:src/gameplay.js†L718-L730】
  - Units / spaces: Frame indices.【F:src/gameplay.js†L718-L730】
  - Determinism: Deterministic with deterministic RNG and inputs.【F:src/gameplay.js†L718-L730】
  - Keep / change / delete: Keep; centralizes initial frame policy.
  - Confidence / assumptions: High confidence.



- `buildSpriteMetaOverrides`
  - Purpose: Builds per-sprite metric overrides from the catalog to merge with defaults.【F:src/gameplay.js†L732-L739】
  - Inputs: `catalog` map with sprite entries and optional metrics.【F:src/gameplay.js†L732-L735】
  - Outputs: Plain object mapping sprite IDs to meta entries.【F:src/gameplay.js†L732-L739】
  - Side effects: None.【F:src/gameplay.js†L732-L739】
  - Shared state touched and where it’s used: Output merged into `state.spriteMeta` before spawning props.【F:src/gameplay.js†L2550-L2560】【F:src/gameplay.js†L2563-L2566】
  - Dependencies: `createSpriteMetaEntry` and catalog iteration.【F:src/gameplay.js†L734-L738】
  - Edge cases it handles or misses: Returns empty object when catalog missing or non-iterable.【F:src/gameplay.js†L732-L735】
  - Performance: O(n) over catalog entries.【F:src/gameplay.js†L732-L739】
  - Units / spaces: Sprite metric fields (scale, aspect, tint).【F:src/gameplay.js†L732-L739】
  - Determinism: Deterministic.【F:src/gameplay.js†L732-L739】
  - Keep / change / delete: Keep; separates catalog ingestion from runtime state.
  - Confidence / assumptions: High confidence.



- `generateSpriteInstances`
  - Purpose: Expands placement specs into concrete sprite instances with positions, scales, assets, and frames.【F:src/gameplay.js†L742-L808】
  - Inputs: `catalog` map, `placements` array.【F:src/gameplay.js†L742-L748】
  - Outputs: Array of instance objects ready for creation.【F:src/gameplay.js†L742-L808】
  - Side effects: None; pure assembly.【F:src/gameplay.js†L742-L808】
  - Shared state touched and where it’s used: Later consumed by `createSpriteFromInstance` when spawning props.【F:src/gameplay.js†L2559-L2566】【F:src/gameplay.js†L785-L805】
  - Dependencies: Uses numerous helpers (`clampSegmentRange`, `computeLanePositions`, `normalizeSeed`, `createRng`, `computePlacementBias`, `sampleScaleValue`, `randomInRange`, `selectAsset`, `determineInitialFrame`).【F:src/gameplay.js†L753-L805】
  - Edge cases it handles or misses: Skips invalid specs, empty pools, or out-of-range segments; defaults lane positions when missing; direction-aware stepping with guard for overshoot.【F:src/gameplay.js†L747-L805】
  - Performance: O(placements × segments × lanes); loops bounded by placement specs and segment list size.【F:src/gameplay.js†L742-L806】
  - Units / spaces: Segment indices, lane offsets, scale multipliers, jitter ranges in segment units.【F:src/gameplay.js†L747-L805】
  - Determinism: Deterministic given catalog, placements, and seeded RNGs.【F:src/gameplay.js†L760-L795】
  - Keep / change / delete: Keep; core expansion step for prop spawning.
  - Confidence / assumptions: Medium-high; assumes helper outputs are validated.



- `createSpriteFromInstance`
  - Purpose: Instantiates a runtime sprite object from a placement instance, attaching animation/meta and registering to segments.【F:src/gameplay.js†L811-L865】
  - Inputs: `instance` containing entry, indices, offsets, scale, asset, and frame info.【F:src/gameplay.js†L811-L858】
  - Outputs: Sprite object or `null` when creation fails.【F:src/gameplay.js†L811-L865】
  - Side effects: Pushes sprite into the owning segment, configures impact data, and initializes UV/animation state.【F:src/gameplay.js†L857-L864】【F:src/gameplay.js†L848-L856】
  - Shared state touched and where it’s used: Mutates segment sprite arrays and uses track length for S wrapping; resulting sprites participate in rendering and collision/interactions.【F:src/gameplay.js†L815-L864】【F:src/render.js†L873-L887】
  - Dependencies: `segmentAtIndex`, `wrapDistance`, `trackLengthRef`, `createSpriteAnimationState`, `configureImpactableSprite`, `updateSpriteUv`, and ensureArray util.【F:src/gameplay.js†L813-L863】
  - Edge cases it handles or misses: Returns null when instance/segment missing; falls back to defaults for offsets, scale, and frames; handles atlas info from metrics or asset.【F:src/gameplay.js†L811-L855】
  - Performance: Constant-time per instance (aside from helper costs).【F:src/gameplay.js†L811-L865】
  - Units / spaces: Segment indices, world S positions, normalized offsets, scale multipliers.【F:src/gameplay.js†L817-L847】
  - Determinism: Deterministic given inputs and helpers.【F:src/gameplay.js†L811-L865】
  - Keep / change / delete: Keep; necessary bridge from catalog data to runtime sprites.
  - Confidence / assumptions: High confidence; assumes `segmentAtIndex` uses current track data.



- `loadSpriteCsv`
  - Purpose: Fetches a CSV file relative to the asset base, returning its text.【F:src/gameplay.js†L870-L878】
  - Inputs: `relativePath` string.【F:src/gameplay.js†L870-L872】
  - Outputs: Promise resolving to CSV text; rejects on HTTP errors.【F:src/gameplay.js†L874-L878】
  - Side effects: Network request via `fetch`.【F:src/gameplay.js†L874-L878】
  - Shared state touched and where it’s used: None directly; used by `ensureSpriteDataLoaded` to load placement data.【F:src/gameplay.js†L931-L934】
  - Dependencies: `World.resolveAssetUrl` when available, otherwise raw path.【F:src/gameplay.js†L870-L873】
  - Edge cases it handles or misses: Throws on non-OK responses; no retry/backoff; cache disabled via `no-store`.【F:src/gameplay.js†L874-L878】
  - Performance: Dependent on network; minimal processing otherwise.【F:src/gameplay.js†L874-L878】
  - Units / spaces: URL strings and raw text.【F:src/gameplay.js†L870-L878】
  - Determinism: Deterministic given network responses.【F:src/gameplay.js†L874-L878】
  - Keep / change / delete: Keep; thin IO wrapper.
  - Confidence / assumptions: High confidence; assumes fetch is available.



- `parseSpritePlacements`
  - Purpose: Converts CSV text into structured sprite placement specs including ranges, seeds, jitter, and modes.【F:src/gameplay.js†L881-L922】
  - Inputs: `text` — CSV contents.【F:src/gameplay.js†L881-L884】
  - Outputs: Array of placement objects with normalized numeric fields.【F:src/gameplay.js†L900-L919】
  - Side effects: None.【F:src/gameplay.js†L881-L922】
  - Shared state touched and where it’s used: Used by `ensureSpriteDataLoaded` to populate placement lists for spawning props.【F:src/gameplay.js†L931-L934】【F:src/gameplay.js†L2557-L2560】
  - Dependencies: `parseCsvWithHeader`, `parseSpritePool`, `parseNumberRange`, `parseNumericRange`, `parsePlacementMode`, and numeric parsing helpers.【F:src/gameplay.js†L881-L918】
  - Edge cases it handles or misses: Skips rows lacking sprite IDs; defaults repeat counts and seeds; supports both headered and headerless CSVs; ignores invalid numeric fields.【F:src/gameplay.js†L885-L919】
  - Performance: Linear in row count.【F:src/gameplay.js†L881-L922】
  - Units / spaces: Segment indices, lane offsets, jitter/scale ranges in their respective units.【F:src/gameplay.js†L900-L918】
  - Determinism: Deterministic for given CSV text.【F:src/gameplay.js†L881-L922】
  - Keep / change / delete: Keep; central CSV ingestion step.
  - Confidence / assumptions: High confidence; assumes CSV authored per expected columns.



- `ensureSpriteDataLoaded`
  - Purpose: Lazily loads sprite catalog and placement data once, caching results for reuse.【F:src/gameplay.js†L924-L941】
  - Inputs: None.【F:src/gameplay.js†L924-L936】
  - Outputs: Promise resolving to `{ catalog, placements }`.【F:src/gameplay.js†L928-L935】
  - Side effects: Triggers fetch of placement CSV and catalog retrieval; caches results and resets promise on errors.【F:src/gameplay.js†L927-L940】
  - Shared state touched and where it’s used: Writes `spriteDataCache`/`spriteDataPromise`; used by `spawnProps` to obtain placement info.【F:src/gameplay.js†L924-L940】【F:src/gameplay.js†L2538-L2559】
  - Dependencies: `SpriteCatalog.getCatalog`, `loadSpriteCsv`, `parseSpritePlacements`.【F:src/gameplay.js†L928-L934】
  - Edge cases it handles or misses: Returns cached data on repeat calls; resets promise on failure to allow retry; assumes catalog getter exists or falls back to empty map.【F:src/gameplay.js†L924-L940】
  - Performance: Single IO sequence; subsequent calls constant-time due to cache.【F:src/gameplay.js†L924-L940】
  - Units / spaces: Data structures for sprites and placements.【F:src/gameplay.js†L928-L934】
  - Determinism: Deterministic aside from network/catalog content.【F:src/gameplay.js†L927-L934】
  - Keep / change / delete: Keep; necessary lazy loader.
  - Confidence / assumptions: High confidence.



- `computeDriftSmokeInterval`
  - Purpose: Computes the next spawn interval for drift smoke with optional jitter around a base value.【F:src/gameplay.js†L946-L952】
  - Inputs: None; uses constants `DRIFT_SMOKE_INTERVAL` and `_JITTER`.【F:src/gameplay.js†L946-L951】
  - Outputs: Positive interval in seconds.【F:src/gameplay.js†L946-L952】
  - Side effects: None.【F:src/gameplay.js†L946-L952】
  - Shared state touched and where it’s used: Initializes and updates `state.driftSmokeNextInterval`.【F:src/gameplay.js†L966-L972】【F:src/gameplay.js†L1080-L1087】
  - Dependencies: `Math.random` and configuration constants.【F:src/gameplay.js†L947-L951】
  - Edge cases it handles or misses: Clamps base to small positive value; zero jitter returns base; jitter applied symmetrically.【F:src/gameplay.js†L946-L951】
  - Performance: Constant-time.【F:src/gameplay.js†L946-L952】
  - Units / spaces: Seconds.【F:src/gameplay.js†L946-L952】
  - Determinism: Non-deterministic due to `Math.random`.【F:src/gameplay.js†L946-L952】
  - Keep / change / delete: Keep; small helper for effect pacing.
  - Confidence / assumptions: High confidence.



- `allocDriftSmokeSprite`
  - Purpose: Retrieves a drift-smoke sprite from the pool or creates a new placeholder object.【F:src/gameplay.js†L954-L956】
  - Inputs: None.【F:src/gameplay.js†L954-L955】
  - Outputs: Sprite object with `kind: 'DRIFT_SMOKE'`.【F:src/gameplay.js†L954-L956】
  - Side effects: Pops from `driftSmokePool` when available.【F:src/gameplay.js†L954-L956】
  - Shared state touched and where it’s used: Uses `driftSmokePool`; consumers add returned sprites to segments for rendering.【F:src/gameplay.js†L954-L956】【F:src/gameplay.js†L1188-L1218】
  - Dependencies: None beyond pool array.【F:src/gameplay.js†L954-L956】
  - Edge cases it handles or misses: Always returns an object; no pool size limit enforcement.【F:src/gameplay.js†L954-L956】
  - Performance: Constant-time.【F:src/gameplay.js†L954-L956】
  - Units / spaces: Sprite objects.【F:src/gameplay.js†L954-L956】
  - Determinism: Deterministic.【F:src/gameplay.js†L954-L956】
  - Keep / change / delete: Keep; basic pooling helper.
  - Confidence / assumptions: High confidence.



- `recycleDriftSmokeSprite`
  - Purpose: Resets and returns a drift-smoke sprite to the pool for reuse.【F:src/gameplay.js†L958-L971】
  - Inputs: `sprite` object.【F:src/gameplay.js†L958-L959】
  - Outputs: None.【F:src/gameplay.js†L958-L971】
  - Side effects: Clears sprite state fields and pushes back into `driftSmokePool`.【F:src/gameplay.js†L958-L971】
  - Shared state touched and where it’s used: Manages pooled sprites consumed by drift smoke spawning logic.【F:src/gameplay.js†L958-L971】【F:src/gameplay.js†L1188-L1218】
  - Dependencies: None beyond pool access.【F:src/gameplay.js†L958-L971】
  - Edge cases it handles or misses: No-ops on null or wrong-kind sprites.【F:src/gameplay.js†L958-L959】
  - Performance: Constant-time.【F:src/gameplay.js†L958-L971】
  - Units / spaces: Sprite objects.【F:src/gameplay.js†L958-L971】
  - Determinism: Deterministic.【F:src/gameplay.js†L958-L971】
  - Keep / change / delete: Keep; standard pool recycler.
  - Confidence / assumptions: High confidence.



- `computeSparksInterval`
  - Purpose: Computes spawn interval for spark effects with jitter around a base constant.【F:src/gameplay.js†L973-L979】
  - Inputs: None.【F:src/gameplay.js†L973-L978】
  - Outputs: Positive interval in seconds.【F:src/gameplay.js†L973-L979】
  - Side effects: None.【F:src/gameplay.js†L973-L979】
  - Shared state touched and where it’s used: Initializes `state.sparksNextInterval` timing for collision sparks.【F:src/gameplay.js†L1008-L1010】【F:src/gameplay.js†L1262-L1289】
  - Dependencies: `Math.random` and configured jitter constants.【F:src/gameplay.js†L973-L978】
  - Edge cases it handles or misses: Clamps base positive; zero jitter returns base; jitter symmetric.【F:src/gameplay.js†L973-L978】
  - Performance: Constant-time.【F:src/gameplay.js†L973-L979】
  - Units / spaces: Seconds.【F:src/gameplay.js†L973-L979】
  - Determinism: Non-deterministic due to random sampling.【F:src/gameplay.js†L973-L979】
  - Keep / change / delete: Keep; mirrors drift smoke helper.
  - Confidence / assumptions: High confidence.



- `allocSparksSprite`
  - Purpose: Pulls a sparks sprite from the pool or creates a new placeholder.【F:src/gameplay.js†L981-L983】
  - Inputs: None.【F:src/gameplay.js†L981-L982】
  - Outputs: Sprite object with `kind: 'SPARKS'`.【F:src/gameplay.js†L981-L983】
  - Side effects: Pops from `sparksPool` when available.【F:src/gameplay.js†L981-L983】
  - Shared state touched and where it’s used: Uses `sparksPool`; spawned during collision feedback effects.【F:src/gameplay.js†L981-L983】【F:src/gameplay.js†L1214-L1244】
  - Dependencies: None beyond pool array.【F:src/gameplay.js†L981-L983】
  - Edge cases it handles or misses: Always returns an object; no pool cap.【F:src/gameplay.js†L981-L983】
  - Performance: Constant-time.【F:src/gameplay.js†L981-L983】
  - Units / spaces: Sprite objects.【F:src/gameplay.js†L981-L983】
  - Determinism: Deterministic.【F:src/gameplay.js†L981-L983】
  - Keep / change / delete: Keep; paired with recycler.
  - Confidence / assumptions: High confidence.



- `recycleSparksSprite`
  - Purpose: Resets a sparks sprite’s state and returns it to the pool.【F:src/gameplay.js†L985-L1000】
  - Inputs: `sprite` object.【F:src/gameplay.js†L985-L986】
  - Outputs: None.【F:src/gameplay.js†L985-L1000】
  - Side effects: Clears state fields, offsets, and pushes into `sparksPool`.【F:src/gameplay.js†L986-L999】
  - Shared state touched and where it’s used: Supports pooling for collision spark effects and transient cleanup.【F:src/gameplay.js†L985-L1000】【F:src/gameplay.js†L1214-L1244】
  - Dependencies: Pool array only.【F:src/gameplay.js†L985-L1000】
  - Edge cases it handles or misses: No-ops on null/wrong kind; resets screen offsets in addition to world data.【F:src/gameplay.js†L985-L999】
  - Performance: Constant-time.【F:src/gameplay.js†L985-L1000】
  - Units / spaces: Sprite objects.【F:src/gameplay.js†L985-L1000】
  - Determinism: Deterministic.【F:src/gameplay.js†L985-L1000】
  - Keep / change / delete: Keep; complements allocator.
  - Confidence / assumptions: High confidence.



- `recycleTransientSprite`
  - Purpose: Dispatches sprite recycling to the correct pool based on kind (smoke or sparks).【F:src/gameplay.js†L1002-L1006】
  - Inputs: `sprite` object (possibly null).【F:src/gameplay.js†L1002-L1003】
  - Outputs: None.【F:src/gameplay.js†L1002-L1006】
  - Side effects: May recycle sprites into pools; otherwise no-op.【F:src/gameplay.js†L1002-L1006】
  - Shared state touched and where it’s used: Used when transient effects expire to reuse pooled objects.【F:src/gameplay.js†L1002-L1006】【F:src/gameplay.js†L1188-L1244】
  - Dependencies: `recycleDriftSmokeSprite`, `recycleSparksSprite`.【F:src/gameplay.js†L1003-L1005】
  - Edge cases it handles or misses: Safely ignores unknown kinds and null inputs.【F:src/gameplay.js†L1002-L1006】
  - Performance: Constant-time.【F:src/gameplay.js†L1002-L1006】
  - Units / spaces: Sprite objects.【F:src/gameplay.js†L1002-L1006】
  - Determinism: Deterministic.【F:src/gameplay.js†L1002-L1006】
  - Keep / change / delete: Keep; central transient cleanup helper.
  - Confidence / assumptions: High confidence.



- `keyActionFromFlag`
  - Purpose: Generates a keyboard handler that sets a specific input flag to a value.【F:src/gameplay.js†L2567-L2572】
  - Inputs: `flag` string (input key) and `value` boolean to assign.【F:src/gameplay.js†L2567-L2570】
  - Outputs: Function that mutates `state.input[flag]`.【F:src/gameplay.js†L2567-L2572】
  - Side effects: Updates gameplay input state when invoked.【F:src/gameplay.js†L2567-L2572】
  - Shared state touched and where it’s used: Used to build `keydownActions`/`keyupActions` mappings for event handlers.【F:src/gameplay.js†L2578-L2609】
  - Dependencies: Relies on closure over `state`.【F:src/gameplay.js†L2567-L2572】
  - Edge cases it handles or misses: Assumes flag exists on input object; no validation of event objects.【F:src/gameplay.js†L2567-L2572】
  - Performance: Constant-time.【F:src/gameplay.js†L2567-L2572】
  - Units / spaces: Boolean input flags.【F:src/gameplay.js†L2567-L2572】
  - Determinism: Deterministic side effects when called.【F:src/gameplay.js†L2567-L2572】
  - Keep / change / delete: Keep; reduces boilerplate for input mapping.
  - Confidence / assumptions: High confidence.



- `createKeyHandler`
  - Purpose: Wraps a lookup map of key codes into an event handler that invokes mapped actions.【F:src/gameplay.js†L2627-L2633】
  - Inputs: `actions` object keyed by `KeyboardEvent.code`.【F:src/gameplay.js†L2627-L2628】
  - Outputs: Function accepting an event and dispatching if a handler exists.【F:src/gameplay.js†L2627-L2633】
  - Side effects: Executes action callbacks which may mutate gameplay state.【F:src/gameplay.js†L2627-L2633】【F:src/gameplay.js†L2578-L2609】
  - Shared state touched and where it’s used: Used to produce `keydownHandler` and `keyupHandler` registered by the app for input processing.【F:src/gameplay.js†L2635-L2640】【F:src/app.js†L722-L767】
  - Dependencies: Action map supplied by caller.【F:src/gameplay.js†L2627-L2633】
  - Edge cases it handles or misses: Ignores unmapped keys; no preventDefault or repeat handling inside.【F:src/gameplay.js†L2627-L2633】
  - Performance: Constant-time per event (map lookup).【F:src/gameplay.js†L2627-L2633】
  - Units / spaces: KeyboardEvent codes.【F:src/gameplay.js†L2627-L2633】
  - Determinism: Deterministic given the action map.【F:src/gameplay.js†L2627-L2633】
  - Keep / change / delete: Keep; cleanly encapsulates event dispatch.
  - Confidence / assumptions: High confidence.

### 3.6 Track & Environment Management (`src/world.js`)



- `resolveAssetUrl`
  - Purpose: Resolves asset paths to absolute URLs, preferring browser extension APIs and falling back to document location or raw path.【F:src/world.js†L21-L42】
  - Inputs: `path` string (may be relative).【F:src/world.js†L21-L22】
  - Outputs: Resolved URL string or original path when resolution fails.【F:src/world.js†L21-L42】
  - Side effects: None; catches errors silently.【F:src/world.js†L24-L40】
  - Shared state touched and where it’s used: Used throughout asset manifest and CSV loading to locate resources.【F:src/world.js†L45-L57】【F:src/world.js†L451-L454】
  - Dependencies: Optional `chrome.runtime.getURL`, `global.location`, and `URL` constructor.【F:src/world.js†L24-L37】
  - Edge cases it handles or misses: Returns input unchanged for invalid strings; ignores errors from unavailable APIs; may throw only if all fallbacks fail unexpectedly.【F:src/world.js†L21-L42】
  - Performance: Constant-time aside from URL parsing.【F:src/world.js†L21-L42】
  - Units / spaces: URL strings.【F:src/world.js†L21-L42】
  - Determinism: Deterministic given environment state.【F:src/world.js†L24-L40】
  - Keep / change / delete: Keep; centralizes path resolution across targets.
  - Confidence / assumptions: High confidence; assumes either Chrome API or window location is available.



- `loadImage`
  - Purpose: Loads an image resource asynchronously and resolves with the DOM `Image` element.【F:src/world.js†L61-L68】
  - Inputs: `url` string.【F:src/world.js†L61-L62】
  - Outputs: Promise resolving to loaded `Image` or rejecting on error.【F:src/world.js†L61-L68】
  - Side effects: Creates a new `Image` element and starts network load.【F:src/world.js†L62-L67】
  - Shared state touched and where it’s used: None directly; used by texture loader to validate asset availability.【F:src/world.js†L70-L73】
  - Dependencies: Browser `Image` API.【F:src/world.js†L61-L67】
  - Edge cases it handles or misses: Relies on browser events; no timeout handling.【F:src/world.js†L62-L67】
  - Performance: Network-bound.【F:src/world.js†L61-L68】
  - Units / spaces: URL strings.【F:src/world.js†L61-L68】
  - Determinism: Depends on network/cache state.【F:src/world.js†L61-L68】
  - Keep / change / delete: Keep; minimal promise wrapper for image loading.
  - Confidence / assumptions: High confidence.



- `defaultTextureLoader`
  - Purpose: Baseline loader that preloads an image and returns its URL for use as a texture reference.【F:src/world.js†L70-L73】
  - Inputs: `_key` (ignored) and `url`.【F:src/world.js†L70-L71】
  - Outputs: Promise resolving to the provided URL after the image loads.【F:src/world.js†L70-L73】
  - Side effects: Triggers image download via `loadImage`.【F:src/world.js†L70-L72】
  - Shared state touched and where it’s used: Used as default in `loadTexturesWith` when no custom loader supplied.【F:src/world.js†L75-L92】
  - Dependencies: `loadImage`.【F:src/world.js†L70-L72】
  - Edge cases it handles or misses: Does not validate keys or transform data; fails if image load fails.【F:src/world.js†L70-L73】
  - Performance: Network-bound.【F:src/world.js†L70-L73】
  - Units / spaces: URL strings.【F:src/world.js†L70-L73】
  - Determinism: Depends on network/cache state.【F:src/world.js†L70-L73】
  - Keep / change / delete: Keep; simple default usable in browsers.
  - Confidence / assumptions: High confidence.



- `loadTexturesWith`
  - Purpose: Loads all manifest textures using a provided loader and prepares player vehicle fallbacks.【F:src/world.js†L75-L92】
  - Inputs: `loader` function (defaults to `defaultTextureLoader`).【F:src/world.js†L75-L76】
  - Outputs: Promise resolving to populated `textures` map.【F:src/world.js†L75-L92】
  - Side effects: Populates `textures` object, including aliases for player car assets.【F:src/world.js†L80-L89】
  - Shared state touched and where it’s used: Writes to `World.assets.textures`, consumed by rendering and sprite meta lookups.【F:src/world.js†L45-L57】【F:src/gameplay.js†L388-L401】
  - Dependencies: Asset manifest, `resolveAssetUrl`, provided loader, and `Promise.all`.【F:src/world.js†L80-L88】
  - Edge cases it handles or misses: Throws if loader not a function; fills `playerVehicle` fallback when missing specific asset keys.【F:src/world.js†L75-L89】
  - Performance: Parallel loads; overall time bound by slowest asset fetch.【F:src/world.js†L80-L92】
  - Units / spaces: Texture URL strings mapped by key.【F:src/world.js†L45-L57】【F:src/world.js†L80-L92】
  - Determinism: Deterministic given loader behaviour and network responses.【F:src/world.js†L75-L92】
  - Keep / change / delete: Keep; central texture bootstrap.
  - Confidence / assumptions: High confidence; assumes manifest entries are valid URLs.



- `resetCliffSeries`
  - Purpose: Clears cliff profile arrays for all segments, resetting readiness before rebuilding.【F:src/world.js†L111-L124】
  - Inputs: None (uses current `segments` length).【F:src/world.js†L111-L118】
  - Outputs: None.【F:src/world.js†L111-L124】
  - Side effects: Resizes and zeroes all cliff series arrays; marks `CLIFF_READY` false.【F:src/world.js†L111-L124】
  - Shared state touched and where it’s used: Prepares `CLIFF_SERIES` for CSV-driven updates; called before cliff CSV parsing.【F:src/world.js†L445-L448】
  - Dependencies: `segments` length and helper `clear` closure.【F:src/world.js†L111-L119】
  - Edge cases it handles or misses: Assumes `segments` already sized; no-op if length zero aside from marking not ready.【F:src/world.js†L111-L124】
  - Performance: O(n) in number of section slots.【F:src/world.js†L111-L121】
  - Units / spaces: Cliff deltas per section.【F:src/world.js†L111-L124】
  - Determinism: Deterministic.【F:src/world.js†L111-L124】
  - Keep / change / delete: Keep; required before repopulating cliff data.
  - Confidence / assumptions: High confidence.



- `randomSnowScreenColor`
  - Purpose: Generates a randomised RGB color (with alpha 1) for per-segment snow screen shading.【F:src/world.js†L126-L130】
  - Inputs: None.【F:src/world.js†L126-L129】
  - Outputs: Array `[r,g,b,a]` with cosine-based variation.【F:src/world.js†L126-L130】
  - Side effects: None.【F:src/world.js†L126-L130】
  - Shared state touched and where it’s used: Assigned to each segment when created for snow effects.【F:src/world.js†L132-L148】
  - Dependencies: `Math.random`, `Math.cos`, `Math.PI`.【F:src/world.js†L126-L129】
  - Edge cases it handles or misses: Always returns alpha 1; purely stochastic without seed.【F:src/world.js†L126-L130】
  - Performance: Constant-time.【F:src/world.js†L126-L130】
  - Units / spaces: Normalized color components.【F:src/world.js†L126-L130】
  - Determinism: Non-deterministic due to randomness.【F:src/world.js†L126-L130】
  - Keep / change / delete: Keep; simple color jitter for snow overlay variety.
  - Confidence / assumptions: High confidence.



- `roadWidthAt`
  - Purpose: Accessor returning configured road width (currently constant).【F:src/world.js†L94-L95】
  - Inputs: None; ignores position.【F:src/world.js†L94-L95】
  - Outputs: Numeric road width from config.【F:src/world.js†L94-L95】
  - Side effects: None.【F:src/world.js†L94-L95】
  - Shared state touched and where it’s used: Used by cliff sampling and gameplay to compute widths and offsets.【F:src/world.js†L744-L746】【F:src/gameplay.js†L1681-L1684】
  - Dependencies: `track.roadWidth` config field.【F:src/world.js†L94-L95】
  - Edge cases it handles or misses: Assumes config provides a finite width; no per-segment variation here.【F:src/world.js†L94-L95】
  - Performance: Constant-time.【F:src/world.js†L94-L95】
  - Units / spaces: World lateral units.【F:src/world.js†L94-L95】
  - Determinism: Deterministic.【F:src/world.js†L94-L95】
  - Keep / change / delete: Keep; simple accessor for potential future variation.
  - Confidence / assumptions: High confidence.



- `addSegment`
  - Purpose: Appends a road segment with geometry, features, and snow color to the track list.【F:src/world.js†L132-L149】
  - Inputs: `curve`, `y`, and optional `features` object.【F:src/world.js†L132-L138】
  - Outputs: None (mutates `segments`).【F:src/world.js†L132-L149】
  - Side effects: Clones feature flags, ensures rail/defaults, sets boost flags, initializes sprite/car arrays, assigns snow color.【F:src/world.js†L135-L148】
  - Shared state touched and where it’s used: Extends `segments`, later consumed by rendering and gameplay systems.【F:src/world.js†L132-L149】【F:src/gameplay.js†L741-L749】
  - Dependencies: `segmentLength`, `randomSnowScreenColor`, feature cloning utilities.【F:src/world.js†L132-L148】
  - Edge cases it handles or misses: Defaults rail to true when unspecified; copies boost arrays if present.【F:src/world.js†L135-L148】
  - Performance: Constant-time per segment creation.【F:src/world.js†L132-L149】
  - Units / spaces: Segment indices, world y/z coordinates, feature flags.【F:src/world.js†L132-L149】
  - Determinism: Deterministic aside from snow color randomness.【F:src/world.js†L126-L148】
  - Keep / change / delete: Keep; fundamental builder for track segments.
  - Confidence / assumptions: High confidence.



- `lastY`
  - Purpose: Returns the world Y of the final segment’s end point for chaining new segments.【F:src/world.js†L159-L161】
  - Inputs: None.【F:src/world.js†L159-L161】
  - Outputs: Number (0 when no segments).【F:src/world.js†L159-L161】
  - Side effects: None.【F:src/world.js†L159-L161】
  - Shared state touched and where it’s used: Used by `addRoad` to anchor elevation continuity.【F:src/world.js†L163-L174】
  - Dependencies: `segments` list.【F:src/world.js†L159-L161】
  - Edge cases it handles or misses: Safe when list empty (returns 0).【F:src/world.js†L159-L161】
  - Performance: Constant-time.【F:src/world.js†L159-L161】
  - Units / spaces: World Y units.【F:src/world.js†L159-L161】
  - Determinism: Deterministic.【F:src/world.js†L159-L161】
  - Keep / change / delete: Keep; simple helper.
  - Confidence / assumptions: High confidence.



- `addRoad`
  - Purpose: Constructs a series of segments representing a road section with curvature, elevation, and optional boost/rail features.【F:src/world.js†L163-L238】【F:src/world.js†L209-L239】
  - Inputs: `enter`, `hold`, `leave` counts; `curve`; `dyInSegments`; `elevationProfile`; `featurePayload`.【F:src/world.js†L163-L209】
  - Outputs: None directly; appends segments via `addSegment`.【F:src/world.js†L187-L239】
  - Side effects: Calculates elevation profile, boost zones, and rail presence; calls `addSegment` repeatedly, incrementing global boost ID counter when needed.【F:src/world.js†L190-L238】
  - Shared state touched and where it’s used: Extends `segments`, updates `boostZoneIdCounter`; output drives gameplay physics and rendering lanes/boosts.【F:src/world.js†L190-L238】【F:src/gameplay.js†L741-L749】
  - Dependencies: Helpers `clampBoostLane`, `pushZone` via features, `HEIGHT_EASE_UNIT`, `CURVE_EASE`, and `lastY`.【F:src/world.js†L168-L238】
  - Edge cases it handles or misses: No-op when total segments <=0; scales hill steepness for short sections; ensures boost ranges validated and defaults rails when unspecified.【F:src/world.js†L163-L238】
  - Performance: O(total segments) due to looped additions.【F:src/world.js†L230-L239】
  - Units / spaces: Segment counts, world Y delta expressed in segment lengths, curve magnitudes.【F:src/world.js†L163-L239】
  - Determinism: Deterministic given inputs (aside from snow color randomness in `addSegment`).【F:src/world.js†L132-L148】【F:src/world.js†L163-L239】
  - Keep / change / delete: Keep; core track construction routine.
  - Confidence / assumptions: High confidence; assumes config constants are valid.



- `buildTrackFromCSV`
  - Purpose: Parses track CSV to generate all road segments with curves, elevation, boost zones, and repeats.【F:src/world.js†L300-L443】
  - Inputs: `url` to CSV file.【F:src/world.js†L333-L339】【F:src/world.js†L320-L324】
  - Outputs: Promise that builds segments and sets `trackLength`; throws on empty results.【F:src/world.js†L300-L443】
  - Side effects: Fetches CSV, resets segments/boost counters, and appends segments via `addRoad`.【F:src/world.js†L320-L443】
  - Shared state touched and where it’s used: Populates `segments` and `trackLength` consumed by gameplay/world rendering; updates boost IDs.【F:src/world.js†L321-L443】【F:src/gameplay.js†L742-L749】
  - Dependencies: `resolveAssetUrl`, `fetch`, parsing helpers for ints/floats/bools, `parseBoostZoneType`, `parseBoostLaneValue`, `clampBoostLane`, `addRoad`.【F:src/world.js†L340-L438】
  - Edge cases it handles or misses: Skips comments/blank lines; handles aliasing for types; builds boost zones from explicit columns or legacy ranges; throws when no segments built.【F:src/world.js†L320-L443】
  - Performance: O(lines + segments) with network overhead.【F:src/world.js†L320-L443】
  - Units / spaces: Segment counts, curves, elevation in segment units, lane indices for boost zones.【F:src/world.js†L347-L443】
  - Determinism: Deterministic given CSV content and config (random snow still per segment).【F:src/world.js†L132-L148】【F:src/world.js†L320-L443】
  - Keep / change / delete: Keep; primary track ingestion path.
  - Confidence / assumptions: Medium-high; assumes CSV schema matches expectations.



- `buildCliffsFromCSV_Lite`
  - Purpose: Loads simplified cliff profile CSV and fills cliff series arrays for both sides of the road.【F:src/world.js†L445-L544】
  - Inputs: `url` to cliff CSV.【F:src/world.js†L451-L455】
  - Outputs: None; mutates cliff series and readiness flag.【F:src/world.js†L445-L544】
  - Side effects: Fetches CSV, logs warning on failure, populates `CLIFF_SERIES`, and sets `CLIFF_READY` true.【F:src/world.js†L445-L544】
  - Shared state touched and where it’s used: Writes to `CLIFF_SERIES`, `CLIFF_READY`; used by gameplay cliff sampling for push forces and visuals.【F:src/world.js†L445-L544】【F:src/gameplay.js†L1724-L1801】
  - Dependencies: `resolveAssetUrl`, `fetch`, easing utilities `getEase01`, and math helpers `lerp`.【F:src/world.js†L451-L518】【F:src/world.js†L502-L511】
  - Edge cases it handles or misses: Gracefully degrades to flat cliffs when CSV missing; supports absolute/relative modes, repeats, and side selection; wraps indices modulo total sections.【F:src/world.js†L445-L544】
  - Performance: O(lines × sectionsPerSeg × repeats); iterates through all cliff slots.【F:src/world.js†L473-L544】
  - Units / spaces: Section-wise dx/dy offsets per side per segment fraction.【F:src/world.js†L465-L544】
  - Determinism: Deterministic given CSV and easing functions.【F:src/world.js†L473-L544】
  - Keep / change / delete: Keep; necessary for cliff shaping.
  - Confidence / assumptions: Medium-high; assumes CSV authoring matches expected columns.



- `enforceCliffWrap`
  - Purpose: Copies trailing cliff samples to the start to ensure seamless wrap-around when looping the track.【F:src/world.js†L546-L563】
  - Inputs: `copySpan` (segments to mirror).【F:src/world.js†L546-L551】
  - Outputs: None.【F:src/world.js†L546-L563】
  - Side effects: Mutates `CLIFF_SERIES` arrays for the first `copySpan` segments when ready.【F:src/world.js†L546-L563】
  - Shared state touched and where it’s used: Run after cliff build to avoid visual seams; influences gameplay cliff sampling.【F:src/world.js†L546-L563】【F:src/gameplay.js†L1724-L1801】
  - Dependencies: `CLIFF_SERIES`, `segments.length`, arithmetic helpers.【F:src/world.js†L546-L562】
  - Edge cases it handles or misses: No-op when cliffs not ready or no segments; clamps copy span to available sections.【F:src/world.js†L546-L563】
  - Performance: O(copySpan × sectionsPerSeg).【F:src/world.js†L556-L563】
  - Units / spaces: Cliff sample arrays per section.【F:src/world.js†L546-L563】
  - Determinism: Deterministic.【F:src/world.js†L546-L563】
  - Keep / change / delete: Keep; ensures looping continuity.
  - Confidence / assumptions: High confidence.



- `pushZone`
  - Purpose: Adds a texture zone descriptor to a stack with start/end indices and tiling info.【F:src/world.js†L565-L569】
  - Inputs: `stack` array, `start`, `end`, optional `tile` repeat.【F:src/world.js†L565-L568】
  - Outputs: None; mutates stack.【F:src/world.js†L565-L569】
  - Side effects: Pushes normalized zone object onto stack.【F:src/world.js†L565-L569】
  - Shared state touched and where it’s used: Used during scene reset to seed road/rail/cliff texture zones for rendering.【F:src/world.js†L565-L569】【F:src/gameplay.js†L2722-L2735】
  - Dependencies: Basic math for ordering and tiling clamp.【F:src/world.js†L565-L568】
  - Edge cases it handles or misses: Swaps start/end when reversed; clamps tile to at least 1.【F:src/world.js†L565-L569】
  - Performance: Constant-time.【F:src/world.js†L565-L569】
  - Units / spaces: Segment indices and tile counts.【F:src/world.js†L565-L569】
  - Determinism: Deterministic.【F:src/world.js†L565-L569】
  - Keep / change / delete: Keep; simple helper for zone prep.
  - Confidence / assumptions: High confidence.



- `findZone`
  - Purpose: Finds the last zone covering a segment index within a stack (LIFO search).【F:src/world.js†L571-L574】
  - Inputs: `stack` of zones, `segIndex`.【F:src/world.js†L571-L573】
  - Outputs: Matching zone or `null`.【F:src/world.js†L571-L574】
  - Side effects: None.【F:src/world.js†L571-L574】
  - Shared state touched and where it’s used: Supports texture V-span computation in `vSpanForSeg`.【F:src/world.js†L576-L582】
  - Dependencies: Reverse iteration over stack.【F:src/world.js†L571-L574】
  - Edge cases it handles or misses: Returns null when none cover index; assumes zones have `start`/`end`.【F:src/world.js†L571-L574】
  - Performance: O(n) in stack length.【F:src/world.js†L571-L574】
  - Units / spaces: Segment indices.【F:src/world.js†L571-L574】
  - Determinism: Deterministic.【F:src/world.js†L571-L574】
  - Keep / change / delete: Keep; straightforward search helper.
  - Confidence / assumptions: High confidence.



- `vSpanForSeg`
  - Purpose: Computes the V texture span for a segment based on its containing zone tiling.【F:src/world.js†L576-L582】
  - Inputs: `zones` stack and `segIndex`.【F:src/world.js†L576-L579】
  - Outputs: Tuple `[v0, v1]` normalized within [0,1].【F:src/world.js†L576-L582】
  - Side effects: None.【F:src/world.js†L576-L582】
  - Shared state touched and where it’s used: Used during rendering to map texture coordinates per segment.【F:src/world.js†L576-L582】【F:src/render.js†L873-L887】
  - Dependencies: `findZone` and arithmetic on tile count.【F:src/world.js†L576-L582】
  - Edge cases it handles or misses: Defaults to full span when no zone found; guards tile with max(1).【F:src/world.js†L576-L582】
  - Performance: Constant-time.【F:src/world.js†L576-L582】
  - Units / spaces: Normalized texture V coordinates.【F:src/world.js†L576-L582】
  - Determinism: Deterministic.【F:src/world.js†L576-L582】
  - Keep / change / delete: Keep; small utility for UV mapping.
  - Confidence / assumptions: High confidence.



- `clampBoostLane`
  - Purpose: Clamps a boost lane value to configured min/max bounds.【F:src/world.js†L584-L592】
  - Inputs: `v` number (or null).【F:src/world.js†L584-L585】
  - Outputs: Clamped lane or original null.【F:src/world.js†L584-L592】
  - Side effects: None.【F:src/world.js†L584-L592】
  - Shared state touched and where it’s used: Used when parsing boost lanes and determining zone bounds.【F:src/world.js†L408-L418】【F:src/world.js†L602-L620】
  - Dependencies: Config `lanes.boost`.【F:src/world.js†L584-L592】
  - Edge cases it handles or misses: Returns null for nullish; clamps otherwise.【F:src/world.js†L584-L592】
  - Performance: Constant-time.【F:src/world.js†L584-L592】
  - Units / spaces: Boost lane indices (could be fractional).【F:src/world.js†L584-L592】
  - Determinism: Deterministic.【F:src/world.js†L584-L592】
  - Keep / change / delete: Keep; central lane guard.
  - Confidence / assumptions: High confidence.



- `clampRoadLane`
  - Purpose: Clamps a road lane value to configured road bounds with optional fallback.【F:src/world.js†L594-L600】
  - Inputs: `v` number (nullable) and `fallback`.【F:src/world.js†L594-L596】
  - Outputs: Clamped lane or fallback when nullish.【F:src/world.js†L594-L600】
  - Side effects: None.【F:src/world.js†L594-L600】
  - Shared state touched and where it’s used: Used by lane conversions and gameplay clamping of player offsets.【F:src/world.js†L602-L612】【F:src/gameplay.js†L2680-L2686】
  - Dependencies: Config `lanes.road`.【F:src/world.js†L594-L600】
  - Edge cases it handles or misses: Accepts fallback when `v` null; clamps otherwise.【F:src/world.js†L594-L600】
  - Performance: Constant-time.【F:src/world.js†L594-L600】
  - Units / spaces: Road lane indices.【F:src/world.js†L594-L600】
  - Determinism: Deterministic.【F:src/world.js†L594-L600】
  - Keep / change / delete: Keep; basic lane guard.
  - Confidence / assumptions: High confidence.



- `laneToCenterOffset`
  - Purpose: Converts a lane index to a center-offset distance using road lane bounds.【F:src/world.js†L602-L604】
  - Inputs: `n` lane index, optional fallback.【F:src/world.js†L602-L603】
  - Outputs: Half-lane-scaled offset value.【F:src/world.js†L602-L604】
  - Side effects: None.【F:src/world.js†L602-L604】
  - Shared state touched and where it’s used: Used in boost zone bounds and gameplay to translate lanes to offsets.【F:src/world.js†L605-L612】【F:src/gameplay.js†L1664-L1668】
  - Dependencies: `clampRoadLane`.【F:src/world.js†L602-L603】
  - Edge cases it handles or misses: Uses fallback when lane invalid.【F:src/world.js†L602-L604】
  - Performance: Constant-time.【F:src/world.js†L602-L604】
  - Units / spaces: Normalized lateral offsets (half-lane spacing).【F:src/world.js†L602-L604】
  - Determinism: Deterministic.【F:src/world.js†L602-L604】
  - Keep / change / delete: Keep; simple conversion helper.
  - Confidence / assumptions: High confidence.



- `laneToRoadRatio`
  - Purpose: Expresses a lane index as a 0–1 ratio across the road width.【F:src/world.js†L605-L607】
  - Inputs: `n` lane index, optional fallback.【F:src/world.js†L605-L606】
  - Outputs: Normalized ratio between min and max lanes.【F:src/world.js†L605-L607】
  - Side effects: None.【F:src/world.js†L605-L607】
  - Shared state touched and where it’s used: Used when computing boost lane bounds for rendering/physics.【F:src/world.js†L608-L620】
  - Dependencies: `clampRoadLane` and config lane limits.【F:src/world.js†L605-L607】
  - Edge cases it handles or misses: Assumes lane range not zero-width; relies on config consistency.【F:src/world.js†L605-L607】
  - Performance: Constant-time.【F:src/world.js†L605-L607】
  - Units / spaces: Normalized ratios.【F:src/world.js†L605-L607】
  - Determinism: Deterministic.【F:src/world.js†L605-L607】
  - Keep / change / delete: Keep; useful for UV/placement calculations.
  - Confidence / assumptions: High confidence.



- `getZoneLaneBounds`
  - Purpose: Computes clamped lane and offset bounds for a boost zone, including derived ratios.【F:src/world.js†L608-L620】
  - Inputs: `zone` object with `nStart`/`nEnd` and visibility flag.【F:src/world.js†L608-L614】
  - Outputs: Bounds object with start/end lanes, min/max lanes, center offsets, and road ratios, or `null` if invisible.【F:src/world.js†L608-L620】
  - Side effects: None.【F:src/world.js†L608-L620】
  - Shared state touched and where it’s used: Supports boost zone rendering and gameplay checks for lane limits.【F:src/world.js†L608-L620】【F:src/gameplay.js†L1205-L1217】
  - Dependencies: `clampBoostLane`, `laneToCenterOffset`, `laneToRoadRatio`.【F:src/world.js†L612-L620】
  - Edge cases it handles or misses: Returns null for invisible zones; defaults lanes when missing via fallbacks.【F:src/world.js†L608-L620】
  - Performance: Constant-time.【F:src/world.js†L608-L620】
  - Units / spaces: Lane indices, offsets, and ratios.【F:src/world.js†L608-L620】
  - Determinism: Deterministic.【F:src/world.js†L608-L620】
  - Keep / change / delete: Keep; consolidates repeated lane math.
  - Confidence / assumptions: High confidence.



- `parseBoostZoneType`
  - Purpose: Normalizes boost type tokens from CSV into configured boost type constants.【F:src/world.js†L636-L642】
  - Inputs: `raw` value (string/any).【F:src/world.js†L636-L637】
  - Outputs: Boost type constant or `null`.【F:src/world.js†L640-L642】
  - Side effects: None.【F:src/world.js†L636-L642】
  - Shared state touched and where it’s used: Used while parsing track CSV boost zones.【F:src/world.js†L381-L433】
  - Dependencies: Config `boost.types` and string normalization.【F:src/world.js†L636-L641】
  - Edge cases it handles or misses: Accepts multiple aliases; returns null on unknown tokens.【F:src/world.js†L636-L642】
  - Performance: Constant-time.【F:src/world.js†L636-L642】
  - Units / spaces: String tokens to enum values.【F:src/world.js†L636-L642】
  - Determinism: Deterministic.【F:src/world.js†L636-L642】
  - Keep / change / delete: Keep; avoids repeated token checks.
  - Confidence / assumptions: High confidence.



- `parseBoostLaneValue`
  - Purpose: Parses and clamps a numeric lane value for boost zones from CSV tokens.【F:src/world.js†L645-L653】
  - Inputs: `raw` value (string/any).【F:src/world.js†L645-L646】
  - Outputs: Clamped lane number or `null`.【F:src/world.js†L645-L653】
  - Side effects: None.【F:src/world.js†L645-L653】
  - Shared state touched and where it’s used: Used while building boost zone specs during track CSV parsing.【F:src/world.js†L381-L433】
  - Dependencies: `Number.parseFloat`, lane config bounds.【F:src/world.js†L647-L653】
  - Edge cases it handles or misses: Returns null on invalid tokens; clamps to min/max inclusive.【F:src/world.js†L645-L653】
  - Performance: Constant-time.【F:src/world.js†L645-L653】
  - Units / spaces: Lane indices.【F:src/world.js†L645-L653】
  - Determinism: Deterministic.【F:src/world.js†L645-L653】
  - Keep / change / delete: Keep; small parsing helper.
  - Confidence / assumptions: High confidence.



- `segmentAtS`
  - Purpose: Returns the segment object containing a given longitudinal distance along the looped track.【F:src/world.js†L656-L661】
  - Inputs: `s` distance along track (can be negative).【F:src/world.js†L656-L658】
  - Outputs: Segment or `null` when track invalid.【F:src/world.js†L656-L661】
  - Side effects: None.【F:src/world.js†L656-L661】
  - Shared state touched and where it’s used: Widely used by gameplay for sampling height, cliffs, collisions, etc.【F:src/world.js†L663-L670】【F:src/gameplay.js†L1681-L1684】
  - Dependencies: `segments`, `trackLength`, `segmentLength`.【F:src/world.js†L656-L660】
  - Edge cases it handles or misses: Handles wrapping for negative/overflowing `s`; returns null when no segments or non-positive length.【F:src/world.js†L656-L661】
  - Performance: Constant-time.【F:src/world.js†L656-L661】
  - Units / spaces: World S units (meters/segments).【F:src/world.js†L656-L660】
  - Determinism: Deterministic.【F:src/world.js†L656-L661】
  - Keep / change / delete: Keep; essential accessor.
  - Confidence / assumptions: High confidence.



- `elevationAt`
  - Purpose: Computes interpolated ground elevation at a longitudinal position along the track.【F:src/world.js†L663-L670】
  - Inputs: `s` distance.【F:src/world.js†L663-L667】
  - Outputs: Elevation value (Y).【F:src/world.js†L668-L670】
  - Side effects: None.【F:src/world.js†L663-L670】
  - Shared state touched and where it’s used: Used by gameplay physics for height queries and cliff sampling.【F:src/world.js†L663-L670】【F:src/gameplay.js†L1657-L1660】
  - Dependencies: `segmentAtS`, `lerp`, `segmentLength`.【F:src/world.js†L663-L670】
  - Edge cases it handles or misses: Handles negative `s` via wrapping; returns 0 when no segments or invalid length.【F:src/world.js†L663-L670】
  - Performance: Constant-time.【F:src/world.js†L663-L670】
  - Units / spaces: World Y units.【F:src/world.js†L663-L670】
  - Determinism: Deterministic.【F:src/world.js†L663-L670】
  - Keep / change / delete: Keep; core height sampler.
  - Confidence / assumptions: High confidence.



- `cliffParamsAt`
  - Purpose: Samples interpolated cliff geometry parameters for a segment at a longitudinal fraction `t`.【F:src/world.js†L673-L712】
  - Inputs: `segIndex`, optional `t` in [0,1].【F:src/world.js†L673-L691】
  - Outputs: Object with `leftA/leftB/rightA/rightB` dx/dy pairs.【F:src/world.js†L687-L712】
  - Side effects: None.【F:src/world.js†L673-L712】
  - Shared state touched and where it’s used: Feeds gameplay cliff sampling for pushback and tilt calculations.【F:src/world.js†L715-L760】【F:src/gameplay.js†L1724-L1780】
  - Dependencies: `CLIFF_SERIES`, `clamp01`, `lerp`, and `segments` length.【F:src/world.js†L673-L705】
  - Edge cases it handles or misses: Returns flat zero params when cliffs not ready or no sections; handles wrapping indices and missing samples by falling back to neighbor values.【F:src/world.js†L673-L712】
  - Performance: Constant-time.【F:src/world.js†L673-L712】
  - Units / spaces: Cliff widths/deltas in world units per section.【F:src/world.js†L673-L712】
  - Determinism: Deterministic.【F:src/world.js†L673-L712】
  - Keep / change / delete: Keep; core cliff data accessor.
  - Confidence / assumptions: High confidence; assumes `CLIFF_READY` set appropriately.
  
  
  
  - `cliffSurfaceInfoAt`
    - Purpose: Derives cliff height and slope information beyond the road edge at a sampled segment position, returning a normalized info object for downstream checks.【F:src/gameplay.js†L1724-L1801】
    - Inputs: `segIndex` — segment index being sampled; `nNorm` — normalized lateral coordinate where |n|>1 falls outside the road; `t` — longitudinal interpolation along the segment (defaults to 0).【F:src/gameplay.js†L1724-L1780】
    - Outputs: Returns an info object containing `heightOffset`, `slope`, `slopeA/B`, `coverageA/B`, and `section` flags describing the sampled cliff portions.【F:src/gameplay.js†L1724-L1801】
    - Side effects: None; allocates a new info object.【F:src/gameplay.js†L1724-L1801】
    - Shared state touched and where it’s used: Reads shared track data via `cliffParamsAt`, `segmentAtIndex`, `roadWidthAt`, and `track.roadWidth`; reused by steep-cliff detection and tilt computations.【F:src/gameplay.js†L1728-L1779】【F:src/gameplay.js†L1681-L1684】【F:src/gameplay.js†L1804-L1814】
    - Dependencies: Calls `cliffParamsAt`, `segmentAtIndex`, `roadWidthAt`, `clamp01`, and `createCliffInfo`.【F:src/gameplay.js†L1728-L1798】
    - Edge cases it handles or misses: Returns default info for in-road samples, missing params, or zero-width cliffs; assumes provided `dx`/`dy` pairs describe contiguous sections.【F:src/gameplay.js†L1725-L1799】
    - Performance: Constant-time despite several arithmetic branches.【F:src/gameplay.js†L1724-L1801】
    - Units / spaces: Uses segment S (`t`) and normalized lateral coordinates `n`, translating cliff widths/height deltas into slope ratios.【F:src/gameplay.js†L1734-L1794】
    - Determinism: Deterministic given the same cliff data.【F:src/gameplay.js†L1724-L1801】
    - Keep / change / delete: Keep; consolidates cliff sampling math (alternative would be duplicating calculations in each consumer).
    - Confidence / assumptions: Medium confidence; assumes cliff parameter objects include `left/right` sections with finite `dx`/`dy`.



- `floorElevationAt`
  
  
  
  - `cliffLateralSlopeAt`
    - Purpose: Convenience accessor that returns the aggregate lateral slope component from `cliffSurfaceInfoAt` for a given sample.【F:src/gameplay.js†L1803-L1806】
    - Inputs: `segIndex` — segment index; `nNorm` — normalized lateral coordinate; `t` — optional longitudinal interpolation.【F:src/gameplay.js†L1803-L1806】
    - Outputs: Returns the `slope` field from the computed cliff info (defaults to 0).【F:src/gameplay.js†L1803-L1806】
    - Side effects: None.【F:src/gameplay.js†L1803-L1806】
    - Shared state touched and where it’s used: Delegates to `cliffSurfaceInfoAt`; consumed by `applyCliffPushForce` when applying lateral push-back near cliffs.【F:src/gameplay.js†L1803-L1806】【F:src/gameplay.js†L1869-L1878】
    - Dependencies: Calls `cliffSurfaceInfoAt`.【F:src/gameplay.js†L1803-L1805】
    - Edge cases it handles or misses: Inherits `cliffSurfaceInfoAt`’s handling; no additional guards.【F:src/gameplay.js†L1803-L1806】
    - Performance: Constant-time.【F:src/gameplay.js†L1803-L1806】
    - Units / spaces: Returns slope ratios derived from cliff geometry.【F:src/gameplay.js†L1803-L1806】
    - Determinism: Deterministic.【F:src/gameplay.js†L1803-L1806】
    - Keep / change / delete: Keep; keeps push-force code succinct (alternative is inlining the info lookup).
    - Confidence / assumptions: High confidence; assumes cliff info helpers stay stable.

### 3.7 Rendering & Camera Systems (`src/render.js`)



- `areTexturesEnabled`
  - Purpose: Switches rendering between textured and debug-solid output depending on the global debug configuration so tests and wireframe modes can override the usual art pipeline.【F:src/render.js†L8-L67】
  - Inputs: None; reads `Config.debug.mode` and `Config.debug.textures` flags where `mode` is expected to be `'off'` during normal play and `textures` can force-disable artwork.【F:src/render.js†L8-L67】
  - Outputs: Boolean indicating whether textures should be sampled (`true`) or replaced with debug colors (`false`).【F:src/render.js†L61-L67】
  - Side effects: None; pure read from config.【F:src/render.js†L61-L67】
  - Shared state touched and where it’s used: Reads the shared `debug` config object; consulted by `computePlayerSpriteSamples` and each major draw routine before choosing textured vs. solid rendering (`src/render.js:202-205`, `748-930`, `1551-1678`).【F:src/render.js†L202-L205】【F:src/render.js†L748-L930】【F:src/render.js†L1551-L1678】
  - Dependencies: None beyond configuration constants.【F:src/render.js†L8-L67】
  - Edge cases handled or missed: Treats any debug mode other than `'off'` or an explicit `debug.textures === false` as a hard disable for textures; does not expose per-feature toggles.【F:src/render.js†L61-L67】
  - Performance: Constant-time check used in multiple per-frame paths but trivial in cost.【F:src/render.js†L61-L67】
  - Units / spaces: Boolean flag only.【F:src/render.js†L61-L67】
  - Determinism: Deterministic for a fixed debug configuration.【F:src/render.js†L61-L67】
  - Keep / change / delete: Keep; concise helper centralizes the debug toggle—alternative would be repeating the condition in every caller.【F:src/render.js†L202-L205】【F:src/render.js†L748-L930】
  - Confidence / assumptions: High confidence; assumes the config globals are initialized before rendering begins.【F:src/render.js†L8-L67】



- `randomColorFor`
  - Purpose: Provides deterministic fallback RGBA colors per identifier so debug rendering remains readable when textures are disabled.【F:src/render.js†L84-L140】
  - Inputs: `key` (string or falsy) naming the element; falsy keys map to `'default'`. Any string is accepted.【F:src/render.js†L135-L138】
  - Outputs: Cached four-component color array with components in `[0,1]`.【F:src/render.js†L133-L139】
  - Side effects: Lazily seeds and populates a `Map` cache keyed by identifier; subsequent calls reuse stored arrays.【F:src/render.js†L84-L139】
  - Shared state touched and where it’s used: Uses a closure-local cache; invoked by numerous draw helpers to tint roads, cliffs, rails, billboards, boost zones, and the player shadow when textures are unavailable (`src/render.js:752-1766`).【F:src/render.js†L752-L1766】
  - Dependencies: Calls the inner `makeColor` helper, which itself draws random numbers from `mulberry32` and clamps HSV components.【F:src/render.js†L84-L139】【F:src/render.js†L473-L500】
  - Edge cases handled or missed: Handles unknown keys by generating a fresh color; no eviction policy so cache grows with unique keys.【F:src/render.js†L135-L139】
  - Performance: Constant-time lookup/generation with light math; only exercised when debug solid colors are needed.【F:src/render.js†L84-L139】
  - Units / spaces: Colors expressed in normalized RGBA.【F:src/render.js†L133-L139】
  - Determinism: Deterministic for a given key thanks to the seeded PRNG and cached results.【F:src/render.js†L84-L139】
  - Keep / change / delete: Keep; avoids duplicating seeded random color logic—alternative would be a static palette table.【F:src/render.js†L84-L139】
  - Confidence / assumptions: High confidence; assumes `mulberry32` remains stable for reproducible hues.【F:src/render.js†L473-L500】



- `makeColor`
  - Purpose: Internal helper within `randomColorFor` that converts seeded random HSV samples into a normalized RGBA array for debug fills.【F:src/render.js†L87-L134】
  - Inputs: None directly; pulls random values from the closure-scoped PRNG and clamps them into valid hue/saturation/value ranges.【F:src/render.js†L87-L133】
  - Outputs: Array `[r,g,b,1]` representing the generated debug color.【F:src/render.js†L133-L134】
  - Side effects: None beyond returning a new array; mutation occurs when `randomColorFor` stores the result.【F:src/render.js†L87-L139】
  - Shared state touched and where it’s used: Only called from `randomColorFor`; no external call sites.【F:src/render.js†L84-L139】
  - Dependencies: Uses `clamp` and the closure PRNG `rng` seeded via `mulberry32`.【F:src/render.js†L87-L101】【F:src/render.js†L473-L500】
  - Edge cases handled or missed: Wraps hue into six sectors and defaults alpha to `1`; does not attempt gamma correction or pastel palettes.【F:src/render.js†L87-L134】
  - Performance: Constant arithmetic executed once per uncached key.【F:src/render.js†L87-L134】
  - Units / spaces: Outputs linear RGBA components in `[0,1]`.【F:src/render.js†L133-L134】
  - Determinism: Deterministic because it consumes a deterministic RNG sequence.【F:src/render.js†L87-L134】
  - Keep / change / delete: Keep; scoped helper keeps HSV→RGB math localized—alternative is to inline the conversion inside `randomColorFor`.【F:src/render.js†L84-L139】
  - Confidence / assumptions: High confidence; assumes seeded RNG coverage is adequate for visually distinct hues.【F:src/render.js†L87-L134】



- `applyDeadzone`
  - Purpose: Normalizes analog-style inputs by removing a configurable deadzone so minor noise does not influence sprite steering or tilt.【F:src/render.js†L142-L151】
  - Inputs: `value` (float typically in `[-1,1]`) and optional `deadzone` (0–0.99). Non-finite inputs are tolerated but clamped.【F:src/render.js†L142-L150】
  - Outputs: Adjusted, clamped value within `[-1,1]` after deadzone removal.【F:src/render.js†L146-L150】
  - Side effects: None.【F:src/render.js†L142-L151】
  - Shared state touched and where it’s used: Pure helper used when deriving player sprite steering and height blends in `computePlayerSpriteSamples` (`src/render.js:241-253`).【F:src/render.js†L241-L253】
  - Dependencies: Depends on `clamp` for bounding values.【F:src/render.js†L150-L150】
  - Edge cases handled or missed: Caps deadzone to `<1`, avoids division by zero, and returns zero when the adjusted range collapses.【F:src/render.js†L143-L149】
  - Performance: Constant-time arithmetic invoked each frame for the player sprite only.【F:src/render.js†L142-L151】【F:src/render.js†L241-L253】
  - Units / spaces: Dimensionless normalized input values.【F:src/render.js†L142-L151】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L142-L151】
  - Keep / change / delete: Keep; shared helper prevents repeating clamping math—alternative would be inline logic per call site.【F:src/render.js†L241-L253】
  - Confidence / assumptions: High confidence; assumes callers pass reasonable normalized inputs.【F:src/render.js†L241-L253】



- `smoothTowards`
  - Purpose: Applies critically damped smoothing toward a target using an exponential decay constant so sprite pose changes ease instead of snapping.【F:src/render.js†L153-L159】
  - Inputs: `current`, `target` (numbers), `dt` (seconds, >0), `timeConstant` (seconds, >0). Non-positive or non-finite values cause immediate target snaps.【F:src/render.js†L153-L158】
  - Outputs: New smoothed value between `current` and `target`.【F:src/render.js†L156-L158】
  - Side effects: None.【F:src/render.js†L153-L159】
  - Shared state touched and where it’s used: Used by `computePlayerSpriteSamples` to ease the player sprite’s steer and height blend factors over time (`src/render.js:260-271`).【F:src/render.js†L260-L271】
  - Dependencies: Uses `Math.exp` and `clamp` for stability.【F:src/render.js†L156-L158】
  - Edge cases handled or missed: Early-outs when the time constant or `dt` are invalid; doesn’t guard against extremely large `dt` beyond exponential behavior.【F:src/render.js†L153-L158】
  - Performance: Constant-time math executed twice per frame for the player sprite.【F:src/render.js†L153-L158】【F:src/render.js†L260-L271】
  - Units / spaces: Inputs and outputs share the caller’s unit (normalized pose values). Time constant and `dt` measured in seconds.【F:src/render.js†L153-L158】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L153-L159】
  - Keep / change / delete: Keep; compact smoothing helper avoids repeated exponential logic.【F:src/render.js†L260-L271】
  - Confidence / assumptions: High confidence; assumes frame `dt` remains small for accurate smoothing.【F:src/render.js†L260-L271】



- `atlasUvFromRowCol`
  - Purpose: Converts atlas grid coordinates into normalized UV corners so sprites sample the correct tile during rendering.【F:src/render.js†L161-L170】
  - Inputs: `row`, `col`, `columns`, `rows` (integers ≥1). Non-integer inputs are floored and clamped.【F:src/render.js†L161-L169】
  - Outputs: Object containing four UV pairs (`u1`…`v4`) defining the tile quadrilateral.【F:src/render.js†L166-L170】
  - Side effects: None.【F:src/render.js†L161-L170】
  - Shared state touched and where it’s used: Used by player sprite sampling and cliff rendering to derive per-frame UVs (`src/render.js:187-188`, `1717-1719`).【F:src/render.js†L187-L188】【F:src/render.js†L1717-L1719】
  - Dependencies: Requires `clamp` helper from `MathUtil`.【F:src/render.js†L164-L169】
  - Edge cases handled or missed: Ensures at least one column/row; does not handle atlases with padding or rotation.【F:src/render.js†L161-L170】
  - Performance: Constant-time arithmetic; invoked for each sampled tile.【F:src/render.js†L161-L170】
  - Units / spaces: Outputs normalized UV coordinates in `[0,1]`.【F:src/render.js†L166-L170】
  - Determinism: Deterministic for given indices.【F:src/render.js†L161-L170】
  - Keep / change / delete: Keep; reusable helper avoids copy/pasted UV math.【F:src/render.js†L161-L170】
  - Confidence / assumptions: High confidence; assumes atlases form uniform grids.【F:src/render.js†L161-L170】



- `computePlayerAtlasSamples`
  - Purpose: Maps smoothed steering and height values onto discrete atlas tiles for the player sprite, currently returning a single weighted sample.【F:src/render.js†L173-L188】
  - Inputs: `steerValue`, `heightValue` (normalized -1..1), `columns`, `rows` (integers ≥1).【F:src/render.js†L173-L188】
  - Outputs: Array of sample descriptors `{ col, row, weight, uv }` for use by sprite blending (currently length 1).【F:src/render.js†L183-L188】
  - Side effects: None.【F:src/render.js†L173-L189】
  - Shared state touched and where it’s used: Called by `computePlayerSpriteSamples` to translate pose into atlas coordinates (`src/render.js:279`).【F:src/render.js†L279-L288】
  - Dependencies: Uses `atlasUvFromRowCol` for UV math.【F:src/render.js†L187-L188】
  - Edge cases handled or missed: Clamps values into range and supports degenerate 1×1 atlases; does not yet support multi-sample blending beyond single tile.【F:src/render.js†L173-L188】
  - Performance: Constant-time; invoked once per frame for the player sprite.【F:src/render.js†L173-L189】
  - Units / spaces: Works in normalized pose space and returns UV coordinates.【F:src/render.js†L173-L188】
  - Determinism: Deterministic for identical inputs.【F:src/render.js†L173-L188】
  - Keep / change / delete: Keep; structured return enables future multi-tile blending without refactoring.【F:src/render.js†L173-L189】
  - Confidence / assumptions: High confidence; assumes atlas metadata is accurate.【F:src/render.js†L173-L188】



- `computePlayerSpriteSamples`
  - Purpose: Produces the animated player sprite description (texture, pose blend values, UV samples) based on physics, input, and terrain so the renderer can draw the bike/car avatar.【F:src/render.js†L191-L289】
  - Inputs: `frame` (current frame payload with `phys` data) and `meta` (sprite metadata providing `tex` and atlas info).【F:src/render.js†L191-L215】
  - Outputs: Object `{ texture, columns, rows, steer, height, samples }` or `null` when textures or metadata are unavailable.【F:src/render.js†L207-L288】
  - Side effects: Updates `playerSpriteBlendState` (steer, height, timestamps) to smooth across frames.【F:src/render.js†L193-L275】
  - Shared state touched and where it’s used: Reads global `state` for physics, inputs, and drift state; called during player enqueue when building the draw list (`src/render.js:1353-1365`).【F:src/render.js†L191-L288】【F:src/render.js†L1353-L1365】
  - Dependencies: Uses `areTexturesEnabled`, `applyDeadzone`, `smoothTowards`, `segmentAtS`, `groundProfileAt`, and `computePlayerAtlasSamples`.【F:src/render.js†L202-L279】
  - Edge cases handled or missed: Bails out when textures disabled, metadata missing, texture loader returns null, or slope data unavailable; clamps steering for non-drift states; doesn’t attempt fallback sprites when textures missing.【F:src/render.js†L197-L278】
  - Performance: Runs once per frame with modest math and a few helper calls; dominant cost is reading world data.【F:src/render.js†L191-L288】
  - Units / spaces: Uses world-speed (`phys.vtan`), normalized steering/height values, segment curvature, and atlas coordinates.【F:src/render.js†L217-L279】
  - Determinism: Deterministic given identical physics/input history (relies on monotonic `state.phys.t`).【F:src/render.js†L191-L289】
  - Keep / change / delete: Keep; encapsulates complex blending logic—alternative would be scattering pose math through the render loop.【F:src/render.js†L1353-L1365】
  - Confidence / assumptions: Medium confidence; assumes metadata supplies `tex()` and atlas parameters and that physics state stays finite.【F:src/render.js†L207-L215】



- `createPerfTracker`
  - Purpose: Builds the instrumentation object that records per-frame rendering statistics for debugging overlays and performance monitoring.【F:src/render.js†L291-L412】
  - Inputs: None directly; captures helper `makeFrameStats` within closure.【F:src/render.js†L291-L412】
  - Outputs: Tracker object exposing methods like `beginFrame`, `registerSprite`, and `getLastFrameStats`.【F:src/render.js†L318-L409】
  - Side effects: Instantiates mutable `stats` objects that persist across frames.【F:src/render.js†L310-L317】
  - Shared state touched and where it’s used: Assigned to the module-global `perf` and used throughout the renderer for instrumentation (`src/render.js:414`, `1078-2118`).【F:src/render.js†L414-L415】【F:src/render.js†L1078-L2118】
  - Dependencies: Relies on local helper `makeFrameStats`; methods call through to renderer wrappers and count functions.【F:src/render.js†L291-L409】
  - Edge cases handled or missed: Initializes FPS/frame-time smoothing when valid `dt` values arrive; does not guard against external mutation of returned stats object.【F:src/render.js†L320-L335】
  - Performance: Lightweight bookkeeping executed once per frame plus per-draw invocations.【F:src/render.js†L320-L409】
  - Units / spaces: Tracks counts and milliseconds.【F:src/render.js†L320-L335】【F:src/render.js†L364-L407】
  - Determinism: Deterministic aside from floating-point smoothing dependent on real frame times.【F:src/render.js†L320-L335】
  - Keep / change / delete: Keep; centralizes perf tracking so overlays can consume consistent metrics.【F:src/render.js†L1972-L1998】
  - Confidence / assumptions: High confidence; assumes renderer methods exist to wrap.【F:src/render.js†L336-L354】



- `makeFrameStats`
  - Purpose: Factory returning a blank statistics object for the perf tracker so per-frame counters start from zero.【F:src/render.js†L291-L309】
  - Inputs: None.【F:src/render.js†L291-L309】
  - Outputs: Object with draw counters, sprite tallies, physics step counts, etc.【F:src/render.js†L292-L308】
  - Side effects: None; pure object creation.【F:src/render.js†L292-L309】
  - Shared state touched and where it’s used: Used exclusively by `createPerfTracker` to reset `stats.current` and initialize `stats.last`.【F:src/render.js†L291-L335】
  - Dependencies: None.【F:src/render.js†L292-L309】
  - Edge cases handled or missed: Initializes every tracked field to zero; no dynamic sizing.【F:src/render.js†L292-L309】
  - Performance: Constant-time allocation on frame reset.【F:src/render.js†L320-L334】
  - Units / spaces: Numeric counts and milliseconds placeholders.【F:src/render.js†L292-L309】
  - Determinism: Deterministic object literal.【F:src/render.js†L292-L309】
  - Keep / change / delete: Keep; keeps tracker reset logic concise.【F:src/render.js†L320-L334】
  - Confidence / assumptions: High confidence; assumes tracked counters align with overlay expectations.【F:src/render.js†L1972-L1998】



- `beginFrame`
  - Purpose: Resets current perf counters and updates smoothed FPS/frame-time metrics at the start of each frame.【F:src/render.js†L318-L333】
  - Inputs: `dt` (seconds since last frame, should be positive).【F:src/render.js†L320-L329】
  - Outputs: None; mutates tracker state.【F:src/render.js†L320-L333】
  - Side effects: Clears `stats.current`, resets solid-depth stack, and updates `stats.fps`/`stats.frameTimeMs` using exponential smoothing.【F:src/render.js†L320-L330】
  - Shared state touched and where it’s used: Called from the main loop before rendering to prep instrumentation (`src/render.js:2110-2118`).【F:src/render.js†L2110-L2118】
  - Dependencies: Relies on `makeFrameStats` and numeric checks.【F:src/render.js†L318-L333】
  - Edge cases handled or missed: Ignores invalid or non-positive `dt` values, leaving smoothed metrics unchanged.【F:src/render.js†L322-L329】
  - Performance: Constant-time housekeeping per frame.【F:src/render.js†L320-L333】
  - Units / spaces: `dt` in seconds; `frameTimeMs` stored in milliseconds.【F:src/render.js†L320-L329】
  - Determinism: Depends on measured `dt`; otherwise deterministic.【F:src/render.js†L320-L333】
  - Keep / change / delete: Keep; essential for accurate counters—alternative would be manual resets in the main loop.【F:src/render.js†L2110-L2118】
  - Confidence / assumptions: High confidence; assumes `dt` from the main loop is finite.【F:src/render.js†L2110-L2118】



- `endFrame`
  - Purpose: Captures the finished frame’s counters into `stats.last` so overlays can display the most recent metrics.【F:src/render.js†L333-L335】
  - Inputs: None.【F:src/render.js†L333-L335】
  - Outputs: None; copies state.【F:src/render.js†L333-L335】
  - Side effects: Spreads `stats.current` into `stats.last` for stable reporting.【F:src/render.js†L333-L335】
  - Shared state touched and where it’s used: Called after each frame’s draw completes before the loop yields (`src/render.js:2121-2124`).【F:src/render.js†L2121-L2124】
  - Dependencies: None.【F:src/render.js†L333-L335】
  - Edge cases handled or missed: None; shallow copy suffices because counters are primitives.【F:src/render.js†L333-L335】
  - Performance: Constant-time object spread.【F:src/render.js†L333-L335】
  - Units / spaces: N/A beyond recorded counters.【F:src/render.js†L333-L335】
  - Determinism: Deterministic.【F:src/render.js†L333-L335】
  - Keep / change / delete: Keep; provides stable snapshot for overlays.【F:src/render.js†L1972-L1998】
  - Confidence / assumptions: High confidence; assumes `stats.current` holds the current frame counts.【F:src/render.js†L333-L335】



- `wrapRenderer`
  - Purpose: Monkey-patches the GL renderer’s quad draw methods so perf tracking counts solids/textured draws automatically.【F:src/render.js†L336-L354】
  - Inputs: `renderer` (RenderGL instance). Must not be previously wrapped.【F:src/render.js†L336-L344】
  - Outputs: None; mutates the renderer object in place.【F:src/render.js†L336-L354】
  - Side effects: Replaces `drawQuadTextured`/`drawQuadSolid` with wrappers that increment counters and manage the solid-depth stack, tagging the renderer as wrapped via `__perfWrapped`.【F:src/render.js†L336-L354】
  - Shared state touched and where it’s used: Called once when bootstrapping the renderer to enable perf instrumentation (`src/render.js:2079-2083`).【F:src/render.js†L2079-L2083】
  - Dependencies: Relies on tracker methods (`isSolidActive`, `countDrawCall`, `markSolidStart`, `markSolidEnd`).【F:src/render.js†L340-L351】
  - Edge cases handled or missed: No-ops when renderer missing or already wrapped; does not unwrap if renderer methods change later.【F:src/render.js†L336-L354】
  - Performance: Adds minimal overhead per draw call via wrapper closures.【F:src/render.js†L340-L351】
  - Units / spaces: N/A.【F:src/render.js†L336-L354】
  - Determinism: Deterministic instrumentation; does not alter draw order.【F:src/render.js†L336-L354】
  - Keep / change / delete: Keep; provides centralized instrumentation—alternative is to sprinkle counter increments around call sites.【F:src/render.js†L2079-L2083】
  - Confidence / assumptions: High confidence; assumes renderer exposes `drawQuadTextured`/`drawQuadSolid` methods.【F:src/render.js†L336-L347】



- `markSolidStart`
  - Purpose: Tracks entry into solid-draw sections so textured wrappers know when they should count draws as solid.【F:src/render.js†L345-L359】
  - Inputs: None.【F:src/render.js†L355-L359】
  - Outputs: None; increments counter.【F:src/render.js†L355-L359】
  - Side effects: Increments `stats.solidDepth`, effectively acting as a stack depth indicator.【F:src/render.js†L355-L359】
  - Shared state touched and where it’s used: Invoked by the `drawQuadSolid` wrapper when perf instrumentation surrounds solid draws (`src/render.js:346-351`).【F:src/render.js†L345-L351】
  - Dependencies: None.【F:src/render.js†L355-L359】
  - Edge cases handled or missed: None beyond ensuring depth increments by one; no overflow guard (depth expected small).【F:src/render.js†L355-L359】
  - Performance: Constant increment per solid draw.【F:src/render.js†L355-L359】
  - Units / spaces: Counter depth only.【F:src/render.js†L355-L359】
  - Determinism: Deterministic.【F:src/render.js†L355-L359】
  - Keep / change / delete: Keep; required for nested solid draws to be tracked accurately.【F:src/render.js†L345-L351】
  - Confidence / assumptions: High confidence; assumes wrappers call start/end in pairs.【F:src/render.js†L345-L351】



- `markSolidEnd`
  - Purpose: Balances `markSolidStart` by decrementing the solid-depth counter after a solid quad draw completes.【F:src/render.js†L346-L359】
  - Inputs: None.【F:src/render.js†L358-L359】
  - Outputs: None.【F:src/render.js†L358-L359】
  - Side effects: Decrements depth but never below zero to recover from mismatched calls.【F:src/render.js†L358-L359】
  - Shared state touched and where it’s used: Called in a `finally` block inside the solid draw wrapper to guarantee balance (`src/render.js:345-351`).【F:src/render.js†L345-L351】
  - Dependencies: None.【F:src/render.js†L358-L359】
  - Edge cases handled or missed: Clamps negative depth to zero; doesn’t warn on imbalance.【F:src/render.js†L358-L359】
  - Performance: Constant decrement per solid draw.【F:src/render.js†L358-L359】
  - Units / spaces: Counter depth only.【F:src/render.js†L358-L359】
  - Determinism: Deterministic.【F:src/render.js†L358-L359】
  - Keep / change / delete: Keep; ensures instrumentation accuracy.【F:src/render.js†L345-L351】
  - Confidence / assumptions: High confidence; assumes wrappers always invoke it via `finally`.【F:src/render.js†L345-L351】



- `isSolidActive`
  - Purpose: Reports whether the perf tracker is currently inside a solid draw block so textured draw wrappers can treat white-textured quads as solids.【F:src/render.js†L340-L363】
  - Inputs: None.【F:src/render.js†L361-L363】
  - Outputs: Boolean `stats.solidDepth > 0`.【F:src/render.js†L361-L363】
  - Side effects: None.【F:src/render.js†L361-L363】
  - Shared state touched and where it’s used: Called by the wrapped `drawQuadTextured` to determine solid counting rules (`src/render.js:341-343`).【F:src/render.js†L341-L343】
  - Dependencies: Relies on `stats.solidDepth` maintained by start/end methods.【F:src/render.js†L355-L363】
  - Edge cases handled or missed: None.【F:src/render.js†L361-L363】
  - Performance: Constant check per draw call.【F:src/render.js†L341-L343】
  - Units / spaces: Boolean flag.【F:src/render.js†L361-L363】
  - Determinism: Deterministic.【F:src/render.js†L361-L363】
  - Keep / change / delete: Keep; needed for accurate solid counts.【F:src/render.js†L341-L343】
  - Confidence / assumptions: High confidence; assumes wrappers maintain depth correctly.【F:src/render.js†L345-L359】



- `countDrawCall`
  - Purpose: Increments aggregated draw counters and splits them into solid vs. textured categories for diagnostics.【F:src/render.js†L364-L371】
  - Inputs: Optional `{ solid }` flag indicating whether to count as solid (`true`) or textured (`false`).【F:src/render.js†L364-L370】
  - Outputs: None; mutates counters.【F:src/render.js†L364-L371】
  - Side effects: Increases `drawCalls`, `quadCount`, and appropriate subtype counter each invocation.【F:src/render.js†L364-L370】
  - Shared state touched and where it’s used: Called from the wrapped draw methods for every quad issued (`src/render.js:342-343`).【F:src/render.js†L342-L343】
  - Dependencies: None beyond tracker state.【F:src/render.js†L364-L371】
  - Edge cases handled or missed: Defaults to textured counts when `solid` falsy; no guard against overflow (counts expected to remain within safe integer range).【F:src/render.js†L364-L371】
  - Performance: Constant-time increments executed per draw call.【F:src/render.js†L342-L371】
  - Units / spaces: Integer counters.【F:src/render.js†L364-L371】
  - Determinism: Deterministic given draw sequence.【F:src/render.js†L364-L371】
  - Keep / change / delete: Keep; centralizes stats increments.【F:src/render.js†L342-L371】
  - Confidence / assumptions: High confidence; assumes draws remain manageable in count.【F:src/render.js†L364-L371】



- `registerDrawListSize`
  - Purpose: Records the number of items in the world draw list so perf overlays can report batching sizes.【F:src/render.js†L373-L375】
  - Inputs: `size` (numeric, expected ≥0).【F:src/render.js†L373-L375】
  - Outputs: None.【F:src/render.js†L373-L375】
  - Side effects: Stores sanitized size into `stats.current.drawListSize`.【F:src/render.js†L373-L375】
  - Shared state touched and where it’s used: Called after building the draw list before rendering (`src/render.js:1373-1376`).【F:src/render.js†L1373-L1376】
  - Dependencies: Uses `Number.isFinite` check via inline expression.【F:src/render.js†L373-L375】
  - Edge cases handled or missed: Defaults to zero when size invalid; no upper-bound clamp.【F:src/render.js†L373-L375】
  - Performance: Constant assignment per frame.【F:src/render.js†L373-L375】
  - Units / spaces: Count of queued draw entries.【F:src/render.js†L373-L375】
  - Determinism: Deterministic.【F:src/render.js†L373-L375】
  - Keep / change / delete: Keep; simpler than recomputing size when overlay reads stats.【F:src/render.js†L1373-L1376】
  - Confidence / assumptions: High confidence; assumes draw list length is finite.【F:src/render.js†L1373-L1376】



- `registerStrip`
  - Purpose: Counts how many road strips were enqueued for the current frame, aiding breakdown of geometry work.【F:src/render.js†L376-L378】
  - Inputs: None.【F:src/render.js†L376-L378】
  - Outputs: None; increments `stripCount`.【F:src/render.js†L376-L378】
  - Side effects: Increments counter per strip.【F:src/render.js†L376-L378】
  - Shared state touched and where it’s used: Called while iterating draw list entries (`src/render.js:1376-1388`).【F:src/render.js†L1376-L1388】
  - Dependencies: None.【F:src/render.js†L376-L378】
  - Edge cases handled or missed: None.【F:src/render.js†L376-L378】
  - Performance: Constant increment per strip.【F:src/render.js†L1376-L1388】
  - Units / spaces: Count of strip entries.【F:src/render.js†L376-L378】
  - Determinism: Deterministic.【F:src/render.js†L376-L378】
  - Keep / change / delete: Keep; gives visibility into ground geometry workload.【F:src/render.js†L1376-L1388】
  - Confidence / assumptions: High confidence; assumes loop calls it appropriately.【F:src/render.js†L1376-L1388】



- `registerSprite`
  - Purpose: Tracks how many sprites of each category (npc/prop/player) were enqueued to inform debugging overlays.【F:src/render.js†L379-L384】
  - Inputs: `kind` string `'npc'`, `'prop'`, `'player'`, or other.【F:src/render.js†L379-L383】
  - Outputs: None.【F:src/render.js†L379-L384】
  - Side effects: Increments `spriteCount` and specific sub-counter matching the kind.【F:src/render.js†L379-L384】
  - Shared state touched and where it’s used: Called while queuing world draw items (`src/render.js:1380-1425`).【F:src/render.js†L1380-L1425】
  - Dependencies: None.【F:src/render.js†L379-L384】
  - Edge cases handled or missed: Unrecognized kinds only increment total count; no validation errors.【F:src/render.js†L379-L384】
  - Performance: Constant increment per sprite.【F:src/render.js†L1380-L1425】
  - Units / spaces: Sprite counts.【F:src/render.js†L379-L384】
  - Determinism: Deterministic.【F:src/render.js†L379-L384】
  - Keep / change / delete: Keep; supports overlay breakdowns.【F:src/render.js†L1972-L1998】
  - Confidence / assumptions: High confidence; assumes kind strings follow expected values.【F:src/render.js†L1380-L1425】



- `registerSnowScreen`
  - Purpose: Tallies how many snow-screen quads are submitted each frame.【F:src/render.js†L385-L387】
  - Inputs: None.【F:src/render.js†L385-L387】
  - Outputs: None.【F:src/render.js†L385-L387】
  - Side effects: Increments `snowScreenCount`.【F:src/render.js†L385-L387】
  - Shared state touched and where it’s used: Called when enqueuing the snow overlay entry (`src/render.js:1422-1425`).【F:src/render.js†L1422-L1425】
  - Dependencies: None.【F:src/render.js†L385-L387】
  - Edge cases handled or missed: None.【F:src/render.js†L385-L387】
  - Performance: Constant increment per frame when snow enabled.【F:src/render.js†L385-L387】
  - Units / spaces: Count value.【F:src/render.js†L385-L387】
  - Determinism: Deterministic.【F:src/render.js†L385-L387】
  - Keep / change / delete: Keep; necessary for overlay reporting.【F:src/render.js†L1972-L1998】
  - Confidence / assumptions: High confidence; assumes snow overlay uses this registration path.【F:src/render.js†L1422-L1425】



- `registerSnowQuad`
  - Purpose: Counts individual snow flakes/quads rendered inside the snow-screen pass for performance insight.【F:src/render.js†L388-L390】
  - Inputs: None.【F:src/render.js†L388-L390】
  - Outputs: None.【F:src/render.js†L388-L390】
  - Side effects: Increments `snowQuadCount`.【F:src/render.js†L388-L390】
  - Shared state touched and where it’s used: Called inside the snow rendering loop for each flake (`src/render.js:1521-1535`).【F:src/render.js†L1521-L1535】
  - Dependencies: None.【F:src/render.js†L388-L390】
  - Edge cases handled or missed: None.【F:src/render.js†L388-L390】
  - Performance: Constant increment per flake; negligible overhead vs. draw call cost.【F:src/render.js†L1521-L1535】
  - Units / spaces: Count.【F:src/render.js†L388-L390】
  - Determinism: Deterministic given same snow field iteration.【F:src/render.js†L388-L390】
  - Keep / change / delete: Keep; provides granular snow perf insight.【F:src/render.js†L1521-L1535】
  - Confidence / assumptions: High confidence; assumes snow renderer calls it for each quad.【F:src/render.js†L1521-L1535】



- `registerBoostQuad`
  - Purpose: Tracks how many boost zone quads render per frame for overlay metrics.【F:src/render.js†L391-L393】
  - Inputs: None.【F:src/render.js†L391-L393】
  - Outputs: None.【F:src/render.js†L391-L393】
  - Side effects: Increments `boostQuadCount`.【F:src/render.js†L391-L393】
  - Shared state touched and where it’s used: Called while drawing zone overlays on road strips (`src/render.js:873-887`).【F:src/render.js†L873-L887】
  - Dependencies: None.【F:src/render.js†L391-L393】
  - Edge cases handled or missed: None.【F:src/render.js†L391-L393】
  - Performance: Constant increment per boost quad.【F:src/render.js†L873-L887】
  - Units / spaces: Count.【F:src/render.js†L391-L393】
  - Determinism: Deterministic.【F:src/render.js†L391-L393】
  - Keep / change / delete: Keep; surfaces boost rendering cost.【F:src/render.js†L873-L887】
  - Confidence / assumptions: High confidence; assumes draw routine calls it per quad.【F:src/render.js†L873-L887】



- `registerPhysicsSteps`
  - Purpose: Aggregates how many fixed-physics steps executed during the frame so perf overlays can show simulation load.【F:src/render.js†L394-L397】
  - Inputs: `count` (integer ≥0).【F:src/render.js†L394-L396】
  - Outputs: None.【F:src/render.js†L394-L397】
  - Side effects: Adds `count` to `stats.current.physicsSteps` if the value is finite and positive.【F:src/render.js†L394-L397】
  - Shared state touched and where it’s used: Called from the main loop after stepping gameplay (`src/render.js:2118-2120`).【F:src/render.js†L2118-L2120】
  - Dependencies: Numeric checks only.【F:src/render.js†L394-L397】
  - Edge cases handled or missed: Ignores non-finite or non-positive counts; does not clamp large totals.【F:src/render.js†L394-L397】
  - Performance: Constant addition per frame.【F:src/render.js†L394-L397】
  - Units / spaces: Count of physics iterations.【F:src/render.js†L394-L397】
  - Determinism: Deterministic.【F:src/render.js†L394-L397】
  - Keep / change / delete: Keep; useful for diagnosing variable-step catch-up work.【F:src/render.js†L2118-L2120】
  - Confidence / assumptions: High confidence; assumes main loop passes accurate counts.【F:src/render.js†L2118-L2120】



- `registerSegment`
  - Purpose: Tracks how many road segments were processed while building the draw list, providing visibility into horizon depth.【F:src/render.js†L399-L401】
  - Inputs: None.【F:src/render.js†L399-L401】
  - Outputs: None; increments `segments`.【F:src/render.js†L399-L401】
  - Side effects: Increments counter per segment.【F:src/render.js†L399-L401】
  - Shared state touched and where it’s used: Called once per segment while assembling strips (`src/render.js:1078-1110`).【F:src/render.js†L1078-L1110】
  - Dependencies: None.【F:src/render.js†L399-L401】
  - Edge cases handled or missed: None.【F:src/render.js†L399-L401】
  - Performance: Constant increment per segment.【F:src/render.js†L399-L401】
  - Units / spaces: Segment count.【F:src/render.js†L399-L401】
  - Determinism: Deterministic.【F:src/render.js†L399-L401】
  - Keep / change / delete: Keep; enables overlays to display how much of the road is being drawn.【F:src/render.js†L1078-L1110】
  - Confidence / assumptions: High confidence; assumes build loop calls it each iteration.【F:src/render.js†L1078-L1110】



- `getLastFrameStats`
  - Purpose: Returns the most recent perf snapshot (FPS, frame time, and draw counters) for overlays and debugging panels.【F:src/render.js†L402-L407】
  - Inputs: None.【F:src/render.js†L402-L407】
  - Outputs: Object containing `fps`, `frameTimeMs`, and the `stats.last` counters.【F:src/render.js†L402-L407】
  - Side effects: None; returns a shallow copy with derived FPS values.【F:src/render.js†L402-L407】
  - Shared state touched and where it’s used: Called by `computeDebugPanels` to populate the HUD overlay (`src/render.js:1972-1998`).【F:src/render.js†L1972-L1998】
  - Dependencies: None.【F:src/render.js†L402-L407】
  - Edge cases handled or missed: Returns zeros until `endFrame` has populated `stats.last`; does not freeze values between reads.【F:src/render.js†L333-L407】
  - Performance: Constant-time object assembly.【F:src/render.js†L402-L407】
  - Units / spaces: FPS (frames per second), frame time in milliseconds, plus raw counts.【F:src/render.js†L402-L407】
  - Determinism: Deterministic for a given tracker state.【F:src/render.js†L402-L407】
  - Keep / change / delete: Keep; single accessor for overlays—alternative is to expose `stats` directly, risking mutation.【F:src/render.js†L1972-L1998】
  - Confidence / assumptions: High confidence; assumes `endFrame` ran previously.【F:src/render.js†L333-L407】



- `isSnowFeatureEnabled`
  - Purpose: Determines whether the snow-screen effect should run by consulting the app’s snow toggle and defaulting to enabled when the toggle is missing so snowy segments always draw.【F:src/render.js†L416-L427】
  - Inputs: None.【F:src/render.js†L416-L427】
  - Outputs: Boolean flag indicating whether snow rendering stays active (defaults to `true`).【F:src/render.js†L416-L427】
  - Side effects: Logs a console warning if the app hook throws; otherwise only reads global state.【F:src/render.js†L416-L423】
  - Shared state touched and where it’s used: Reads `global.App` and feeds the result into snow activation checks inside `buildWorldDrawList` and `renderSnowScreen`.【F:src/render.js†L416-L427】【F:src/render.js†L1174-L1200】【F:src/render.js†L1431-L1523】
  - Dependencies: Optional `App.isSnowEnabled` callback plus `console.warn` for diagnostics.【F:src/render.js†L416-L423】
  - Edge cases handled or missed: Treats missing callbacks and thrown errors as “enabled,” so there’s no hard-off fallback; does not debounce rapid toggle changes.【F:src/render.js†L416-L424】
  - Performance: Constant-time guard executed per snow segment and per snow-screen render; negligible cost.【F:src/render.js†L1174-L1200】【F:src/render.js†L1431-L1523】
  - Units / spaces: Boolean only.【F:src/render.js†L416-L427】
  - Determinism: Deterministic given the same `App.isSnowEnabled` behaviour; otherwise mirrors that callback’s result.【F:src/render.js†L416-L427】
  - Keep / change / delete: Keep; isolates feature gating logic instead of repeating `App` checks at each site. Simplest alternative is inlining the null-safe call where needed.【F:src/render.js†L1174-L1200】【F:src/render.js†L1431-L1523】
  - Confidence / assumptions: High confidence; assumes the `App` singleton remains stable while rendering.【F:src/render.js†L416-L427】




- `numericOr`
  - Purpose: Normalises configuration values into numbers, falling back to a supplied default whenever parsing fails so snow parameters stay valid.【F:src/render.js†L429-L457】
  - Inputs: `value` (any type) and `fallback` (number used when parsing fails); accepts anything but only finite numbers survive.【F:src/render.js†L429-L457】
  - Outputs: Finite number or the provided fallback.【F:src/render.js†L429-L457】
  - Side effects: None.【F:src/render.js†L429-L457】
  - Shared state touched and where it’s used: Used during snow configuration initialisation for size, speed, density, stretch, and screen factors.【F:src/render.js†L453-L457】
  - Dependencies: `Number(value)` and `Number.isFinite`.【F:src/render.js†L429-L432】
  - Edge cases handled or missed: Treats booleans/strings numerically; leaves extremely large finite values untouched for later clamping.【F:src/render.js†L429-L457】
  - Performance: Constant-time conversion at module load.【F:src/render.js†L429-L457】
  - Units / spaces: Preserves the units implied by the fallback (pixels, multipliers, etc.).【F:src/render.js†L453-L457】
  - Determinism: Deterministic for a given input pair.【F:src/render.js†L429-L457】
  - Keep / change / delete: Keep; avoids repeating verbose finite checks. Simplest alternative is to inline the `Number.isFinite(Number(v))` pattern at each usage.【F:src/render.js†L429-L457】
  - Confidence / assumptions: High confidence; assumes fallbacks are sensible values from configuration.【F:src/render.js†L453-L457】




- `orderedRange`
  - Purpose: Converts any two endpoints into an ordered `{ min, max }` pair so later code can assume ascending ranges.【F:src/render.js†L434-L438】
  - Inputs: `minVal`, `maxVal` numbers (may arrive inverted).【F:src/render.js†L434-L438】
  - Outputs: Object with `min` ≤ `max`.【F:src/render.js†L434-L438】
  - Side effects: None.【F:src/render.js†L434-L438】
  - Shared state touched and where it’s used: Called by `rangeFromConfig` when preparing snow parameter ranges.【F:src/render.js†L440-L452】
  - Dependencies: Simple comparisons; no external modules.【F:src/render.js†L434-L438】
  - Edge cases handled or missed: Swaps values when needed but does not filter `NaN`—callers rely on `numericOr` first.【F:src/render.js†L434-L444】
  - Performance: Constant-time.【F:src/render.js†L434-L438】
  - Units / spaces: Maintains the units supplied by the caller (e.g., pixels).【F:src/render.js†L434-L452】
  - Determinism: Deterministic per input pair.【F:src/render.js†L434-L438】
  - Keep / change / delete: Keep; readability gain versus repeating ternaries. Alternative is inline conditional object creation.【F:src/render.js†L434-L445】
  - Confidence / assumptions: High confidence; assumes upstream sanitises inputs to numbers.【F:src/render.js†L440-L452】




- `rangeFromConfig`
  - Purpose: Normalises snow configuration expressed as arrays, objects, or scalars into consistent `{ min, max }` ranges so later math works uniformly.【F:src/render.js†L440-L452】
  - Inputs: `value` (array/object/number), `fallbackMin`, `fallbackMax` (numbers). Accepts partial data and fills gaps from fallbacks.【F:src/render.js†L440-L452】
  - Outputs: Ordered range object.【F:src/render.js†L440-L452】
  - Side effects: None.【F:src/render.js†L440-L452】
  - Shared state touched and where it’s used: Generates snow size, speed, density, stretch, and screen scaling ranges at module load.【F:src/render.js†L453-L457】
  - Dependencies: Uses `numericOr` and `orderedRange` for parsing and ordering.【F:src/render.js†L440-L449】
  - Edge cases handled or missed: Supports arrays with ≥2 entries, `{min,max}` objects, and scalars; falls back entirely when data is unusable.【F:src/render.js†L440-L452】
  - Performance: Constant-time during initialisation.【F:src/render.js†L440-L457】
  - Units / spaces: Preserves units implied by the inputs (pixel scale, seconds, etc.).【F:src/render.js†L440-L457】
  - Determinism: Deterministic given the same inputs.【F:src/render.js†L440-L452】
  - Keep / change / delete: Keep; consolidates resilient config parsing instead of repeating shape checks for each knob.【F:src/render.js†L453-L457】
  - Confidence / assumptions: High confidence; assumes caller-provided fallbacks reflect sane defaults.【F:src/render.js†L453-L457】




- `computeSnowScreenBaseRadius`
  - Purpose: Computes a base snow-screen radius from camera scale and road width so the overlay footprint matches the road before applying stretch effects.【F:src/render.js†L465-L471】
  - Inputs: `scale` (projection scale >0) and `roadWidth` (world width units).【F:src/render.js†L465-L470】
  - Outputs: Radius in pixels after applying minimum size and global multipliers.【F:src/render.js†L465-L471】
  - Side effects: None.【F:src/render.js†L465-L471】
  - Shared state touched and where it’s used: Called while enqueuing snow-screen draw items for visible segments.【F:src/render.js†L1174-L1200】
  - Dependencies: Uses snow constants (`SNOW_SCREEN_MIN_RADIUS`, `SNOW_SCREEN_FOOTPRINT_SCALE`, `SNOW_SCREEN_BASE_EXPANSION`) and the size factor.【F:src/render.js†L458-L471】
  - Edge cases handled or missed: Clamps to the minimum radius and guards against non-positive widths via `Math.max`; very large widths aren’t capped (left to camera visibility).【F:src/render.js†L465-L471】
  - Performance: Constant-time per candidate segment.【F:src/render.js†L1174-L1200】
  - Units / spaces: Returns pixel radius relative to the screen.【F:src/render.js†L465-L471】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L465-L471】
  - Keep / change / delete: Keep; centralises tuning constants instead of repeating math. Alternative is to inline the formula inside the draw-list loop.【F:src/render.js†L1174-L1200】
  - Confidence / assumptions: High confidence; assumes road width reflects the world width at the snow location.【F:src/render.js†L1174-L1200】




- `mulberry32`
  - Purpose: Provides a tiny deterministic RNG used to generate snow flake attributes from segment seeds.【F:src/render.js†L473-L481】
  - Inputs: `seed` integer (any 32-bit value).【F:src/render.js†L473-L474】
  - Outputs: Returns a closure that produces floats in `[0,1)`.【F:src/render.js†L473-L480】
  - Side effects: Maintains internal 32-bit state within the returned closure.【F:src/render.js†L473-L480】
  - Shared state touched and where it’s used: Instantiated by `buildSnowField` when constructing the pool of snow fields.【F:src/render.js†L485-L503】
  - Dependencies: Uses bitwise arithmetic and `Math.imul`; no external modules.【F:src/render.js†L473-L480】
  - Edge cases handled or missed: Works with any seed but is not cryptographically secure; sequence length limited to 2^32 steps (acceptable for visuals).【F:src/render.js†L473-L480】
  - Performance: Very cheap per random number; runs only while building flake pools.【F:src/render.js†L485-L510】
  - Units / spaces: Produces unitless ratios for later conversion to positions/sizes.【F:src/render.js†L485-L503】
  - Determinism: Deterministic per seed.【F:src/render.js†L473-L480】
  - Keep / change / delete: Keep; ensures reproducible snow fields. Simplest alternative is `Math.random`, which would lose determinism.【F:src/render.js†L485-L503】
  - Confidence / assumptions: High confidence; assumes JS bitwise semantics remain stable across browsers.【F:src/render.js†L473-L480】




- `buildSnowField`
  - Purpose: Generates a single snow field composed of flake descriptors with varied offsets, speeds, sway, and phases for one deterministic seed.【F:src/render.js†L485-L503】
  - Inputs: `seed` integer.【F:src/render.js†L485-L486】
  - Outputs: Object `{ flakes, phaseOffset }` with an array of flake metadata and a random phase offset.【F:src/render.js†L485-L503】
  - Side effects: Allocates arrays but does not mutate external state.【F:src/render.js†L485-L503】
  - Shared state touched and where it’s used: Results cached into `snowFieldPool` and later consumed by `snowFieldFor`/`renderSnowScreen`.【F:src/render.js†L505-L518】【F:src/render.js†L1431-L1523】
  - Dependencies: Uses `mulberry32`, `Math.round`, `Math.max`, `lerp`, and snow range constants.【F:src/render.js†L485-L503】
  - Edge cases handled or missed: Guarantees non-negative flake counts and clamps offsets; does not prevent duplicate seeds (pool builder handles diversity).【F:src/render.js†L485-L503】
  - Performance: Linear in flake count during pool construction; happens at start-up or when pool refreshed.【F:src/render.js†L485-L510】
  - Units / spaces: Stores normalised positions `[0,1)` and relative size/stretch multipliers.【F:src/render.js†L485-L503】
  - Determinism: Deterministic for the same seed and configuration constants.【F:src/render.js†L485-L503】
  - Keep / change / delete: Keep; isolates procedural generation, avoiding per-frame random work. Alternative is to generate flakes inside `renderSnowScreen` each frame.【F:src/render.js†L1431-L1523】
  - Confidence / assumptions: High confidence; assumes snow density/stretches remain within expected ranges.【F:src/render.js†L485-L503】




- `ensureSnowFieldPool`
  - Purpose: Lazily fills the reusable snow field pool so repeated lookups can reuse precomputed flake layouts.【F:src/render.js†L505-L511】
  - Inputs: None.【F:src/render.js†L505-L511】
  - Outputs: None; early-returns once the pool is populated.【F:src/render.js†L505-L511】
  - Side effects: Pushes `SNOW_FIELD_POOL_SIZE` entries into the module-level `snowFieldPool`.【F:src/render.js†L505-L511】
  - Shared state touched and where it’s used: Runs whenever `snowFieldFor` executes to guarantee pool availability.【F:src/render.js†L505-L518】
  - Dependencies: Calls `buildSnowField` with deterministic seeds.【F:src/render.js†L507-L510】
  - Edge cases handled or missed: No-ops if the pool already has entries; does not refresh once created (adequate for static snow).【F:src/render.js†L505-L511】
  - Performance: O(pool size) on first call, constant-time guard thereafter.【F:src/render.js†L505-L518】
  - Units / spaces: Manages arrays of normalised flake data; no direct units.【F:src/render.js†L485-L518】
  - Determinism: Deterministic thanks to predictable seeds.【F:src/render.js†L505-L510】
  - Keep / change / delete: Keep; amortises generation work. Simplest alternative is to rebuild per segment lookup.【F:src/render.js†L505-L518】
  - Confidence / assumptions: High confidence; assumes pool size of 12 covers distinct snow patterns sufficiently.【F:src/render.js†L505-L511】




- `snowFieldFor`
  - Purpose: Retrieves a snow field for a segment index by wrapping the index into the prebuilt pool so snow visuals repeat predictably.【F:src/render.js†L513-L518】
  - Inputs: `segIndex` integer (defaults to 0).【F:src/render.js†L513-L516】
  - Outputs: Snow field object or `EMPTY_SNOW_FIELD` fallback.【F:src/render.js†L513-L518】
  - Side effects: Ensures the pool is populated before access.【F:src/render.js†L513-L518】
  - Shared state touched and where it’s used: Provides flake data to `renderSnowScreen`.【F:src/render.js†L513-L518】【F:src/render.js†L1439-L1473】
  - Dependencies: Depends on `ensureSnowFieldPool` and the pool array.【F:src/render.js†L513-L518】
  - Edge cases handled or missed: Returns the empty sentinel when the pool cannot be built; modulus handles negative indices gracefully.【F:src/render.js†L513-L518】
  - Performance: Constant-time lookup.【F:src/render.js†L513-L518】
  - Units / spaces: Returns normalised data consumed by the renderer to compute pixel positions.【F:src/render.js†L1439-L1473】
  - Determinism: Deterministic mapping from index to cached field.【F:src/render.js†L513-L518】
  - Keep / change / delete: Keep; ensures consistent snow without per-frame RNG. Alternative would be storing snow data on segments themselves.【F:src/render.js†L1439-L1473】
  - Confidence / assumptions: High confidence; assumes repeating every 12 segments is visually acceptable.【F:src/render.js†L505-L518】




- `fogNear`
  - Purpose: Reports the world-space distance where fog begins based on configured segment counts and segment length.【F:src/render.js†L712-L717】
  - Inputs: None.【F:src/render.js†L712-L717】
  - Outputs: Numeric distance (track units).【F:src/render.js†L712-L717】
  - Side effects: None.【F:src/render.js†L712-L717】
  - Shared state touched and where it’s used: Consumed by `fogFactorFromZ` whenever fog intensity is computed for quads and sprites.【F:src/render.js†L714-L724】
  - Dependencies: Reads `fog.nearSegments` and `segmentLength`.【F:src/render.js†L712-L717】
  - Edge cases handled or missed: Allows zero or negative configuration values, which would clamp results in `fogFactorFromZ`.【F:src/render.js†L712-L719】
  - Performance: Constant access.【F:src/render.js†L712-L717】
  - Units / spaces: Track/world distance.【F:src/render.js†L712-L717】
  - Determinism: Deterministic for fixed configuration.【F:src/render.js†L712-L717】
  - Keep / change / delete: Keep; paired with `fogFar` for readability. Simplest alternative is to inline `fog.nearSegments * segmentLength` at each call.【F:src/render.js†L714-L724】
  - Confidence / assumptions: High confidence; assumes fog settings remain static at runtime.【F:src/render.js†L712-L717】




- `computeOverlayEnabled`
  - Purpose: Determines whether the debug overlay canvas should be visible by consulting `App.isDebugEnabled` and the renderer’s debug config.【F:src/render.js†L554-L564】
  - Inputs: None.【F:src/render.js†L554-L564】
  - Outputs: Boolean flag.【F:src/render.js†L554-L564】
  - Side effects: None, aside from swallowing errors from the app hook.【F:src/render.js†L554-L562】
  - Shared state touched and where it’s used: Queried by `syncOverlayVisibility` to toggle canvas display and indirectly by `renderOverlay`.【F:src/render.js†L566-L577】【F:src/render.js†L1888-L2030】
  - Dependencies: Optional `App.isDebugEnabled` callback plus local `debug` configuration.【F:src/render.js†L554-L563】
  - Edge cases handled or missed: Falls back to config when the hook is missing or throws; cannot override config-driven debug-on state when the hook errors.【F:src/render.js†L554-L563】
  - Performance: Constant-time check per frame.【F:src/render.js†L566-L577】
  - Units / spaces: Boolean only.【F:src/render.js†L554-L564】
  - Determinism: Deterministic for stable `App` responses and config.【F:src/render.js†L554-L564】
  - Keep / change / delete: Keep; centralises debug toggle logic. Alternative is to inline the try/catch at each overlay call.【F:src/render.js†L566-L577】
  - Confidence / assumptions: High confidence; assumes the app callback is synchronous.【F:src/render.js†L554-L563】




- `syncOverlayVisibility`
  - Purpose: Shows or hides the overlay canvas and clears it when hiding so stale debug imagery disappears.【F:src/render.js†L566-L577】
  - Inputs: `force` boolean (default `false`) to force a resync.【F:src/render.js†L566-L577】
  - Outputs: Final overlay visibility state.【F:src/render.js†L566-L577】
  - Side effects: Mutates `overlayOn`, toggles `canvasOverlay.style.display`, and clears the overlay context when disabling.【F:src/render.js†L566-L577】
  - Shared state touched and where it’s used: Called during overlay rendering and when attaching canvases to maintain visibility state.【F:src/render.js†L566-L577】【F:src/render.js†L1888-L2030】【F:src/render.js†L2089-L2094】
  - Dependencies: Uses `computeOverlayEnabled` and DOM references for the overlay canvas.【F:src/render.js†L566-L577】
  - Edge cases handled or missed: Safe when canvases are missing; assumes CSS `display` toggling is sufficient (no fade).【F:src/render.js†L566-L577】
  - Performance: Constant-time per call.【F:src/render.js†L566-L577】
  - Units / spaces: Boolean/DOM state.【F:src/render.js†L566-L577】
  - Determinism: Deterministic for identical debug flags and DOM state.【F:src/render.js†L566-L577】
  - Keep / change / delete: Keep; encapsulates overlay toggling logic. Alternative is manual `style.display` writes at each caller.【F:src/render.js†L1888-L2030】
  - Confidence / assumptions: High confidence; assumes overlay context can be cleared without side effects.【F:src/render.js†L566-L577】




- `createPoint`
  - Purpose: Builds the `{ world, camera, screen }` structure used during projection, accepting either an object or raw coordinates.【F:src/render.js†L580-L589】
  - Inputs: Either `worldOrX` object `{x,y,z}` or separate `worldOrX`, `y`, `z` numbers (defaults to 0).【F:src/render.js†L580-L589】
  - Outputs: Point object with empty `camera`/`screen` dictionaries ready for projection.【F:src/render.js†L580-L589】
  - Side effects: None besides allocation.【F:src/render.js†L580-L589】
  - Shared state touched and where it’s used: Used by `projectWorldPoint` and `projectSegPoint` before calling `projectPoint`.【F:src/render.js†L592-L607】
  - Dependencies: Pure object creation; no external modules.【F:src/render.js†L580-L589】
  - Edge cases handled or missed: Gracefully handles null/undefined input by defaulting to zero; does not deep-clone nested objects.【F:src/render.js†L580-L604】
  - Performance: Constant-time allocation.【F:src/render.js†L580-L589】
  - Units / spaces: Stores world coordinates in track units; camera/screen filled later.【F:src/render.js†L580-L607】
  - Determinism: Deterministic per input.【F:src/render.js†L580-L589】
  - Keep / change / delete: Keep; avoids repetitive object literal boilerplate before projection. Alternative is to construct ad-hoc objects in each caller.【F:src/render.js†L592-L607】
  - Confidence / assumptions: High confidence; assumes projection immediately follows creation.【F:src/render.js†L592-L607】




- `projectWorldPoint`
  - Purpose: Projects a world-space coordinate into camera and screen coordinates using the current camera origin.【F:src/render.js†L592-L596】
  - Inputs: `world` object `{x,y,z}`, `camX`, `camY`, `camS` camera offsets.【F:src/render.js†L592-L606】
  - Outputs: Point object with updated `camera` and `screen` fields.【F:src/render.js†L592-L606】
  - Side effects: Allocates a point via `createPoint` and mutates it through `projectPoint`.【F:src/render.js†L592-L607】
  - Shared state touched and where it’s used: Called by camera tilt logic and while enqueuing the player sprite each frame.【F:src/render.js†L1032-L1049】【F:src/render.js†L1335-L1370】
  - Dependencies: `createPoint` and `projectPoint`.【F:src/render.js†L592-L607】
  - Edge cases handled or missed: Relies on `projectPoint` to handle near-plane issues; assumes `world` fields are numeric or default to zero.【F:src/render.js†L592-L607】
  - Performance: Constant per projection; invoked for only a few key points each frame.【F:src/render.js†L1032-L1049】【F:src/render.js†L1335-L1370】
  - Units / spaces: Converts track/world units to screen pixels and stores width scaling.【F:src/render.js†L592-L607】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L592-L607】
  - Keep / change / delete: Keep; clarifies intent versus calling `projectPoint` manually. Alternative is to inline object creation and projection each time.【F:src/render.js†L1032-L1049】
  - Confidence / assumptions: High confidence; assumes camera depth stays positive.【F:src/render.js†L592-L607】




- `projectSegPoint`
  - Purpose: Projects a segment endpoint plus vertical offset into screen space, useful for rails and cliffs.【F:src/render.js†L598-L607】
  - Inputs: `segPoint` (with `world`), `yOffset` (number), `camX`, `camY`, `camS`.【F:src/render.js†L598-L607】
  - Outputs: Point object ready for rendering calculations.【F:src/render.js†L598-L607】
  - Side effects: Allocates via `createPoint` and projects it.【F:src/render.js†L598-L607】
  - Shared state touched and where it’s used: Heavily used while building the world draw list for strips, cliffs, and guard rails.【F:src/render.js†L1051-L1332】
  - Dependencies: `createPoint` and `projectPoint`.【F:src/render.js†L598-L607】
  - Edge cases handled or missed: Defaults missing coordinates to zero; assumes `segPoint.world` exists.【F:src/render.js†L598-L605】
  - Performance: Hot path but only arithmetic and projection per point.【F:src/render.js†L1051-L1332】
  - Units / spaces: Converts world coordinates to screen pixels with width scaling.【F:src/render.js†L598-L607】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L598-L607】
  - Keep / change / delete: Keep; clarifies Y-offset handling per segment. Alternative is to compute offset and call `projectWorldPoint` manually.【F:src/render.js†L1051-L1332】
  - Confidence / assumptions: High confidence; assumes segment data remains valid while iterating.【F:src/render.js†L1051-L1332】




- `padWithSpriteOverlap`
  - Purpose: Expands quads by the configured sprite overlap so adjacent tiles avoid seam gaps.【F:src/render.js†L610-L612】
  - Inputs: `quad` object and optional override padding values.【F:src/render.js†L610-L612】
  - Outputs: New quad with padding applied via `padQuad`.【F:src/render.js†L610-L612】
  - Side effects: None.【F:src/render.js†L610-L612】
  - Shared state touched and where it’s used: Applied during road, boost zone, rail, and cliff rendering to smooth edges.【F:src/render.js†L761-L879】【F:src/render.js†L1616-L1668】
  - Dependencies: Uses renderer helper `padQuad` combined with default sprite overlap constants.【F:src/render.js†L523-L612】【F:src/gl/renderer.js†L221-L258】
  - Edge cases handled or missed: Allows partial overrides but assumes quad keys exist; does not validate orientation.【F:src/render.js†L610-L612】
  - Performance: Constant-time object merge per quad.【F:src/render.js†L761-L879】
  - Units / spaces: Padding measured in screen pixels according to overlap config.【F:src/render.js†L523-L612】
  - Determinism: Deterministic per inputs.【F:src/render.js†L610-L612】
  - Keep / change / delete: Keep; prevents repeating padding logic. Alternative is manual per-edge adjustments in each draw routine.【F:src/render.js†L761-L879】
  - Confidence / assumptions: High confidence; assumes overlap constants remain small relative to tile size.【F:src/render.js†L523-L612】




- `computeCliffLaneProgress`
  - Purpose: Converts off-road sprite offsets into progress through multi-stage cliff geometry so props align with layered cliffs.【F:src/render.js†L614-L655】
  - Inputs: `segIndex` integer, `offset` lane offset, `t` segment interpolation (0–1), `roadWidth` world width.【F:src/render.js†L614-L626】
  - Outputs: Object `{ o }` representing progress along inner/outer cliff sections.【F:src/render.js†L614-L655】
  - Side effects: None.【F:src/render.js†L614-L655】
  - Shared state touched and where it’s used: Called for sprites with |offset|>1 while assembling draw-list props.【F:src/render.js†L1241-L1287】
  - Dependencies: Uses `cliffParamsAt`, `clamp`, and section widths.【F:src/render.js†L619-L647】
  - Edge cases handled or missed: Falls back when geometry missing or widths near zero, ensuring props still place roughly in the right area.【F:src/render.js†L619-L655】
  - Performance: Constant-time per eligible sprite.【F:src/render.js†L1241-L1287】
  - Units / spaces: Works in normalised progress relative to road width.【F:src/render.js†L614-L655】
  - Determinism: Deterministic for identical inputs.【F:src/render.js†L614-L655】
  - Keep / change / delete: Keep; encapsulates cliff math used by multiple sprite kinds. Alternative is to inline calculations when placing each prop.【F:src/render.js†L1241-L1287】
  - Confidence / assumptions: High confidence; assumes `cliffParamsAt` returns consistent geometry for both sides.【F:src/render.js†L614-L655】




- `fogArray`
  - Purpose: Produces per-vertex fog factors `[near, near, far, far]` for quads based on start/end depths.【F:src/render.js†L658-L662】
  - Inputs: `zNear` number, optional `zFar` (defaults to `zNear`).【F:src/render.js†L658-L661】
  - Outputs: Array of fog intensities.【F:src/render.js†L658-L661】
  - Side effects: None.【F:src/render.js†L658-L662】
  - Shared state touched and where it’s used: Used across road, boost zone, sprite, snow, and player rendering to tint by depth.【F:src/render.js†L761-L942】【F:src/render.js†L1370-L1730】
  - Dependencies: Calls `fogFactorFromZ` for each depth.【F:src/render.js†L658-L661】
  - Edge cases handled or missed: If fog disabled, `fogFactorFromZ` returns zero; duplicates near value when far missing.【F:src/render.js†L658-L719】
  - Performance: Constant-time per call.【F:src/render.js†L658-L662】
  - Units / spaces: Unitless fog weights.【F:src/render.js†L658-L662】
  - Determinism: Deterministic given inputs.【F:src/render.js†L658-L662】
  - Keep / change / delete: Keep; avoids repeating array assembly in each draw path.【F:src/render.js†L761-L1730】
  - Confidence / assumptions: High confidence; assumes depth inputs are finite.【F:src/render.js†L658-L719】




- `getTrackLength`
  - Purpose: Retrieves the track length whether stored as a literal or function, defaulting to zero when absent.【F:src/render.js†L664-L667】
  - Inputs: None.【F:src/render.js†L664-L667】
  - Outputs: Numeric track length.【F:src/render.js†L664-L667】
  - Side effects: None.【F:src/render.js†L664-L667】
  - Shared state touched and where it’s used: Used for segment wrapping in `segmentAtS`, elevation sampling, and sprite placement math.【F:src/render.js†L945-L1235】
  - Dependencies: Reads `data.trackLength`, invoking it if it’s a function.【F:src/render.js†L664-L667】
  - Edge cases handled or missed: Returns 0 when length missing, causing upstream callers to bail (safe).【F:src/render.js†L664-L951】
  - Performance: Constant-time.【F:src/render.js†L664-L667】
  - Units / spaces: Track distance units.【F:src/render.js†L664-L967】
  - Determinism: Deterministic when `data.trackLength` stable.【F:src/render.js†L664-L667】
  - Keep / change / delete: Keep; small helper that hides mixed representation. Alternative is to repeat the ternary at each use.【F:src/render.js†L945-L1235】
  - Confidence / assumptions: High confidence; assumes active tracks provide a positive value.【F:src/render.js†L945-L1235】




- `projectPoint`
  - Purpose: Core projection routine that converts a point from world space into camera-relative screen coordinates and width scaling.【F:src/render.js†L669-L681】
  - Inputs: Point `p` plus `camX`, `camY`, `camS` camera offsets.【F:src/render.js†L669-L676】
  - Outputs: Mutates `p.camera` and `p.screen` with projected coordinates.【F:src/render.js†L669-L681】
  - Side effects: Overwrites the point’s `camera`/`screen` fields.【F:src/render.js†L669-L681】
  - Shared state touched and where it’s used: Invoked by all projection helpers feeding the draw list, camera tilt, and overlay plotting.【F:src/render.js†L592-L607】【F:src/render.js†L1051-L1992】
  - Dependencies: Uses camera depth, global canvas metrics, and `roadWidthAt` for width scaling.【F:src/render.js†L669-L681】
  - Edge cases handled or missed: Assumes `p.camera.z` > 0; callers skip near-plane segments before invoking it.【F:src/render.js†L1051-L1087】
  - Performance: Hot path executed many times per frame; minimal arithmetic beyond necessary perspective math.【F:src/render.js†L669-L681】
  - Units / spaces: Converts track units to pixel positions and widths.【F:src/render.js†L669-L681】
  - Determinism: Deterministic for identical inputs.【F:src/render.js†L669-L681】
  - Keep / change / delete: Keep; fundamental to rendering. Alternative is none without rewriting projection logic.【F:src/render.js†L592-L607】
  - Confidence / assumptions: High confidence; assumes camera depth stays positive and `roadWidthAt` is reliable.【F:src/render.js†L669-L681】




- `makeCliffLeftQuads`
  - Purpose: Builds two textured quads (inner and outer) for the left cliff wall segment, including UVs and intermediate points for sprite placement.【F:src/render.js†L683-L695】
  - Inputs: Screen coordinates `x1,y1,w1,x2,y2,w2`, vertical targets `yA1,yA2,yB1,yB2`, horizontal offsets `dxA0,dxA1,dxB0,dxB1`, UV span `u0,u1`, and road widths `rw1,rw2`.【F:src/render.js†L683-L694】
  - Outputs: Object containing quads, UVs, and cached inner edge positions.【F:src/render.js†L683-L695】
  - Side effects: None.【F:src/render.js†L683-L695】
  - Shared state touched and where it’s used: Called during draw-list assembly for every road segment to capture geometry for `renderStrip` and off-road sprite placement.【F:src/render.js†L1051-L1172】
  - Dependencies: Pure arithmetic; relies on provided cliff parameters and road widths.【F:src/render.js†L683-L695】
  - Edge cases handled or missed: Guards against division by near-zero road widths via `Math.max(1e-6, rw)`.【F:src/render.js†L683-L694】
  - Performance: Constant-time per segment.【F:src/render.js†L1051-L1172】
  - Units / spaces: Operates in screen pixels and UV coordinates.【F:src/render.js†L683-L695】
  - Determinism: Deterministic given inputs.【F:src/render.js†L683-L695】
  - Keep / change / delete: Keep; encapsulates verbose geometry math. Alternative is to inline the calculations inside `buildWorldDrawList`.【F:src/render.js†L1051-L1172】
  - Confidence / assumptions: High confidence; assumes cliff parameter data is coherent for left wall.【F:src/render.js†L1051-L1172】




- `makeCliffRightQuads`
  - Purpose: Mirrors `makeCliffLeftQuads` for the right side, constructing two quads with UVs and inner edge positions.【F:src/render.js†L697-L709】
  - Inputs: Same parameter set as the left variant, adjusted for right-hand offsets.【F:src/render.js†L697-L708】
  - Outputs: Object with right cliff quads, UVs, and cached edge positions.【F:src/render.js†L697-L709】
  - Side effects: None.【F:src/render.js†L697-L709】
  - Shared state touched and where it’s used: Used during draw-list creation for rendering and sprite placement on the right cliff.【F:src/render.js†L1051-L1172】
  - Dependencies: Pure math using provided geometry and widths.【F:src/render.js†L697-L709】
  - Edge cases handled or missed: Also guards against near-zero widths with `Math.max(1e-6, rw)`.【F:src/render.js†L697-L708】
  - Performance: Constant-time per segment.【F:src/render.js†L1051-L1172】
  - Units / spaces: Screen pixels and UV coordinates.【F:src/render.js†L697-L709】
  - Determinism: Deterministic per input.【F:src/render.js†L697-L709】
  - Keep / change / delete: Keep; keeps symmetrical math isolated. Alternative is to inline inside `buildWorldDrawList`.【F:src/render.js†L1051-L1172】
  - Confidence / assumptions: High confidence; assumes right-side cliff data mirrors left structure.【F:src/render.js†L1051-L1172】




- `fogFactorFromZ`
  - Purpose: Computes a fog interpolation factor (0–1) based on camera-space depth and configured near/far distances.【F:src/render.js†L714-L718】
  - Inputs: `z` depth (number).【F:src/render.js†L714-L718】
  - Outputs: Fog factor between 0 and 1.【F:src/render.js†L714-L718】
  - Side effects: None.【F:src/render.js†L714-L718】
  - Shared state touched and where it’s used: Used by `fogArray`, `spriteFarScaleFromZ`, and snow stretching to gauge visibility.【F:src/render.js†L658-L724】【F:src/render.js†L1455-L1511】
  - Dependencies: Uses `fog.enabled`, `fogNear`, and `fogFar` plus `clamp`.【F:src/render.js†L714-L718】
  - Edge cases handled or missed: Returns 0 when fog disabled; handles inverted near/far by treating anything beyond `f` as fully fogged.【F:src/render.js†L714-L718】
  - Performance: Constant-time per call.【F:src/render.js†L714-L718】
  - Units / spaces: Takes depth in world units relative to camera.【F:src/render.js†L714-L718】
  - Determinism: Deterministic per input.【F:src/render.js†L714-L718】
  - Keep / change / delete: Keep; central helper for fog math. Alternative is to repeat the interpolation formula everywhere.【F:src/render.js†L658-L724】
  - Confidence / assumptions: High confidence; assumes fog distances remain positive or handled by guard logic.【F:src/render.js†L714-L718】




- `spriteFarScaleFromZ`
  - Purpose: Shrinks distant sprites according to fog factor so far objects taper as they fade out.【F:src/render.js†L720-L724】
  - Inputs: `z` depth (number).【F:src/render.js†L720-L724】
  - Outputs: Scale multiplier between `sprites.far.shrinkTo` and 1.【F:src/render.js†L720-L724】
  - Side effects: None.【F:src/render.js†L720-L724】
  - Shared state touched and where it’s used: Applied when enqueuing snow screens, NPCs, and props to scale them based on distance.【F:src/render.js†L1174-L1327】
  - Dependencies: Uses `fogFactorFromZ`, `sprites.far.shrinkTo`, and `sprites.far.power`.【F:src/render.js†L720-L724】
  - Edge cases handled or missed: Returns 1 when fog disabled; clamps shrink factor smoothly but does not enforce minimum beyond config.【F:src/render.js†L720-L724】
  - Performance: Constant-time per sprite.【F:src/render.js†L1174-L1327】
  - Units / spaces: Unitless scale factor applied to screen dimensions.【F:src/render.js†L720-L724】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L720-L724】
  - Keep / change / delete: Keep; encapsulates far-distance scaling logic. Alternative is to replicate the power/easing math per sprite.【F:src/render.js†L1174-L1327】
  - Confidence / assumptions: High confidence; assumes sprite config values stay within 0–1 range.【F:src/render.js†L720-L724】




- `drawParallaxLayer`
  - Purpose: Renders a background parallax layer by drawing a large textured quad offset by player lateral position; falls back to solid colour when textures disabled.【F:src/render.js†L728-L753】
  - Inputs: `tex` (WebGL texture or null) and `cfg` descriptor (`parallaxX`, `uvSpanX`, `uvSpanY`, optional `key`).【F:src/render.js†L728-L753】
  - Outputs: None; submits draw calls to the GL renderer.【F:src/render.js†L728-L753】
  - Side effects: Uses `glr` to issue a draw call and optionally increments draw stats via wrappers.【F:src/render.js†L728-L753】【F:src/render.js†L337-L384】
  - Shared state touched and where it’s used: Called for every parallax layer when rendering the horizon.【F:src/render.js†L755-L758】
  - Dependencies: Requires `glr`, `areTexturesEnabled`, and `randomColorFor` for debug fills.【F:src/render.js†L728-L753】
  - Edge cases handled or missed: No-ops when the renderer is missing; uses white texture fallback when textures enabled but layer texture absent.【F:src/render.js†L728-L753】
  - Performance: Constant per layer (just one quad).【F:src/render.js†L728-L758】
  - Units / spaces: Operates in screen pixels scaled by `BACKDROP_SCALE`.【F:src/render.js†L728-L747】
  - Determinism: Deterministic for the same player position and configuration.【F:src/render.js†L728-L753】
  - Keep / change / delete: Keep; isolates background rendering. Alternative is to inline inside `renderHorizon`.【F:src/render.js†L728-L758】
  - Confidence / assumptions: High confidence; assumes `cfg` contains valid spans.【F:src/render.js†L728-L753】




- `renderHorizon`
  - Purpose: Draws all configured parallax layers to form the horizon backdrop before road geometry.【F:src/render.js†L755-L758】
  - Inputs: None; iterates `parallaxLayers`.【F:src/render.js†L755-L758】
  - Outputs: None; issues draw calls for each layer.【F:src/render.js†L755-L758】
  - Side effects: Submits one quad per layer via `drawParallaxLayer`.【F:src/render.js†L755-L758】
  - Shared state touched and where it’s used: Invoked at the top of `renderScene` before road strips render.【F:src/render.js†L995-L1003】
  - Dependencies: Relies on `drawParallaxLayer`, textures map, and parallax configuration.【F:src/render.js†L755-L758】
  - Edge cases handled or missed: Does nothing when `parallaxLayers` empty.【F:src/render.js†L755-L758】
  - Performance: Linear in number of layers (small).【F:src/render.js†L755-L758】
  - Units / spaces: Screen-space quads covering the viewport.【F:src/render.js†L728-L758】
  - Determinism: Deterministic for a given configuration and player position.【F:src/render.js†L728-L758】
  - Keep / change / delete: Keep; separates background pass. Alternative is to inline loop within `renderScene`.【F:src/render.js†L995-L1003】
  - Confidence / assumptions: High confidence; assumes parallax texture keys resolve to textures map.【F:src/render.js†L755-L758】




- `drawRoadStrip`
  - Purpose: Tesselates a road segment into grid-aligned quads and draws them textured (or coloured) with fog gradients and padding to avoid seams.【F:src/render.js†L761-L813】
  - Inputs: Screen coords `x1,y1,w1,x2,y2,w2`, texture V span `v0,v1`, fog array `fogRoad`, base texture `tex`, and `segIndex` for debug colouring.【F:src/render.js†L761-L813】
  - Outputs: None; submits draw calls for each cell.【F:src/render.js†L761-L813】
  - Side effects: Invokes `glr.drawQuadTextured`/`drawQuadSolid` for each quad and relies on perf wrappers to count draws.【F:src/render.js†L761-L813】【F:src/render.js†L337-L384】
  - Shared state touched and where it’s used: Called from `renderStrip` whenever textures are enabled or debug fill requires road geometry.【F:src/render.js†L1605-L1625】
  - Dependencies: Uses `areTexturesEnabled`, `lerp`, `padWithSpriteOverlap`, `clamp`, and `randomColorFor`.【F:src/render.js†L761-L813】
  - Edge cases handled or missed: Clamps row/column counts, pads columns at edges, and falls back to white texture when needed; does not render if `glr` missing.【F:src/render.js†L761-L813】
  - Performance: Loops over rows×cols per segment; heavier section of strip rendering but bounded by grid config.【F:src/render.js†L761-L813】【F:src/render.js†L1605-L1625】
  - Units / spaces: Works in screen pixels with UV coordinates.【F:src/render.js†L761-L813】
  - Determinism: Deterministic for given geometry, grid config, and texture state.【F:src/render.js†L761-L813】
  - Keep / change / delete: Keep; encapsulates detailed strip tessellation. Alternative is to inline inside `renderStrip`, hurting readability.【F:src/render.js†L1605-L1625】
  - Confidence / assumptions: High confidence; assumes grid config tuned to avoid aliasing.【F:src/render.js†L761-L813】




- `drawBoostZonesOnStrip`
  - Purpose: Draws boost zone overlays across a road strip by subdividing zone bounds into padded quads with fog-aware colouring or textures.【F:src/render.js†L815-L882】
  - Inputs: `zones` array, near/far positions `xNear,yNear,xFar,yFar`, widths `wNear,wFar`, fog array, and `segIndex`.【F:src/render.js†L815-L883】
  - Outputs: None; submits quads for each zone cell.【F:src/render.js†L815-L883】
  - Side effects: Registers boost quad counts via perf tracker and issues draw calls.【F:src/render.js†L874-L879】【F:src/render.js†L337-L393】
  - Shared state touched and where it’s used: Called from `renderStrip` for each segment when zones exist.【F:src/render.js†L1618-L1624】
  - Dependencies: Uses `areTexturesEnabled`, `getZoneLaneBounds`, `padWithSpriteOverlap`, `lerp`, `clamp`, textures map, and perf tracker.【F:src/render.js†L815-L883】
  - Edge cases handled or missed: Skips zones lacking bounds, clamps columns, and falls back to solid colours when textures disabled.【F:src/render.js†L815-L883】
  - Performance: Similar to road tessellation; loops per zone per cell but zone counts are small.【F:src/render.js†L815-L883】
  - Units / spaces: Screen pixel quads with UV coordinates.【F:src/render.js†L815-L883】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L815-L883】
  - Keep / change / delete: Keep; isolates boost rendering logic separate from generic strip drawing. Alternative is to inline inside `renderStrip`.【F:src/render.js†L1616-L1624】
  - Confidence / assumptions: High confidence; assumes zone configs supply valid bounds and textures when referenced.【F:src/render.js†L815-L883】




- `drawBillboard`
  - Purpose: Draws an upright sprite quad (npc/prop) with optional texture, tint, and fog, centred on the provided anchor.【F:src/render.js†L885-L912】
  - Inputs: `anchorX`, `baseY`, width/height in pixels, fog depth, optional `tint`, `texture`, `uvOverride`, `colorKey`.【F:src/render.js†L885-L912】
  - Outputs: None; submits a quad draw.【F:src/render.js†L885-L912】
  - Side effects: Calls renderer draw methods and uses `randomColorFor` fallback when textures disabled.【F:src/render.js†L885-L912】
  - Shared state touched and where it’s used: Invoked from `renderDrawList` for NPCs and non-rotated props.【F:src/render.js†L1370-L1419】
  - Dependencies: Requires `glr`, `areTexturesEnabled`, `fogArray`, and `randomColorFor`.【F:src/render.js†L885-L912】
  - Edge cases handled or missed: No-ops when renderer missing; ensures fallback tint array when solid colour requested.【F:src/render.js†L885-L912】
  - Performance: Constant per sprite; one quad draw.【F:src/render.js†L1370-L1420】
  - Units / spaces: Screen pixel dimensions with UV coordinates.【F:src/render.js†L885-L912】
  - Determinism: Deterministic for given inputs (random colours keyed).【F:src/render.js†L885-L912】
  - Keep / change / delete: Keep; central billboard helper. Alternative is to embed draw logic inside `renderDrawList`.【F:src/render.js†L1370-L1420】
  - Confidence / assumptions: High confidence; assumes tint arrays follow `[r,g,b,a]`.【F:src/render.js†L885-L912】




- `drawBillboardRotated`
  - Purpose: Draws a sprite quad with rotation around its centre (used for angled props) using optional texture/tint inputs.【F:src/render.js†L915-L943】
  - Inputs: Same as `drawBillboard` plus `angleRad` rotation.【F:src/render.js†L915-L942】
  - Outputs: None.【F:src/render.js†L915-L942】
  - Side effects: Calls `makeRotatedQuad` to compute geometry then issues draw call.【F:src/render.js†L915-L942】
  - Shared state touched and where it’s used: Called from `renderDrawList` when a prop item sets `angle`.【F:src/render.js†L1393-L1407】
  - Dependencies: Uses `glr`, `makeRotatedQuad`, `fogArray`, and `randomColorFor`.【F:src/render.js†L915-L942】【F:src/gl/renderer.js†L259-L275】
  - Edge cases handled or missed: No-ops if renderer missing; falls back to solid tint when textures unavailable.【F:src/render.js†L915-L942】
  - Performance: Constant per rotated sprite.【F:src/render.js†L1393-L1407】
  - Units / spaces: Screen pixel quads rotated about centre.【F:src/render.js†L915-L942】
  - Determinism: Deterministic for given inputs.【F:src/render.js†L915-L942】
  - Keep / change / delete: Keep; isolates rotation math. Alternative is to inline inside draw list loop.【F:src/render.js†L1393-L1407】
  - Confidence / assumptions: High confidence; assumes angle is in radians and quads remain reasonably small.【F:src/render.js†L915-L942】




- `segmentAtS`
  - Purpose: Finds the track segment corresponding to a world distance `s`, wrapping around the track length and segment list.【F:src/render.js†L945-L952】
  - Inputs: `s` world distance (number).【F:src/render.js†L945-L951】
  - Outputs: Segment object or `null` when track data unavailable.【F:src/render.js†L945-L952】
  - Side effects: None.【F:src/render.js†L945-L952】
  - Shared state touched and where it’s used: Used by `renderScene`, boost overlay, elevation queries, and snow-screen logic to anchor work to segments.【F:src/render.js†L998-L1199】【F:src/render.js†L1841-L1879】
  - Dependencies: Calls `getTrackLength` and uses `segments` array plus `segmentLength`.【F:src/render.js†L945-L952】
  - Edge cases handled or missed: Handles negative `s` by wrapping; returns `null` when track length ≤0.【F:src/render.js†L945-L952】
  - Performance: Constant-time.【F:src/render.js†L945-L952】
  - Units / spaces: Works in track distance units.【F:src/render.js†L945-L952】
  - Determinism: Deterministic for given `s` and segment array.【F:src/render.js†L945-L952】
  - Keep / change / delete: Keep; central lookup for many systems. Alternative is to repeat wrapping logic at each call site.【F:src/render.js†L945-L1235】
  - Confidence / assumptions: High confidence; assumes segment array covers full track in order.【F:src/render.js†L945-L1235】




- `elevationAt`
  - Purpose: Returns interpolated road elevation at distance `s` by sampling the containing segment.【F:src/render.js†L954-L963】
  - Inputs: `s` world distance (number).【F:src/render.js†L954-L961】
  - Outputs: Elevation (world units).【F:src/render.js†L954-L963】
  - Side effects: None.【F:src/render.js†L954-L963】
  - Shared state touched and where it’s used: Used by `groundProfileAt` and overlay plotting to draw elevation charts.【F:src/render.js†L965-L973】【F:src/render.js†L1921-L2029】
  - Dependencies: Calls `getTrackLength`, `segments`, and `lerp`.【F:src/render.js†L954-L963】
  - Edge cases handled or missed: Returns 0 when segments missing; wraps `s` within track length.【F:src/render.js†L954-L963】
  - Performance: Constant-time per query.【F:src/render.js†L954-L963】
  - Units / spaces: Track elevation units.【F:src/render.js†L954-L973】
  - Determinism: Deterministic for given track data.【F:src/render.js†L954-L963】
  - Keep / change / delete: Keep; reused in multiple overlays. Alternative is to inline interpolation logic where needed.【F:src/render.js†L1921-L2029】
  - Confidence / assumptions: High confidence; assumes segments expose `p1/p2.world.y` positions.【F:src/render.js†L954-L963】




- `groundProfileAt`
  - Purpose: Computes elevation, slope, and curvature (`dy`, `d2y`) at distance `s` using centered differences for overlay analytics.【F:src/render.js†L965-L973】
  - Inputs: `s` world distance (number).【F:src/render.js†L965-L973】
  - Outputs: Object `{ y, dy, d2y }`.【F:src/render.js†L965-L973】
  - Side effects: None.【F:src/render.js†L965-L973】
  - Shared state touched and where it’s used: Used by `renderOverlay` to plot elevation profiles and compute curvature for HUD text.【F:src/render.js†L1920-L2029】
  - Dependencies: Calls `elevationAt` multiple times and uses finite difference math.【F:src/render.js†L965-L973】
  - Edge cases handled or missed: When segments absent, returns zero slope/curvature; step size clamped to avoid divide-by-zero.【F:src/render.js†L965-L973】
  - Performance: Constant-time, three elevation samples per call.【F:src/render.js†L965-L973】
  - Units / spaces: Elevation units for `y`, slope in elevation per meter, curvature second derivative.【F:src/render.js†L965-L973】
  - Determinism: Deterministic for given track data.【F:src/render.js†L965-L973】
  - Keep / change / delete: Keep; clean helper for overlay analytics. Alternative is to inline derivative computations in the overlay function.【F:src/render.js†L1920-L2029】
  - Confidence / assumptions: High confidence; assumes track spacing stays consistent.【F:src/render.js†L965-L973】




- `boostZonesOnSegment`
  - Purpose: Retrieves the boost zone definitions attached to a segment’s features, defaulting to an empty array when absent.【F:src/render.js†L976-L980】
  - Inputs: `seg` segment object.【F:src/render.js†L976-L980】
  - Outputs: Array of zone descriptors (possibly empty).【F:src/render.js†L976-L980】
  - Side effects: None.【F:src/render.js†L976-L980】
  - Shared state touched and where it’s used: Used in draw-list building and boost overlay rendering.【F:src/render.js†L1088-L1172】【F:src/render.js†L1841-L1879】
  - Dependencies: Checks `seg.features.boostZones`.【F:src/render.js†L976-L980】
  - Edge cases handled or missed: Returns `[]` for missing features or non-array data.【F:src/render.js†L976-L980】
  - Performance: Constant-time.【F:src/render.js†L976-L980】
  - Units / spaces: Returns configuration objects; no direct units.【F:src/render.js†L976-L980】
  - Determinism: Deterministic for given segment.【F:src/render.js†L976-L980】
  - Keep / change / delete: Keep; small helper reducing repeated null checks. Alternative is inline optional chaining each time.【F:src/render.js†L1088-L1172】
  - Confidence / assumptions: High confidence; assumes zone arrays are immutable per segment.【F:src/render.js†L976-L980】




- `zonesFor`
  - Purpose: Retrieves texture zone ranges from track data for the given key (`road`, `rail`, `cliff`), supporting both top-level arrays and grouped `texZones` structure.【F:src/render.js†L982-L988】
  - Inputs: `key` string.【F:src/render.js†L982-L988】
  - Outputs: Array of zone descriptors or empty array.【F:src/render.js†L982-L988】
  - Side effects: None.【F:src/render.js†L982-L988】
  - Shared state touched and where it’s used: Used when preparing zone data for the draw list in `renderScene`.【F:src/render.js†L1004-L1011】
  - Dependencies: Accesses `data` object for `keyTexZones` or nested `texZones`.【F:src/render.js†L982-L988】
  - Edge cases handled or missed: Returns empty array when not found or value not array.【F:src/render.js†L982-L988】
  - Performance: Constant-time lookup.【F:src/render.js†L982-L988】
  - Units / spaces: Returns configuration objects; no direct units.【F:src/render.js†L982-L988】
  - Determinism: Deterministic for given track data.【F:src/render.js†L982-L988】
  - Keep / change / delete: Keep; centralises zone lookup. Alternative is to duplicate `data` access inside `renderScene`.【F:src/render.js†L1004-L1009】
  - Confidence / assumptions: High confidence; assumes track data uses either legacy `keyTexZones` or grouped `texZones`.【F:src/render.js†L982-L988】




- `renderScene`
  - Purpose: Main 3D render function—clears the frame, builds the draw list from the current camera frame, sorts items by depth, and draws them.【F:src/render.js†L990-L1018】
  - Inputs: None; pulls state from globals.【F:src/render.js†L990-L1018】
  - Outputs: None; drives renderer side effects.【F:src/render.js†L990-L1018】
  - Side effects: Begins/ends the GL frame, sorts draw list, and triggers draw-list rendering; early-outs if renderer or canvas missing.【F:src/render.js†L990-L1018】
  - Shared state touched and where it’s used: Called every frame from the game loop; updates perf tracker counts and relies on `buildWorldDrawList`, `enqueuePlayer`, and `renderDrawList`.【F:src/render.js†L1011-L1016】【F:src/render.js†L2103-L2126】
  - Dependencies: `glr`, `createCameraFrame`, `renderHorizon`, `segmentAtS`, `pctRem`, `zonesFor`, `buildWorldDrawList`, `enqueuePlayer`, `renderDrawList`.【F:src/render.js†L990-L1016】
  - Edge cases handled or missed: If base segment missing, ends frame immediately; assumes draw list sort stable for equal depth (JS sort stable).【F:src/render.js†L998-L1016】
  - Performance: Executes once per frame; overall cost depends on draw list size.【F:src/render.js†L990-L1018】
  - Units / spaces: Works in world/camera units converted by underlying helpers.【F:src/render.js†L995-L1172】
  - Determinism: Deterministic for given state snapshot (aside from potential floating sort tie).【F:src/render.js†L990-L1016】
  - Keep / change / delete: Keep; orchestrates rendering pipeline. Alternative is to inline all steps in the game loop, reducing modularity.【F:src/render.js†L2103-L2126】
  - Confidence / assumptions: High confidence; assumes `glr.begin/end` manage GL state correctly.【F:src/render.js†L990-L1018】




- `createCameraFrame`
  - Purpose: Gathers camera parameters (player position, camera offsets) for the current frame and applies tilt adjustments.【F:src/render.js†L1020-L1029】
  - Inputs: None; reads `state`.【F:src/render.js†L1020-L1029】
  - Outputs: Object `{ phys, sCar, sCam, camX, camY }`.【F:src/render.js†L1020-L1029】
  - Side effects: Calls `applyCameraTilt`, which mutates state camera roll/tilt.【F:src/render.js†L1020-L1049】
  - Shared state touched and where it’s used: Returned frame feeds `renderScene`; tilt updates affect renderer state.【F:src/render.js†L990-L1015】【F:src/render.js†L1032-L1049】
  - Dependencies: Uses `state.phys`, `camera` config, `roadWidthAt`, and `applyCameraTilt`.【F:src/render.js†L1020-L1049】
  - Edge cases handled or missed: Relies on `state.phys` existing; no fallback when player data invalid (renderScene would bail earlier).【F:src/render.js†L1020-L1034】
  - Performance: Constant-time per frame.【F:src/render.js†L1020-L1049】
  - Units / spaces: Track distances for `sCar/sCam`, screen offsets for `camX/camY`.【F:src/render.js†L1020-L1049】
  - Determinism: Deterministic for given state (tilt uses smoothing).【F:src/render.js†L1020-L1049】
  - Keep / change / delete: Keep; isolates camera parameter assembly. Alternative is to inline inside `renderScene`.【F:src/render.js†L990-L1015】
  - Confidence / assumptions: High confidence; assumes `state.phys` updated by gameplay each frame.【F:src/render.js†L1020-L1049】




- `applyCameraTilt`
  - Purpose: Updates camera roll and player tilt based on speed, upcoming curve, and lateral movement, then sets the renderer’s roll pivot.【F:src/render.js†L1032-L1049】
  - Inputs: Object `{ camX, camY, sCam, phys }` from `createCameraFrame`.【F:src/render.js†L1032-L1049】
  - Outputs: None; mutates `state.camRollDeg`, `state.playerTiltDeg`, and configures renderer.【F:src/render.js†L1032-L1049】
  - Side effects: Projects player body point, sets roll pivot on `glr`, smooths tilt state values.【F:src/render.js†L1032-L1049】
  - Shared state touched and where it’s used: Updates state consumed by player rendering and overlay; called once per frame.【F:src/render.js†L1032-L1049】【F:src/render.js†L1673-L1730】
  - Dependencies: `projectWorldPoint`, `clamp`, `segmentAtS`, `glr.setRollPivot`, state callbacks, and tilt configuration.【F:src/render.js†L1032-L1049】
  - Edge cases handled or missed: Falls back when additive tilt callback missing; ensures pivot stays within viewport limits.【F:src/render.js†L1032-L1049】
  - Performance: Constant-time per frame.【F:src/render.js†L1032-L1049】
  - Units / spaces: Works in degrees for tilt, radians for roll pivot, screen pixels for pivot coordinates.【F:src/render.js†L1032-L1049】
  - Determinism: Deterministic given same state inputs.【F:src/render.js†L1032-L1049】
  - Keep / change / delete: Keep; isolates camera dynamics. Alternative is to embed inside `createCameraFrame`.【F:src/render.js†L1020-L1049】
  - Confidence / assumptions: High confidence; assumes `state.getAdditiveTiltDeg` returns sensible values.【F:src/render.js†L1032-L1049】




- `buildWorldDrawList`
  - Purpose: Traverses visible segments to project road geometry, cliffs, cars, sprites, snow screens, and push them into a draw list sorted by depth.【F:src/render.js†L1051-L1332】
  - Inputs: `baseSeg`, `basePct`, `frame`, and `zoneData`.【F:src/render.js†L1051-L1172】
  - Outputs: Array of draw-list items (strips, NPCs, props, snow screens).【F:src/render.js†L1051-L1332】
  - Side effects: Registers segments with perf tracker, reads numerous state/config values.【F:src/render.js†L1078-L1327】【F:src/render.js†L337-L401】
  - Shared state touched and where it’s used: Called once per frame by `renderScene`; output consumed by `renderDrawList`.【F:src/render.js†L1011-L1016】【F:src/render.js†L1370-L1427】
  - Dependencies: Extensive—`projectSegPoint`, `makeCliff*`, `fogArray`, `boostZonesOnSegment`, `zonesFor`, `computeSnowScreenBaseRadius`, `spriteFarScaleFromZ`, `computeCliffLaneProgress`, `snowFieldFor`, `state.spriteMeta`, etc.【F:src/render.js†L1051-L1332】
  - Edge cases handled or missed: Skips segments behind near plane, handles looping track indices, clamps sprite offsets, and validates textures. Snow screens only added when enabled and within stride/distance limits.【F:src/render.js†L1074-L1327】
  - Performance: Hot path; loops across `track.drawDistance` segments every frame. Complexity tied to number of sprites/cars per segment.【F:src/render.js†L1051-L1332】
  - Units / spaces: Mix of world distances, camera space, and screen pixels; normalises everything to screen coordinates.【F:src/render.js†L1051-L1332】
  - Determinism: Deterministic for given state snapshot (aside from RNG-driven snow fields seeded deterministically).【F:src/render.js†L1051-L1332】
  - Keep / change / delete: Keep; core world assembly logic. Alternative is to split into smaller passes but still necessary central function.【F:src/render.js†L1051-L1332】
  - Confidence / assumptions: Medium confidence; complex function relying on many configs but behaviour well understood.【F:src/render.js†L1051-L1332】




- `enqueuePlayer`
  - Purpose: Projects the player car body/shadow, computes sprite samples, and pushes a player draw item onto the list when visible.【F:src/render.js†L1335-L1367】
  - Inputs: `drawList` array and `frame` from `createCameraFrame`.【F:src/render.js†L1335-L1367】
  - Outputs: None; appends to draw list when the player is in front of the camera.【F:src/render.js†L1335-L1367】
  - Side effects: Computes sprite UV samples and uses `state` to determine scale, tilt, and atlas data.【F:src/render.js†L1335-L1367】
  - Shared state touched and where it’s used: Adds a `player` item consumed by `renderDrawList`; reads `state.spriteMeta` and `state.getKindScale`.【F:src/render.js†L1335-L1370】【F:src/render.js†L1424-L1427】
  - Dependencies: `projectWorldPoint`, `roadWidthAt`, `floorElevationAt`, `computePlayerSpriteSamples`, `HALF_VIEW`, state helpers.【F:src/render.js†L1335-L1367】
  - Edge cases handled or missed: Ensures player behind near plane is skipped; clamps minimum width/height; handles missing texture by falling back to tint.【F:src/render.js†L1335-L1367】
  - Performance: Constant-time per frame (single player).【F:src/render.js†L1335-L1367】
  - Units / spaces: Screen pixels for width/height and Y positions; uses atlas UV coordinates.【F:src/render.js†L1335-L1367】
  - Determinism: Deterministic for given state snapshot.【F:src/render.js†L1335-L1367】
  - Keep / change / delete: Keep; isolates player enqueue logic. Alternative is to embed inside `buildWorldDrawList`.【F:src/render.js†L1335-L1367】
  - Confidence / assumptions: High confidence; assumes sprite metadata configured for the player atlas.【F:src/render.js†L1335-L1367】




- `renderDrawList`
  - Purpose: Iterates draw-list items, dispatching to specific renderers (road strips, NPCs, props, snow screens, player) and updating perf counters.【F:src/render.js†L1370-L1428】
  - Inputs: `drawList` array.【F:src/render.js†L1370-L1374】
  - Outputs: None; renders each item.【F:src/render.js†L1370-L1428】
  - Side effects: Registers perf statistics (`registerStrip`, `registerSprite`, etc.) and invokes draw helpers for each item.【F:src/render.js†L1370-L1428】【F:src/render.js†L337-L401】
  - Shared state touched and where it’s used: Called once per frame from `renderScene` after sorting.【F:src/render.js†L1014-L1016】
  - Dependencies: `renderStrip`, `drawBillboard`, `drawBillboardRotated`, `renderSnowScreen`, `renderPlayer`, and perf tracker.【F:src/render.js†L1370-L1428】
  - Edge cases handled or missed: Ignores unknown item types; handles empty list quickly.【F:src/render.js†L1370-L1428】
  - Performance: Linear in draw-list size.【F:src/render.js†L1370-L1428】
  - Units / spaces: Delegated to respective helpers.【F:src/render.js†L1370-L1428】
  - Determinism: Deterministic for given draw list (order after sort).【F:src/render.js†L1370-L1428】
  - Keep / change / delete: Keep; central dispatcher. Alternative is to render inline in `renderScene`.【F:src/render.js†L990-L1016】
  - Confidence / assumptions: High confidence; assumes draw-list items follow documented structure.【F:src/render.js†L1051-L1428】




- `renderSnowScreen`
  - Purpose: Renders a snow screen overlay with animated flakes, stretching them based on player speed and distance, respecting fog.【F:src/render.js†L1431-L1523】
  - Inputs: `item` containing `x,y,size,color,z,segIndex`.【F:src/render.js†L1431-L1499】
  - Outputs: None; draws a series of solid quads for flakes.【F:src/render.js†L1431-L1523】
  - Side effects: Calls `snowFieldFor`, computes animations, and draws each flake while updating perf counters.【F:src/render.js†L1439-L1522】【F:src/render.js†L385-L390】
  - Shared state touched and where it’s used: Invoked from `renderDrawList` for each snow-screen item when snow enabled.【F:src/render.js†L1421-L1424】
  - Dependencies: `glr`, `isSnowFeatureEnabled`, `fogArray`, `snowFieldFor`, `spriteFarScaleFromZ`, `computeSnowScreenBaseRadius`, `clamp`, `lerp`, `randomColorFor`, perf tracker.【F:src/render.js†L1431-L1522】
  - Edge cases handled or missed: Skips when snow disabled, size ≤0, or renderer missing; clamps stretch amount and handles empty flake arrays.【F:src/render.js†L1431-L1512】
  - Performance: Loops over flake count per screen; moderate but bounded by pool configuration.【F:src/render.js†L1431-L1523】
  - Units / spaces: Screen pixels for snow disc and flake positions; uses fog factors.【F:src/render.js†L1431-L1523】
  - Determinism: Deterministic per frame given deterministic snow fields and state (time influences animation).【F:src/render.js†L1431-L1523】
  - Keep / change / delete: Keep; specialised effect rendering. Alternative is to pre-render snow to texture, which is heavier work.【F:src/render.js†L1431-L1523】
  - Confidence / assumptions: Medium confidence; relies on consistent state.phys timing and flake counts but behaviour observed stable.【F:src/render.js†L1431-L1523】




- `renderStrip`
  - Purpose: Draws a road strip item, including road surface, cliffs, rails, and boost overlays, respecting debug fill modes.【F:src/render.js†L1526-L1670】
  - Inputs: Strip descriptor from draw list containing projected points, widths, UV spans, boost data, and cliff quads.【F:src/render.js†L1526-L1669】
  - Outputs: None; issues multiple draw calls per strip.【F:src/render.js†L1526-L1670】
  - Side effects: Uses `drawRoadStrip`, `drawBoostZonesOnStrip`, draws cliffs/rails via textured or solid quads, uses perf tracker for segments.【F:src/render.js†L1526-L1669】【F:src/render.js†L337-L399】
  - Shared state touched and where it’s used: Called from `renderDrawList` for each `strip` item.【F:src/render.js†L1375-L1379】
  - Dependencies: `areTexturesEnabled`, `padWithSpriteOverlap`, `fogArray`, `randomColorFor`, textures map, debug config.【F:src/render.js†L1526-L1669】
  - Edge cases handled or missed: Handles debug fill vs textured modes, ensures road drawn even when textures disabled, draws rails only when segment features include them.【F:src/render.js†L1605-L1669】
  - Performance: Per-strip cost includes multiple quads; major contributor to frame time but necessary for visuals.【F:src/render.js†L1526-L1669】
  - Units / spaces: Screen pixels and UV coordinates.【F:src/render.js†L1526-L1669】
  - Determinism: Deterministic for given strip data.【F:src/render.js†L1526-L1669】
  - Keep / change / delete: Keep; encapsulates complex strip rendering steps. Alternative is to break into sub-functions for cliffs/rails if refactoring later.【F:src/render.js†L1526-L1669】
  - Confidence / assumptions: Medium confidence due to complexity; behaviour battle-tested in gameplay.【F:src/render.js†L1526-L1669】




- `renderPlayer`
  - Purpose: Draws the player’s shadow and body quads with rotation, sampling atlas frames (including multi-sample blending) or fallback tint.【F:src/render.js†L1673-L1757】
  - Inputs: `item` produced by `enqueuePlayer` containing geometry, sprite data, and fog depths.【F:src/render.js†L1673-L1757】
  - Outputs: None; issues draw calls for shadow and body.【F:src/render.js†L1673-L1757】
  - Side effects: Uses `makeRotatedQuad`, reads sprite metadata, sorts samples to blend textures, and uses renderer for draws.【F:src/render.js†L1673-L1757】【F:src/gl/renderer.js†L259-L275】
  - Shared state touched and where it’s used: Called from `renderDrawList` when encountering the player item.【F:src/render.js†L1424-L1427】
  - Dependencies: `areTexturesEnabled`, `fogArray`, `makeRotatedQuad`, `atlasUvFromRowCol`, sprite metadata, `randomColorFor`.【F:src/render.js†L1673-L1757】
  - Edge cases handled or missed: Falls back to solid tint when textures disabled, ensures at least one sample even if sprite info missing.【F:src/render.js†L1673-L1757】
  - Performance: Constant-time per frame; limited to shadow + body draws and small sample loops.【F:src/render.js†L1673-L1757】
  - Units / spaces: Screen pixels for geometry; UV coordinates for atlas sampling.【F:src/render.js†L1673-L1757】
  - Determinism: Deterministic given the same player state and sprite metadata.【F:src/render.js†L1673-L1757】
  - Keep / change / delete: Keep; specialised player rendering logic. Alternative is to integrate into draw list but loses clarity.【F:src/render.js†L1370-L1427】
  - Confidence / assumptions: High confidence; assumes sprite metadata includes atlas info for player.【F:src/render.js†L1673-L1757】




- `computeDebugPanels`
  - Purpose: Calculates rectangles for the boost and elevation panels on the overlay canvas, leaving margins and padding for layout.【F:src/render.js†L1760-L1799】
  - Inputs: None; uses canvas dimensions and constants.【F:src/render.js†L1760-L1799】
  - Outputs: Object `{ boost, profile }` with panel geometry.【F:src/render.js†L1760-L1799】
  - Side effects: None.【F:src/render.js†L1760-L1799】
  - Shared state touched and where it’s used: Used by `renderOverlay` each frame to position debug panels.【F:src/render.js†L1888-L2030】
  - Dependencies: Panel margin constants and overlay canvas width/height (`SW`, `SH`).【F:src/render.js†L1760-L1799】
  - Edge cases handled or missed: Clamps profile width to non-negative area.【F:src/render.js†L1760-L1799】
  - Performance: Constant-time.【F:src/render.js†L1760-L1799】
  - Units / spaces: Overlay canvas pixels.【F:src/render.js†L1760-L1799】
  - Determinism: Deterministic for given canvas size.【F:src/render.js†L1760-L1799】
  - Keep / change / delete: Keep; centralises layout numbers. Alternative is inline calculations inside `renderOverlay`.【F:src/render.js†L1888-L2030】
  - Confidence / assumptions: High confidence; assumes overlay dimensions set during `attach`.【F:src/render.js†L2077-L2101】




- `worldToOverlay`
  - Purpose: Converts world distance/elevation into overlay canvas coordinates for plotting the elevation profile.【F:src/render.js†L1800-L1811】
  - Inputs: `s`, `y`, optional `panelRect`.【F:src/render.js†L1800-L1811】
  - Outputs: `{ x, y }` overlay coordinates.【F:src/render.js†L1800-L1811】
  - Side effects: None.【F:src/render.js†L1800-L1811】
  - Shared state touched and where it’s used: Used by `renderOverlay` when drawing the profile curve and marker.【F:src/render.js†L1916-L1930】
  - Dependencies: Track meter-to-pixel scaling, player state, panel padding constants.【F:src/render.js†L1800-L1811】
  - Edge cases handled or missed: Falls back to default positioning when panelRect missing, ensures non-zero inner dimensions via `Math.max(1, ...)`.【F:src/render.js†L1800-L1811】
  - Performance: Constant-time per point.【F:src/render.js†L1800-L1811】
  - Units / spaces: Outputs overlay pixels; inputs in track meters/elevation.【F:src/render.js†L1800-L1811】
  - Determinism: Deterministic for given state snapshot.【F:src/render.js†L1800-L1811】
  - Keep / change / delete: Keep; shared between curve plotting and crosshair. Alternative is duplicating conversion math inside overlay drawing.【F:src/render.js†L1916-L1930】
  - Confidence / assumptions: High confidence; assumes `track.metersPerPixel` configured.【F:src/render.js†L1800-L1811】




- `drawBoostCrossSection`
  - Purpose: Renders a cross-section panel showing active boost zones relative to lanes, including centre lines and player position marker.【F:src/render.js†L1812-L1887】
  - Inputs: `ctx` canvas context and optional `panelRect`.【F:src/render.js†L1812-L1887】
  - Outputs: None; draws onto overlay context.【F:src/render.js†L1812-L1887】
  - Side effects: Draws rectangles/lines, uses boost colours, and writes labels.【F:src/render.js†L1812-L1887】
  - Shared state touched and where it’s used: Called each frame by `renderOverlay`.【F:src/render.js†L1939-L1955】
  - Dependencies: `segmentAtS`, `boostZonesOnSegment`, `laneToRoadRatio`, `getZoneLaneBounds`, `mapRatio`, player state.【F:src/render.js†L1812-L1887】
  - Edge cases handled or missed: Skips drawing when panel has non-positive size or zone bounds missing; clamps lane mapping outputs.【F:src/render.js†L1812-L1887】
  - Performance: Constant-time per frame with modest loops (zones and columns).【F:src/render.js†L1812-L1887】
  - Units / spaces: Overlay pixels; uses lane ratios for horizontal mapping.【F:src/render.js†L1812-L1887】
  - Determinism: Deterministic for given track state.【F:src/render.js†L1812-L1887】
  - Keep / change / delete: Keep; encapsulates panel drawing. Alternative is to inline the drawing logic in `renderOverlay`.【F:src/render.js†L1888-L2030】
  - Confidence / assumptions: High confidence; assumes lane mapping helpers return valid ratios.【F:src/render.js†L1812-L1887】




- `mapRatio`
  - Purpose: Helper closure inside `drawBoostCrossSection` that maps a lane ratio (−1…1) into panel X coordinates.【F:src/render.js†L1843-L1854】
  - Inputs: `ratio` (number).【F:src/render.js†L1843-L1847】
  - Outputs: X coordinate in panel pixels.【F:src/render.js†L1843-L1854】
  - Side effects: None; closes over `roadX`/`roadW`.【F:src/render.js†L1833-L1854】
  - Shared state touched and where it’s used: Used multiple times within `drawBoostCrossSection` to place zone edges and player marker.【F:src/render.js†L1849-L1879】
  - Dependencies: Relies on computed panel geometry from outer function.【F:src/render.js†L1833-L1854】
  - Edge cases handled or missed: None beyond parent guard (panel width must be positive).【F:src/render.js†L1833-L1854】
  - Performance: Constant.【F:src/render.js†L1843-L1854】
  - Units / spaces: Overlay pixels.【F:src/render.js†L1843-L1854】
  - Determinism: Deterministic per ratio.【F:src/render.js†L1843-L1854】
  - Keep / change / delete: Keep; micro-helper that improves readability inside the panel function. Alternative is inline `roadX + ratio * roadW`.【F:src/render.js†L1843-L1854】
  - Confidence / assumptions: High confidence; closure scope stable.【F:src/render.js†L1833-L1854】




- `fmtSeconds`
  - Purpose: Formats a metric value in seconds with two decimals for overlay text, returning `'0.00s'` when value missing or ≤0.【F:src/render.js†L1942-L1945】
  - Inputs: `value` number.【F:src/render.js†L1942-L1945】
  - Outputs: String like `'1.23s'` or `'0.00s'`.【F:src/render.js†L1942-L1945】
  - Side effects: None.【F:src/render.js†L1942-L1945】
  - Shared state touched and where it’s used: Local helper within `renderOverlay` when composing debug lines.【F:src/render.js†L1957-L1983】
  - Dependencies: `Number.isFinite` and `toFixed`.【F:src/render.js†L1942-L1945】
  - Edge cases handled or missed: Clamps non-positive to `'0.00s'`; does not show milliseconds for extremely small positives (flooring).【F:src/render.js†L1942-L1945】
  - Performance: Constant.【F:src/render.js†L1942-L1945】
  - Units / spaces: Seconds displayed as string with `s` suffix.【F:src/render.js†L1942-L1945】
  - Determinism: Deterministic for given value.【F:src/render.js†L1942-L1945】
  - Keep / change / delete: Keep; small local helper clarifies formatting. Alternative is inline checks per metric.【F:src/render.js†L1957-L1983】
  - Confidence / assumptions: High confidence; assumes overlay metrics measured in seconds.【F:src/render.js†L1957-L1983】




- `fmtCount`
  - Purpose: Formats counters as non-negative integers, defaulting to 0 for invalid inputs.【F:src/render.js†L1946-L1947】
  - Inputs: `value` number.【F:src/render.js†L1946-L1947】
  - Outputs: Integer count.【F:src/render.js†L1946-L1947】
  - Side effects: None.【F:src/render.js†L1946-L1947】
  - Shared state touched and where it’s used: Used when composing overlay metrics (hits, pickups, counts).【F:src/render.js†L1957-L1983】
  - Dependencies: `Number.isFinite`, `Math.max`, `Math.floor`.【F:src/render.js†L1946-L1947】
  - Edge cases handled or missed: Floors negatives to 0; ignores decimals by floor.【F:src/render.js†L1946-L1947】
  - Performance: Constant.【F:src/render.js†L1946-L1947】
  - Units / spaces: Count values.【F:src/render.js†L1946-L1947】
  - Determinism: Deterministic per input.【F:src/render.js†L1946-L1947】
  - Keep / change / delete: Keep; prevents repeated guard logic. Alternative is inline guard for each metric.【F:src/render.js†L1957-L1983】
  - Confidence / assumptions: High confidence; assumes metrics meant to be counts.【F:src/render.js†L1957-L1983】




- `fmtSpeed`
  - Purpose: Formats speed metrics to one decimal, returning `'0.0'` when invalid or non-positive.【F:src/render.js†L1947-L1949】
  - Inputs: `value` number.【F:src/render.js†L1947-L1949】
  - Outputs: String (no suffix) representing speed.【F:src/render.js†L1947-L1949】
  - Side effects: None.【F:src/render.js†L1947-L1949】
  - Shared state touched and where it’s used: Adds to overlay debug lines (`Top speed`).【F:src/render.js†L1957-L1983】
  - Dependencies: `Number.isFinite`, `toFixed`.【F:src/render.js†L1947-L1949】
  - Edge cases handled or missed: Treats non-positive as zero string; does not add units (caller appends `u/s`).【F:src/render.js†L1947-L1949】
  - Performance: Constant.【F:src/render.js†L1947-L1949】
  - Units / spaces: Speed units defined by caller (units per second).【F:src/render.js†L1957-L1983】
  - Determinism: Deterministic per input.【F:src/render.js†L1947-L1949】
  - Keep / change / delete: Keep; avoids repeated formatting logic. Alternative is inline formatting per metric.【F:src/render.js†L1957-L1983】
  - Confidence / assumptions: High confidence; assumes positive values mean real speed.【F:src/render.js†L1957-L1983】




- `fmtFloat`
  - Purpose: Generic formatter returning a fixed-decimal string or fallback when value invalid, used for FPS and other floats.【F:src/render.js†L1951-L1953】
  - Inputs: `value`, optional `digits` and `fallback` string.【F:src/render.js†L1951-L1953】
  - Outputs: Formatted string.【F:src/render.js†L1951-L1953】
  - Side effects: None.【F:src/render.js†L1951-L1953】
  - Shared state touched and where it’s used: Used multiple times in debug metrics (FPS, frame time).【F:src/render.js†L1972-L1982】
  - Dependencies: `Number.isFinite`, `toFixed`.【F:src/render.js†L1951-L1953】
  - Edge cases handled or missed: Returns fallback when value invalid; default fallback `'0.0'`.【F:src/render.js†L1951-L1953】
  - Performance: Constant.【F:src/render.js†L1951-L1953】
  - Units / spaces: Formats floats; units defined by caller.【F:src/render.js†L1972-L1982】
  - Determinism: Deterministic per inputs.【F:src/render.js†L1951-L1953】
  - Keep / change / delete: Keep; reduces duplication when formatting multiple floats. Alternative is inline ternaries for each metric.【F:src/render.js†L1972-L1982】
  - Confidence / assumptions: High confidence; assumes digits parameter small.【F:src/render.js†L1951-L1953】




- `renderOverlay`
  - Purpose: Draws the 2D debug overlay, including elevation profile, boost cross-section, metrics list, and HUD text, while respecting overlay visibility toggles.【F:src/render.js†L1888-L2030】
  - Inputs: None; uses canvas contexts and state metrics.【F:src/render.js†L1888-L2030】
  - Outputs: None; renders to overlay and HUD canvases.【F:src/render.js†L1888-L2030】
  - Side effects: Clears overlay canvas, draws panels, text, and metrics; calls `syncOverlayVisibility`; writes HUD text to `ctxSide`.【F:src/render.js†L1888-L2030】
  - Shared state touched and where it’s used: Called once per frame after 3D rendering; uses perf tracker, gameplay metrics, and track profile data.【F:src/render.js†L1957-L2030】【F:src/render.js†L2103-L2126】
  - Dependencies: `syncOverlayVisibility`, `computeDebugPanels`, `drawBoostCrossSection`, `worldToOverlay`, format helpers, `computeCurvature`, metrics state.【F:src/render.js†L1888-L2030】
  - Edge cases handled or missed: No-ops when overlay hidden or canvas missing; clamps panel sizes and list height to canvas bounds.【F:src/render.js†L1888-L2030】
  - Performance: Runs once per frame; loops over a few dozen points for profile and metrics list—lightweight relative to 3D rendering.【F:src/render.js†L1888-L2030】
  - Units / spaces: Overlay pixels; uses track meters and seconds for metrics converted to strings.【F:src/render.js†L1888-L2030】
  - Determinism: Deterministic for given state metrics (random colours keyed).【F:src/render.js†L1888-L2030】
  - Keep / change / delete: Keep; central overlay routine. Alternative is to break into submodules if overlay grows.【F:src/render.js†L1888-L2030】
  - Confidence / assumptions: Medium confidence; depends on many state fields but behaviour is well-understood in overlay feature.【F:src/render.js†L1888-L2030】




- `start`
  - Purpose: Begins the reset matte animation, optionally configuring respawn parameters, and marks the matte as active.【F:src/render.js†L2032-L2041】
  - Inputs: `nextMode` (`'reset'` or `'respawn'`), `sForRespawn`, `nForRespawn`.【F:src/render.js†L2032-L2041】
  - Outputs: None.【F:src/render.js†L2032-L2041】
  - Side effects: Sets internal flags (`active`, `t`, `scale`, `mode`, respawn targets) and flips `state.resetMatteActive` true.【F:src/render.js†L2032-L2041】
  - Shared state touched and where it’s used: Called via `Renderer.matte.startReset/startRespawn` when gameplay triggers reset/respawn transitions.【F:src/render.js†L2103-L2136】【F:src/bootstrap.js†L40-L46】
  - Dependencies: Uses `state.phys` for default respawn location and `state.resetMatteActive`.【F:src/render.js†L2032-L2041】
  - Edge cases handled or missed: No-ops if already active; falls back to current player position when respawn parameters missing.【F:src/render.js†L2032-L2041】
  - Performance: Constant-time state updates.【F:src/render.js†L2032-L2041】
  - Units / spaces: Respawn distances in track units; scale is unitless.【F:src/render.js†L2032-L2041】
  - Determinism: Deterministic for given parameters.【F:src/render.js†L2032-L2041】
  - Keep / change / delete: Keep; encapsulates matte initialisation. Alternative is to replicate state resets in each public entry point.【F:src/render.js†L2132-L2136】
  - Confidence / assumptions: High confidence; assumes `state.phys` valid when starting matte.【F:src/render.js†L2032-L2041】




- `tick`
  - Purpose: Advances the reset matte animation each frame, executing callbacks when the cover reaches midpoint and clearing state when finished.【F:src/render.js†L2042-L2056】
  - Inputs: None; uses internal timer `t`.【F:src/render.js†L2042-L2056】
  - Outputs: None.【F:src/render.js†L2042-L2056】
  - Side effects: Updates animation scale, invokes `state.callbacks.onResetScene` or `Gameplay.respawnPlayerAt`, clears HUD canvas, and toggles `state.resetMatteActive` when done.【F:src/render.js†L2042-L2056】
  - Shared state touched and where it’s used: Called each frame from the render loop and exposed via `Renderer.matte.tick`.【F:src/render.js†L2112-L2136】
  - Dependencies: Uses timing constants, `state.callbacks`, `Gameplay.respawnPlayerAt`, and HUD canvas context.【F:src/render.js†L2042-L2056】
  - Edge cases handled or missed: Safely handles missing callbacks/resume functions by checking before calling; stops when `active` false.【F:src/render.js†L2042-L2056】
  - Performance: Constant-time per frame.【F:src/render.js†L2042-L2056】
  - Units / spaces: Frame counts for animation; respawn distances passed through unchanged.【F:src/render.js†L2042-L2056】
  - Determinism: Deterministic for given start state.【F:src/render.js†L2042-L2056】
  - Keep / change / delete: Keep; central to matte timing. Alternative is to integrate into main loop manually.【F:src/render.js†L2103-L2136】
  - Confidence / assumptions: High confidence; assumes `requestAnimationFrame` cadence drives tick consistently.【F:src/render.js†L2042-L2056】




- `draw`
  - Purpose: Renders the circular matte on the HUD canvas according to the current animation scale, cutting a hole when active.【F:src/render.js†L2057-L2068】
  - Inputs: None.【F:src/render.js†L2057-L2068】
  - Outputs: None; draws to `ctxHUD`.【F:src/render.js†L2057-L2068】
  - Side effects: Clears HUD canvas, fills black, and punches out a circle using `destination-out` blending when radius >0.【F:src/render.js†L2057-L2068】
  - Shared state touched and where it’s used: Called from render loop after `renderOverlay` and exposed via `Renderer.matte.draw`.【F:src/render.js†L2119-L2136】
  - Dependencies: Uses HUD canvas context and cached radius constant.【F:src/render.js†L2057-L2068】
  - Edge cases handled or missed: No-ops when matte inactive or HUD context missing.【F:src/render.js†L2057-L2068】
  - Performance: Constant-time per frame; simple canvas operations.【F:src/render.js†L2057-L2068】
  - Units / spaces: HUD canvas pixels; radius computed from canvas diagonal.【F:src/render.js†L2057-L2068】
  - Determinism: Deterministic for given animation state.【F:src/render.js†L2057-L2068】
  - Keep / change / delete: Keep; isolates matte drawing. Alternative is to draw matte inside main overlay function.【F:src/render.js†L1888-L2056】
  - Confidence / assumptions: High confidence; assumes HUD canvas initialised in `attach`.【F:src/render.js†L2077-L2100】




- `startReset`
  - Purpose: Public API that triggers the reset matte animation in reset mode by delegating to `resetMatte.start('reset')`.【F:src/render.js†L2132-L2134】
  - Inputs: None.【F:src/render.js†L2133-L2134】
  - Outputs: None.【F:src/render.js†L2133-L2134】
  - Side effects: Starts matte via `start`.【F:src/render.js†L2132-L2134】
  - Shared state touched and where it’s used: Called from bootstrap reset handlers when gameplay requests a full reset.【F:src/bootstrap.js†L40-L44】
  - Dependencies: `resetMatte.start`.【F:src/render.js†L2133-L2134】
  - Edge cases handled or missed: Relies on `start` guard to avoid reentry.【F:src/render.js†L2032-L2038】
  - Performance: Constant.【F:src/render.js†L2133-L2134】
  - Units / spaces: N/A.【F:src/render.js†L2133-L2134】
  - Determinism: Same as `start`.【F:src/render.js†L2032-L2041】
  - Keep / change / delete: Keep; provides semantic API for reset transitions. Alternative is to call `resetMatte.start('reset')` directly wherever needed.【F:src/render.js†L2132-L2134】
  - Confidence / assumptions: High confidence; wrapper only.【F:src/render.js†L2133-L2134】




- `startRespawn`
  - Purpose: Public API to launch the matte in respawn mode with target distance/offset.【F:src/render.js†L2132-L2136】
  - Inputs: `s`, optional `n` lane offset.【F:src/render.js†L2134-L2135】
  - Outputs: None.【F:src/render.js†L2134-L2135】
  - Side effects: Delegates to `resetMatte.start('respawn', s, n)`.【F:src/render.js†L2134-L2135】
  - Shared state touched and where it’s used: Called when gameplay triggers respawn transitions via bootstrap or gameplay logic.【F:src/bootstrap.js†L44-L46】【F:src/gameplay.js†L2405-L2450】
  - Dependencies: `resetMatte.start`.【F:src/render.js†L2134-L2135】
  - Edge cases handled or missed: Follows `start` guard; defaults lane offset to 0 at call site.【F:src/render.js†L2134-L2135】
  - Performance: Constant.【F:src/render.js†L2134-L2135】
  - Units / spaces: Uses track distance/lane offset units.【F:src/render.js†L2134-L2135】
  - Determinism: Same as `start`.【F:src/render.js†L2032-L2041】
  - Keep / change / delete: Keep; clearer API for respawn transitions. Alternative is to call `resetMatte.start` with mode arguments directly.【F:src/render.js†L2132-L2136】
  - Confidence / assumptions: High confidence; minimal wrapper.【F:src/render.js†L2134-L2135】




- `attach`
  - Purpose: Wires the renderer to WebGL and overlay canvases, storing contexts, wrapping the renderer with perf tracking, and computing canvas dimensions/radii.【F:src/render.js†L2077-L2101】
  - Inputs: `glRenderer` object and `dom` container with `canvas`, `overlay`, `hud`.【F:src/render.js†L2077-L2083】
  - Outputs: None.【F:src/render.js†L2077-L2101】
  - Side effects: Sets module-level renderer/canvas references, initialises overlay/HUD contexts, updates dimensions, runs `syncOverlayVisibility(true)`, and computes HUD cover radius.【F:src/render.js†L2077-L2101】
  - Shared state touched and where it’s used: Invoked during bootstrap to initialise rendering; stored contexts used by subsequent render passes.【F:src/bootstrap.js†L55-L65】【F:src/render.js†L990-L2136】
  - Dependencies: Perf tracker `wrapRenderer`, canvas contexts, `syncOverlayVisibility`.【F:src/render.js†L2077-L2101】
  - Edge cases handled or missed: Gracefully handles missing overlay/HUD canvases by skipping related setup; assumes `canvas3D` exists to set dimensions.【F:src/render.js†L2077-L2101】
  - Performance: One-time initialisation with a few canvas operations.【F:src/render.js†L2077-L2101】
  - Units / spaces: Canvas pixel dimensions stored for later conversions.【F:src/render.js†L2077-L2101】
  - Determinism: Deterministic for given DOM inputs.【F:src/render.js†L2077-L2101】
  - Keep / change / delete: Keep; centralises renderer setup. Alternative is to perform setup scattered across bootstrap code.【F:src/bootstrap.js†L55-L65】
  - Confidence / assumptions: High confidence; assumes DOM canvases sized correctly before attach.【F:src/render.js†L2077-L2101】




- `frame`
  - Purpose: Starts the main game loop using `requestAnimationFrame`, implementing fixed-step physics with variable render timing, and orchestrating per-frame rendering and matte updates.【F:src/render.js†L2103-L2127】
  - Inputs: `stepFn` callback for fixed physics step.【F:src/render.js†L2103-L2124】
  - Outputs: None.【F:src/render.js†L2103-L2127】
  - Side effects: Schedules RAF loop, accumulates delta time, calls `stepFn` in fixed increments, updates perf tracker, renders scene/overlay, ticks/draws reset matte, and updates boost flash timer.【F:src/render.js†L2103-L2127】
  - Shared state touched and where it’s used: Invoked by bootstrap to start the game; loop mutates global `state` via `stepFn` and matte updates.【F:src/bootstrap.js†L77-L83】【F:src/render.js†L2103-L2127】
  - Dependencies: `performance.now`, `requestAnimationFrame`, perf tracker, `renderScene`, `renderOverlay`, `resetMatte`.【F:src/render.js†L2103-L2127】
  - Edge cases handled or missed: Clamps delta to 0.25s to avoid spiral of death; ensures `stepFn` exists before invoking; does not handle pausing internally (handled elsewhere).【F:src/render.js†L2103-L2124】
  - Performance: Runs every animation frame; cost dominated by rendering and physics steps.【F:src/render.js†L2103-L2127】
  - Units / spaces: Time measured in seconds; physics step fixed at 1/60.【F:src/render.js†L2103-L2124】
  - Determinism: Deterministic for given `stepFn` and timing inputs (floating rounding aside).【F:src/render.js†L2103-L2127】
  - Keep / change / delete: Keep; core game loop orchestrator. Alternative is to manage loop outside renderer module.【F:src/bootstrap.js†L77-L83】
  - Confidence / assumptions: High confidence; widely used pattern for fixed-step update with variable render.【F:src/render.js†L2103-L2127】




- `loop`
  - Purpose: Inner RAF callback defined within `frame` that processes accumulated time, runs physics steps, renders the scene/overlay, updates matte, and schedules the next frame.【F:src/render.js†L2106-L2125】
  - Inputs: `now` timestamp from RAF.【F:src/render.js†L2106-L2125】
  - Outputs: None.【F:src/render.js†L2106-L2125】
  - Side effects: Same as `frame`—updates accumulators, perf tracker, rendering, matte, and boost flash timer—then calls `requestAnimationFrame(loop)`.【F:src/render.js†L2106-L2125】
  - Shared state touched and where it’s used: Created inside `frame`; not exposed externally but drives the entire runtime loop.【F:src/render.js†L2103-L2127】
  - Dependencies: Captures `stepFn`, `perf`, `renderScene`, `renderOverlay`, `resetMatte`.【F:src/render.js†L2103-L2125】
  - Edge cases handled or missed: Clamps `dt`, guards `stepFn` before calling; ensures matte tick/draw run even if no physics steps executed.【F:src/render.js†L2106-L2124】
  - Performance: Executes every RAF tick; same cost as frame orchestration.【F:src/render.js†L2106-L2125】
  - Units / spaces: Time in seconds; same as `frame`.【F:src/render.js†L2106-L2124】
  - Determinism: Deterministic for given callback and browser timing sequence.【F:src/render.js†L2106-L2125】
  - Keep / change / delete: Keep; essential part of the RAF loop. Alternative is to expose loop externally, losing closure benefits.【F:src/render.js†L2103-L2127】
  - Confidence / assumptions: High confidence; assumes browser provides `performance.now` and RAF.【F:src/render.js†L2103-L2125】

### 3.8 WebGL Renderer (`src/gl/renderer.js`)



- `constructor`
  - Purpose: Configures the WebGL renderer by acquiring a context, compiling shaders, caching attribute/uniform lookups, seeding a streaming vertex buffer, and creating the fallback white texture and fog defaults used by draw helpers.【F:src/gl/renderer.js†L15-L104】
  - Inputs: `canvas` HTMLCanvasElement providing `width`/`height` and a `getContext('webgl', ...)` hook; assumes numeric dimensions and a valid DOM canvas.【F:src/gl/renderer.js†L15-L77】
  - Outputs: None; initialises instance fields such as `gl`, `prog`, buffer handles, fog caches, and `whiteTex`.【F:src/gl/renderer.js†L15-L104】
  - Side effects: Requests a WebGL context, compiles/links shaders, binds and initialises buffers, sets blend/viewport state, seeds fog uniforms, and throws if context creation or shader compilation fails.【F:src/gl/renderer.js†L15-L118】
  - Shared state touched and where it’s used: Instances are constructed during bootstrap (`src/bootstrap.js:7-35`) and expose `whiteTex`/draw methods consumed throughout the renderer (`src/render.js:728-1767`).【F:src/bootstrap.js†L7-L35】【F:src/gl/renderer.js†L190-L198】【F:src/render.js†L728-L1767】
  - Dependencies: Relies on `_createProgram`, `_makeWhiteTex`, and WebGL APIs such as `createBuffer`, `viewport`, and uniform setters to prepare GPU state.【F:src/gl/renderer.js†L57-L170】
  - Edge cases handled or missed: Throws immediately when WebGL is unavailable or shader/program compilation fails; does not implement recovery for lost contexts or shader rebuilds.【F:src/gl/renderer.js†L15-L118】
  - Performance: One-time cost dominated by shader compilation and buffer allocation during startup.【F:src/bootstrap.js†L7-L35】【F:src/gl/renderer.js†L57-L118】
  - Units / spaces: Stores pivot positions and viewport sizes in canvas pixels and expects color components in normalized `[0,1]` RGBA space.【F:src/gl/renderer.js†L60-L170】
  - Determinism: Deterministic for a fixed canvas and shader source; runtime differences stem only from browser WebGL implementations.【F:src/gl/renderer.js†L15-L170】
  - Keep / change / delete: Keep; centralises GL bootstrap logic. Alternative would spread context setup across bootstrap/render modules, increasing coupling.【F:src/bootstrap.js†L7-L35】
  - Confidence / assumptions: High confidence; assumes a standard WebGL 1.0 environment and valid shader sources.【F:src/gl/renderer.js†L15-L118】



- `_createShader`
  - Purpose: Compiles a GLSL shader of the requested type using the renderer’s WebGL context, surfacing compilation errors via thrown exceptions.【F:src/gl/renderer.js†L105-L109】
  - Inputs: `src` shader source string and `type` (`gl.VERTEX_SHADER`/`gl.FRAGMENT_SHADER`).【F:src/gl/renderer.js†L105-L109】
  - Outputs: Returns the compiled `WebGLShader` on success.【F:src/gl/renderer.js†L105-L109】
  - Side effects: Calls `gl.createShader`, uploads/compiles source, and inspects compile status, throwing with the info log when compilation fails.【F:src/gl/renderer.js†L105-L109】
  - Shared state touched and where it’s used: Invoked exclusively by `_createProgram` during renderer construction (`src/gl/renderer.js:111-115`).【F:src/gl/renderer.js†L111-L115】
  - Dependencies: Requires a valid `this.gl` WebGL context and uses `getShaderParameter`/`getShaderInfoLog` for diagnostics.【F:src/gl/renderer.js†L105-L109】
  - Edge cases handled or missed: Handles compilation failures but assumes the context remains valid and does not attempt retries.【F:src/gl/renderer.js†L105-L109】
  - Performance: Called twice at startup (vertex + fragment shader); negligible outside load time.【F:src/gl/renderer.js†L57-L115】
  - Units / spaces: Operates on shader source text; no spatial units involved.【F:src/gl/renderer.js†L105-L109】
  - Determinism: Deterministic for identical source and driver state, aside from driver-specific optimisation differences.【F:src/gl/renderer.js†L105-L109】
  - Keep / change / delete: Keep; helper avoids duplicating compile boilerplate for each shader stage.【F:src/gl/renderer.js†L57-L115】
  - Confidence / assumptions: High confidence; thin wrapper around standard WebGL calls.【F:src/gl/renderer.js†L105-L109】



- `_createProgram`
  - Purpose: Builds a linked shader program from vertex/fragment sources, attaching compiled shaders and validating link success.【F:src/gl/renderer.js†L111-L117】
  - Inputs: `vs` vertex shader source, `fs` fragment shader source (strings).【F:src/gl/renderer.js†L111-L116】
  - Outputs: Returns a linked `WebGLProgram`.【F:src/gl/renderer.js†L111-L117】
  - Side effects: Attaches compiled shaders, links the program, and throws if linking fails; also consumes compiled shader objects from `_createShader`.【F:src/gl/renderer.js†L111-L117】
  - Shared state touched and where it’s used: Called once by the constructor to initialise `this.prog` before attribute/uniform lookup.【F:src/gl/renderer.js†L57-L70】
  - Dependencies: Depends on `_createShader` for compilation and on WebGL program APIs (`attachShader`, `linkProgram`, `getProgramParameter`).【F:src/gl/renderer.js†L111-L117】
  - Edge cases handled or missed: Propagates link errors via exceptions but does not delete partially created resources on failure.【F:src/gl/renderer.js†L111-L117】
  - Performance: Single startup link operation; negligible during gameplay.【F:src/gl/renderer.js†L57-L118】
  - Units / spaces: None—operates on shader/program objects.【F:src/gl/renderer.js†L111-L117】
  - Determinism: Deterministic given identical sources and WebGL driver behaviour.【F:src/gl/renderer.js†L111-L117】
  - Keep / change / delete: Keep; encapsulates shader program creation for clarity. Alternative would inline into constructor, reducing readability.【F:src/gl/renderer.js†L57-L117】
  - Confidence / assumptions: High confidence; follows standard WebGL program setup.【F:src/gl/renderer.js†L111-L117】



- `_makeWhiteTex`
  - Purpose: Creates a 1×1 RGBA white texture used as the default when drawing solids without external textures.【F:src/gl/renderer.js†L119-L127】
  - Inputs: None; relies on the renderer’s WebGL context.【F:src/gl/renderer.js†L119-L124】
  - Outputs: Returns a `WebGLTexture` handle configured with repeat wrap and nearest filtering.【F:src/gl/renderer.js†L119-L126】
  - Side effects: Allocates/binds a texture, uploads a single white pixel, and sets sampler parameters.【F:src/gl/renderer.js†L119-L126】
  - Shared state touched and where it’s used: Stored on `this.whiteTex` during construction and reused by `drawQuadSolid` as a solid fill surrogate.【F:src/gl/renderer.js†L103-L104】【F:src/gl/renderer.js†L194-L198】
  - Dependencies: Requires WebGL texture APIs (`createTexture`, `bindTexture`, `texImage2D`, `texParameteri`).【F:src/gl/renderer.js†L119-L126】
  - Edge cases handled or missed: Assumes texture creation succeeds; does not guard against context loss or NPOT restrictions (texture is 1×1).【F:src/gl/renderer.js†L119-L126】
  - Performance: Single allocation during startup; negligible runtime impact.【F:src/gl/renderer.js†L119-L126】
  - Units / spaces: Texture space is UV-based; pixel data uses 0–255 byte values for RGBA.【F:src/gl/renderer.js†L119-L126】
  - Determinism: Deterministic; always produces the same white texel.【F:src/gl/renderer.js†L119-L126】
  - Keep / change / delete: Keep; avoids rebuilding dummy textures for every solid draw. Alternative is to construct ad hoc solid quads on CPU.【F:src/gl/renderer.js†L194-L198】
  - Confidence / assumptions: High confidence; standard technique for solid-color quads.【F:src/gl/renderer.js†L119-L127】



- `loadTexture`
  - Purpose: Asynchronously loads an image, uploads it to WebGL, and resolves with a configured texture for use in draw calls.【F:src/gl/renderer.js†L129-L147】
  - Inputs: `url` string pointing to the image resource; expects reachable image data.【F:src/gl/renderer.js†L129-L146】
  - Outputs: Resolves to a `WebGLTexture` on success or `null` if loading fails.【F:src/gl/renderer.js†L129-L146】
  - Side effects: Creates an `Image`, performs GPU texture uploads, and sets sampler parameters; leaves texture bound to `TEXTURE_2D` on the renderer context during setup.【F:src/gl/renderer.js†L129-L145】
  - Shared state touched and where it’s used: Called while preloading manifests in bootstrap to populate `World.assets.textures` before rendering begins.【F:src/bootstrap.js†L18-L35】
  - Dependencies: Uses DOM `Image`, WebGL texture APIs, and respects `gl.pixelStorei` for premultiplied alpha settings.【F:src/gl/renderer.js†L129-L143】
  - Edge cases handled or missed: Resolves `null` on `onerror` but does not reject the promise; assumes CORS via `crossOrigin = 'anonymous'` suffices.【F:src/gl/renderer.js†L132-L146】
  - Performance: Bounded by network/image decode and GPU upload; typically run during loading screens, not per-frame.【F:src/bootstrap.js†L18-L35】
  - Units / spaces: Uploads textures in pixel space; UV usage determined later by draw calls.【F:src/gl/renderer.js†L136-L145】
  - Determinism: Deterministic for a given URL and image content.【F:src/gl/renderer.js†L129-L146】
  - Keep / change / delete: Keep; central loader ensures consistent texture parameters. Alternative is duplicating texture setup in asset pipeline.【F:src/bootstrap.js†L18-L35】
  - Confidence / assumptions: High confidence; assumes images are power-of-two friendly or rely on repeat wrap as configured.【F:src/gl/renderer.js†L136-L145】



- `begin`
  - Purpose: Prepares the frame by resizing the viewport if needed, clearing the color buffer, positioning the roll pivot, and updating fog uniforms from configuration.【F:src/gl/renderer.js†L149-L170】
  - Inputs: Optional `clear` RGBA array (defaults to `[0.9,0.95,1.0,1]`).【F:src/gl/renderer.js†L149-L161】
  - Outputs: None; sets GL state for subsequent draw calls.【F:src/gl/renderer.js†L149-L170】
  - Side effects: Adjusts cached canvas dimensions, updates uniforms (`u_viewSize`, `u_pivot`, fog), performs `gl.viewport`/`gl.clearColor`/`gl.clear`, and reads `window.Config.fog`.【F:src/gl/renderer.js†L149-L170】
  - Shared state touched and where it’s used: Invoked each frame before world rendering (`src/render.js:990-1017`) and exercised by the resize smoke test (`test/glrenderer.resize.test.js:34-58`).【F:src/render.js†L990-L1017】【F:test/glrenderer.resize.test.js†L34-L58】
  - Dependencies: Requires `window.Config` fog settings and WebGL calls (`viewport`, `uniform2f`, `clearColor`, `clear`).【F:src/gl/renderer.js†L149-L170】
  - Edge cases handled or missed: Detects canvas resizes to refresh `u_viewSize`; defaults fog values when config is missing but does not debounce frequent size changes beyond simple caching.【F:src/gl/renderer.js†L153-L170】
  - Performance: Called once per frame; work scales with uniform updates and clear operations (constant-time).【F:src/render.js†L990-L1017】
  - Units / spaces: Colors expressed in normalized floats; pivot derived from canvas pixel coordinates (center x, 82% height y).【F:src/gl/renderer.js†L149-L170】
  - Determinism: Deterministic for given canvas size and fog config; reliant on external config state.【F:src/gl/renderer.js†L149-L170】
  - Keep / change / delete: Keep; encapsulates per-frame GL housekeeping. Alternative would force renderers to repeat viewport/clear logic inline.【F:src/render.js†L990-L1017】
  - Confidence / assumptions: High confidence; validated via resize test ensuring uniform updates when the canvas changes.【F:test/glrenderer.resize.test.js†L34-L58】



- `setRollPivot`
  - Purpose: Updates the roll angle uniform and pivot coordinates used by the vertex shader to rotate quads around a screen-space pivot.【F:src/gl/renderer.js†L172-L172】
  - Inputs: `rad` roll angle in radians, `px`/`py` pivot coordinates in pixels.【F:src/gl/renderer.js†L172-L172】
  - Outputs: None; writes to shader uniforms.【F:src/gl/renderer.js†L172-L172】
  - Side effects: Calls `gl.uniform1f`/`uniform2f` to update `u_roll` and `u_pivot`.【F:src/gl/renderer.js†L172-L172】
  - Shared state touched and where it’s used: Called when applying camera tilt each frame to pivot the world around the player horizon (`src/render.js:1032-1048`).【F:src/render.js†L1032-L1048】
  - Dependencies: Relies on shader uniforms initialised during construction.【F:src/gl/renderer.js†L60-L170】
  - Edge cases handled or missed: Assumes numeric inputs; does not clamp angles or validate pivot bounds.【F:src/gl/renderer.js†L172-L172】
  - Performance: Constant-time uniform updates per frame when tilt changes.【F:src/render.js†L1032-L1048】
  - Units / spaces: Angle in radians; pivot coordinates in canvas pixels matching vertex shader expectations.【F:src/gl/renderer.js†L25-L36】【F:src/gl/renderer.js†L172-L172】
  - Determinism: Deterministic given inputs; idempotent for repeated values.【F:src/gl/renderer.js†L172-L172】
  - Keep / change / delete: Keep; isolates shader uniform plumbing from camera logic. Alternative would inline uniform calls inside renderer, reducing reuse.【F:src/render.js†L1032-L1048】
  - Confidence / assumptions: High confidence; thin wrapper around straightforward uniform writes.【F:src/gl/renderer.js†L172-L172】



- `drawQuadTextured`
  - Purpose: Streams a single quad worth of vertices with per-vertex tint and fog into the shared VBO, binds the chosen texture (or fallback), and issues a triangle draw.【F:src/gl/renderer.js†L173-L193】
  - Inputs: `tex` (`WebGLTexture` or falsy), `quad` object with `x1..x4`/`y1..y4` pixel coordinates, `uv` struct with `u1..u4`/`v1..v4`, optional `tint` RGBA array, optional `fog` array of four fog weights.【F:src/gl/renderer.js†L173-L193】
  - Outputs: None; enqueues geometry to GPU.【F:src/gl/renderer.js†L173-L193】
  - Side effects: Writes into `this.slab` Float32Array, updates the GL array buffer via `bufferSubData`, binds texture unit 0, toggles `u_useTex`, and draws two triangles covering the quad.【F:src/gl/renderer.js†L173-L193】
  - Shared state touched and where it’s used: Core draw path for nearly every world element including parallax layers, road strips, rails, cliffs, and sprites (`src/render.js:728-1767`).【F:src/render.js†L728-L813】【F:src/render.js†L906-L941】【F:src/render.js†L1645-L1767】
  - Dependencies: Uses WebGL buffer, texture, and draw APIs; depends on constructor-initialised VBO/uniforms and default tint/fog constants.【F:src/gl/renderer.js†L3-L193】
  - Edge cases handled or missed: Falls back to identity tint/fog when omitted and uses `whiteTex` when `tex` is falsy; does not validate quad winding or NaN coordinates.【F:src/gl/renderer.js†L174-L191】
  - Performance: Executes per draw call; writes 54 floats and performs a single `gl.drawArrays`—hot path in the render loop.【F:src/gl/renderer.js†L173-L193】【F:src/render.js†L728-L1767】
  - Units / spaces: Quad coordinates are screen pixels; UVs are unit texture coordinates; fog values treated as unitless blend factors.【F:src/gl/renderer.js†L173-L193】
  - Determinism: Deterministic given identical inputs and GL state; floating precision may vary slightly across hardware.【F:src/gl/renderer.js†L173-L193】
  - Keep / change / delete: Keep; foundational draw primitive. Alternative would require batching multiple quads per submission, which is a broader redesign.【F:src/render.js†L728-L1767】
  - Confidence / assumptions: High confidence; heavily exercised by render loop.【F:src/render.js†L728-L1767】



- `drawQuadSolid`
  - Purpose: Convenience wrapper that renders a solid-colored quad (with optional fog) by delegating to `drawQuadTextured` using the shared white texture and unit UVs.【F:src/gl/renderer.js†L194-L198】
  - Inputs: `quad` coordinates, optional `color` RGBA array, optional `fog` array.【F:src/gl/renderer.js†L194-L198】
  - Outputs: None.【F:src/gl/renderer.js†L194-L198】
  - Side effects: Calls `drawQuadTextured` with `this.whiteTex`, default solid color (`[1,0,0,1]`) when unspecified, and default fog array.【F:src/gl/renderer.js†L194-L198】
  - Shared state touched and where it’s used: Used whenever textured rendering is disabled or fallback shading is needed for roads, cliffs, sprites, and debug quads (`src/render.js:728-1767`).【F:src/render.js†L728-L813】【F:src/render.js†L1581-L1598】【F:src/render.js†L1645-L1767】
  - Dependencies: Relies on `drawQuadTextured`, `UNIT_UV`, and `this.whiteTex`.【F:src/gl/renderer.js†L7-L198】
  - Edge cases handled or missed: Provides reasonable defaults but assumes callers supply sensible quad geometry; inherits textured path limitations.【F:src/gl/renderer.js†L194-L198】
  - Performance: Same cost as a textured draw; invoked frequently when textures are disabled or solid fills are desired.【F:src/gl/renderer.js†L194-L198】【F:src/render.js†L728-L1767】
  - Units / spaces: Same as `drawQuadTextured` (pixels for geometry, unitless tint/fog values).【F:src/gl/renderer.js†L173-L198】
  - Determinism: Deterministic given inputs.【F:src/gl/renderer.js†L194-L198】
  - Keep / change / delete: Keep; avoids duplicating tint/fog packing for solid draws. Alternative would require callers to manage textures manually.【F:src/render.js†L728-L1767】
  - Confidence / assumptions: High confidence; extensively used in current renderer.【F:src/render.js†L728-L1767】



- `makeCircleTex`
  - Purpose: Generates a radial-gradient circle texture on an offscreen canvas and uploads it to WebGL, useful for particle or glow effects.【F:src/gl/renderer.js†L199-L216】
  - Inputs: Optional `size` (pixels, defaults to `64`); expects positive integers for reasonable quality.【F:src/gl/renderer.js†L199-L216】
  - Outputs: Returns a `WebGLTexture` with clamp-to-edge wrap and nearest filtering.【F:src/gl/renderer.js†L199-L215】
  - Side effects: Allocates a DOM canvas, paints a gradient, uploads it to the GPU, and configures sampler parameters.【F:src/gl/renderer.js†L199-L215】
  - Shared state touched and where it’s used: Exported on `RenderGL` but currently has no runtime call sites in the repo (available for future sprite/particle systems).【F:src/gl/renderer.js†L199-L216】【F:src/gl/renderer.js†L270-L271】
  - Dependencies: Requires DOM canvas 2D context and WebGL texture APIs.【F:src/gl/renderer.js†L199-L215】
  - Edge cases handled or missed: Assumes canvas creation succeeds and does not validate negative/zero sizes beyond whatever canvas enforces.【F:src/gl/renderer.js†L199-L215】
  - Performance: Intended for occasional asset generation; work scales with `size^2` due to canvas fill but typically done off the main loop.【F:src/gl/renderer.js†L199-L215】
  - Units / spaces: Texture coordinates remain unit-based; size parameter directly sets pixel resolution.【F:src/gl/renderer.js†L199-L216】
  - Determinism: Deterministic gradient for a given size.【F:src/gl/renderer.js†L199-L216】
  - Keep / change / delete: Keep; handy utility despite no current callers. Simplest alternative is to ship a baked circle sprite asset.【F:src/gl/renderer.js†L199-L216】
  - Confidence / assumptions: High confidence; straightforward texture generation routine.【F:src/gl/renderer.js†L199-L216】



- `end`
  - Purpose: Placeholder terminator for the render pass; currently a no-op reserved for future teardown or post-frame bookkeeping.【F:src/gl/renderer.js†L218-L218】
  - Inputs: None.【F:src/gl/renderer.js†L218-L218】
  - Outputs: None.【F:src/gl/renderer.js†L218-L218】
  - Side effects: None today.【F:src/gl/renderer.js†L218-L218】
  - Shared state touched and where it’s used: Called after world rendering to keep the begin/end pairing explicit (`src/render.js:990-1017`).【F:src/render.js†L990-L1017】
  - Dependencies: None beyond class context.【F:src/gl/renderer.js†L218-L218】
  - Edge cases handled or missed: N/A—does nothing.【F:src/gl/renderer.js†L218-L218】
  - Performance: Negligible.【F:src/gl/renderer.js†L218-L218】
  - Units / spaces: N/A.【F:src/gl/renderer.js†L218-L218】
  - Determinism: N/A.【F:src/gl/renderer.js†L218-L218】
  - Keep / change / delete: Keep for symmetry; alternative is to remove and adjust callers, but that would reduce clarity around frame lifecycle.【F:src/render.js†L990-L1017】
  - Confidence / assumptions: High confidence; inert stub.【F:src/gl/renderer.js†L218-L218】



- `padQuad`
  - Purpose: Returns a new quad expanded by configurable padding along each edge, ensuring sprites overlap cleanly regardless of vertex ordering.【F:src/gl/renderer.js†L221-L256】
  - Inputs: `q` quad with `x1..x4`/`y1..y4`; optional padding object `{ padLeft, padRight, padTop, padBottom }` (defaults to `0`).【F:src/gl/renderer.js†L221-L249】
  - Outputs: New quad object with adjusted coordinates.【F:src/gl/renderer.js†L242-L256】
  - Side effects: Pure function—allocates and returns a new object without mutating the input.【F:src/gl/renderer.js†L221-L256】
  - Shared state touched and where it’s used: Wrapped by `padWithSpriteOverlap` to widen road/rail quads before drawing (`src/render.js:610-812`).【F:src/render.js†L610-L812】
  - Dependencies: Uses `Math.abs` comparisons to determine edge orientation; no external modules.【F:src/gl/renderer.js†L242-L249】
  - Edge cases handled or missed: Handles any vertex winding by deriving min/max per axis; does not account for rotated quads (expects axis-aligned input).【F:src/gl/renderer.js†L221-L256】
  - Performance: Constant-time arithmetic; invoked per road/rail quad before rendering.【F:src/render.js†L728-L812】
  - Units / spaces: Operates in screen pixels consistent with renderer quads.【F:src/gl/renderer.js†L221-L256】
  - Determinism: Deterministic given inputs.【F:src/gl/renderer.js†L221-L256】
  - Keep / change / delete: Keep; simplifies sprite overlap tuning. Alternative is to repeat padding math at each call site.【F:src/render.js†L610-L812】
  - Confidence / assumptions: High confidence; behaviour covered by numerous draw callers relying on overlap.【F:src/render.js†L728-L812】



- `makeRotatedQuad`
  - Purpose: Computes the four vertices of a rectangle rotated around its center, returning screen-space coordinates ready for rendering.【F:src/gl/renderer.js†L259-L267】
  - Inputs: `cx`/`cy` center pixels, `w` width, `h` height, `rad` rotation in radians.【F:src/gl/renderer.js†L259-L266】
  - Outputs: Quad object `{ x1,y1,...,x4,y4 }` in pixels.【F:src/gl/renderer.js†L259-L267】
  - Side effects: None; pure calculation.【F:src/gl/renderer.js†L259-L267】
  - Shared state touched and where it’s used: Used to orient sprites such as player vehicle components and collectible bodies before drawing (`src/render.js:933-1767`).【F:src/render.js†L933-L1767】
  - Dependencies: Relies on `Math.cos`/`Math.sin` trig functions; no external modules.【F:src/gl/renderer.js†L259-L266】
  - Edge cases handled or missed: Assumes finite width/height; rotation of 0 returns axis-aligned quad. Does not normalise negative sizes.【F:src/gl/renderer.js†L259-L266】
  - Performance: Constant-time math executed for each rotated sprite draw.【F:src/render.js†L933-L1767】
  - Units / spaces: Inputs in pixels/radians; outputs same pixel space used by renderer.【F:src/gl/renderer.js†L259-L267】
  - Determinism: Deterministic given inputs.【F:src/gl/renderer.js†L259-L267】
  - Keep / change / delete: Keep; isolates rotation math and keeps draw code readable. Alternative is duplicating trig math at each call site.【F:src/render.js†L933-L1767】
  - Confidence / assumptions: High confidence; long-standing helper for sprite orientation.【F:src/gl/renderer.js†L259-L267】

### 3.9 Sprite Catalog (`src/sprite-catalog.js`)



- `freezeClip`
  - Purpose: Normalises optional animation clip definitions into immutable objects with frozen frame arrays and a playback mode, providing safe defaults when clips are absent.【F:src/sprite-catalog.js†L19-L27】
  - Inputs: `clip` object with optional `frames` array and `playback` string; falsy values trigger a default empty clip.【F:src/sprite-catalog.js†L19-L27】
  - Outputs: Returns a frozen object `{ frames, playback }`, where `frames` is a frozen array copy and `playback` defaults to `'none'`.【F:src/sprite-catalog.js†L19-L27】
  - Side effects: Allocates new arrays and freezes them; does not mutate the input clip.【F:src/sprite-catalog.js†L19-L27】
  - Shared state touched and where it’s used: Applied when seeding each catalog entry’s `baseClip`/`interactClip`, ensuring downstream consumers see immutable definitions (`src/sprite-catalog.js:132-151`).【F:src/sprite-catalog.js†L132-L151】
  - Dependencies: Uses `Array.isArray`, `slice`, and `Object.freeze`; no external modules.【F:src/sprite-catalog.js†L19-L27】
  - Edge cases handled or missed: Treats missing clips as empty, gracefully handles non-array `frames`, but does not validate playback strings beyond providing defaults.【F:src/sprite-catalog.js†L19-L27】
  - Performance: Linear in the number of frames copied; run only when constructing the static catalog at startup.【F:src/sprite-catalog.js†L112-L151】
  - Units / spaces: Frame indices remain numeric with no inherent units; semantics determined by sprite atlas consumers.【F:src/sprite-catalog.js†L19-L27】
  - Determinism: Deterministic for a given input clip.【F:src/sprite-catalog.js†L19-L27】
  - Keep / change / delete: Keep; encapsulates defensive cloning. Alternative is to freeze in-line for each entry, duplicating code.【F:src/sprite-catalog.js†L132-L151】
  - Confidence / assumptions: High confidence; straightforward immutable wrapper.【F:src/sprite-catalog.js†L19-L27】



- `makeFrames`
  - Purpose: Generates an inclusive sequence of frame indices between `start` and `end`, supporting ascending and descending ranges for atlas clips.【F:src/sprite-catalog.js†L30-L36】
  - Inputs: `start`, `end` numbers; expects finite values to produce frames.【F:src/sprite-catalog.js†L30-L34】
  - Outputs: Returns an array of integers from `start` to `end` inclusive (empty if inputs are non-finite).【F:src/sprite-catalog.js†L30-L36】
  - Side effects: None; allocates a new array.【F:src/sprite-catalog.js†L30-L36】
  - Shared state touched and where it’s used: Used to build reusable frame sets for tree and pickup atlases before freezing into catalog entries (`src/sprite-catalog.js:52-78`).【F:src/sprite-catalog.js†L52-L78】
  - Dependencies: Relies on `Number.isFinite` and simple loops; no external modules.【F:src/sprite-catalog.js†L30-L36】
  - Edge cases handled or missed: Handles reversed ranges by stepping `-1`; returns `[]` if either bound is non-finite but does not clamp to atlas length.【F:src/sprite-catalog.js†L30-L36】
  - Performance: O(|end-start|); invoked during catalog initialisation only.【F:src/sprite-catalog.js†L30-L78】
  - Units / spaces: Outputs frame indices; callers interpret as atlas frame numbers.【F:src/sprite-catalog.js†L30-L78】
  - Determinism: Deterministic for given start/end.【F:src/sprite-catalog.js†L30-L36】
  - Keep / change / delete: Keep; concise helper for frame lists. Alternative is manual loops at each call site.【F:src/sprite-catalog.js†L52-L78】
  - Confidence / assumptions: High confidence; simple numeric iteration.【F:src/sprite-catalog.js†L30-L36】



- `makeAtlasFrameAssets`
  - Purpose: Converts a list of frame numbers into atlas asset descriptors consumed by the renderer/loader for sprite animation.【F:src/sprite-catalog.js†L40-L43】
  - Inputs: `key` texture manifest key string, `frameValues` array-like of frame numbers.【F:src/sprite-catalog.js†L40-L43】
  - Outputs: Array of `{ type: 'atlas', key, frames: [frame] }` objects cloned per frame.【F:src/sprite-catalog.js†L40-L43】
  - Side effects: None beyond new array allocation.【F:src/sprite-catalog.js†L40-L43】
  - Shared state touched and where it’s used: Generates the static tree atlas asset list baked into the catalog (`src/sprite-catalog.js:70-78`).【F:src/sprite-catalog.js†L70-L78】
  - Dependencies: Uses `Array.isArray`, `map`, and object literals.【F:src/sprite-catalog.js†L40-L43】
  - Edge cases handled or missed: Treats non-array inputs as empty; does not deduplicate frames or validate bounds.【F:src/sprite-catalog.js†L40-L43】
  - Performance: O(frame count) during catalog build.【F:src/sprite-catalog.js†L40-L78】
  - Units / spaces: Frame indices are integers referencing atlas slots.【F:src/sprite-catalog.js†L40-L78】
  - Determinism: Deterministic given inputs.【F:src/sprite-catalog.js†L40-L43】
  - Keep / change / delete: Keep; keeps catalog construction declarative. Alternative is manual object literals for every frame.【F:src/sprite-catalog.js†L70-L78】
  - Confidence / assumptions: High confidence; minimal transformation.【F:src/sprite-catalog.js†L40-L43】



- `cloneCatalog`
  - Purpose: Produces a shallow copy of the internal `CATALOG_MAP` so callers can iterate without mutating the shared singleton.【F:src/sprite-catalog.js†L158-L160】
  - Inputs: None.【F:src/sprite-catalog.js†L158-L160】
  - Outputs: New `Map` instance populated with the same entries.【F:src/sprite-catalog.js†L158-L160】
  - Side effects: None; constructs a new map from the original.【F:src/sprite-catalog.js†L158-L160】
  - Shared state touched and where it’s used: Exposed via `SpriteCatalog.getCatalog()` and consumed when gameplay loads sprite metadata (`src/gameplay.js:928-934`).【F:src/sprite-catalog.js†L175-L179】【F:src/gameplay.js†L928-L934】
  - Dependencies: Relies on the standard `Map` copy constructor.【F:src/sprite-catalog.js†L158-L160】
  - Edge cases handled or missed: Provides a shallow clone; underlying entry objects remain frozen so deep copies aren’t required.【F:src/sprite-catalog.js†L140-L152】【F:src/sprite-catalog.js†L158-L160】
  - Performance: Linear in number of catalog entries; invoked infrequently when systems request the catalog snapshot.【F:src/gameplay.js†L928-L934】
  - Units / spaces: Entries contain normalised metrics (width-as-road fractions, etc.) as defined when building the map.【F:src/sprite-catalog.js†L112-L156】
  - Determinism: Deterministic snapshot of the underlying map.【F:src/sprite-catalog.js†L158-L160】
  - Keep / change / delete: Keep; prevents accidental mutation of the singleton map. Alternative is to expose the map directly and trust callers.【F:src/sprite-catalog.js†L175-L179】
  - Confidence / assumptions: High confidence; simple wrapper around `new Map`.【F:src/sprite-catalog.js†L158-L160】



- `getTextureManifest`
  - Purpose: Returns a shallow copy of the sprite texture manifest so loaders can request sprite-specific assets without mutating shared data.【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Inputs: None.【F:src/sprite-catalog.js†L162-L164】
  - Outputs: Plain object copy of `TEXTURE_MANIFEST` entries.【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Side effects: None; uses object spread to clone manifest values.【F:src/sprite-catalog.js†L162-L164】
  - Shared state touched and where it’s used: Queried during bootstrap to load sprite textures alongside the main manifest (`src/bootstrap.js:32-35`).【F:src/bootstrap.js†L32-L35】
  - Dependencies: Relies on spread syntax and the frozen `TEXTURE_MANIFEST`.【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Edge cases handled or missed: Produces a copy so callers can edit without affecting the catalog; does not validate URLs.【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Performance: Iterates over manifest keys once per request; small data set (four entries).【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Units / spaces: Manifest values are asset URLs relative to project root.【F:src/sprite-catalog.js†L5-L34】
  - Determinism: Deterministic; always mirrors the static manifest.【F:src/sprite-catalog.js†L5-L34】【F:src/sprite-catalog.js†L162-L164】
  - Keep / change / delete: Keep; isolates manifest exposure. Alternative is to export the frozen manifest directly, limiting caller flexibility.【F:src/sprite-catalog.js†L162-L164】
  - Confidence / assumptions: High confidence; trivial copy helper.【F:src/sprite-catalog.js†L162-L164】



- `getCatalogEntry`
  - Purpose: Fetches a frozen catalog entry by `spriteId`, enabling callers to inspect metrics/assets for individual sprites.【F:src/sprite-catalog.js†L166-L168】
  - Inputs: `spriteId` string.【F:src/sprite-catalog.js†L166-L168】
  - Outputs: Returns the frozen entry or `null` when missing.【F:src/sprite-catalog.js†L166-L168】
  - Side effects: None.【F:src/sprite-catalog.js†L166-L168】
  - Shared state touched and where it’s used: Forms the basis of the exported API (`SpriteCatalog.getEntry`) though no current repo code calls it directly; `getMetrics` delegates to it for metric lookups.【F:src/sprite-catalog.js†L166-L178】
  - Dependencies: Relies on the internal `CATALOG_MAP`.【F:src/sprite-catalog.js†L132-L157】【F:src/sprite-catalog.js†L166-L168】
  - Edge cases handled or missed: Returns `null` for unknown IDs; does not throw for invalid argument types.【F:src/sprite-catalog.js†L166-L168】
  - Performance: O(1) map lookup.【F:src/sprite-catalog.js†L166-L168】
  - Units / spaces: Entries contain metrics in normalised road-width units and tint colors per catalog definition.【F:src/sprite-catalog.js†L112-L156】
  - Determinism: Deterministic; entries are frozen and static.【F:src/sprite-catalog.js†L132-L178】
  - Keep / change / delete: Keep; essential point lookup for future gameplay/render code. Alternative would require callers to copy the entire catalog and filter manually.【F:src/sprite-catalog.js†L166-L178】
  - Confidence / assumptions: High confidence; straightforward map access.【F:src/sprite-catalog.js†L166-L168】



- `getMetrics`
  - Purpose: Convenience accessor that returns sprite metrics or the frozen fallback when an entry is missing.【F:src/sprite-catalog.js†L170-L172】
  - Inputs: `spriteId` string.【F:src/sprite-catalog.js†L170-L172】
  - Outputs: Metrics object (frozen) or `METRIC_FALLBACK`.【F:src/sprite-catalog.js†L10-L16】【F:src/sprite-catalog.js†L170-L172】
  - Side effects: None.【F:src/sprite-catalog.js†L170-L172】
  - Shared state touched and where it’s used: Exposed via `SpriteCatalog.getMetrics`; while no current module calls it, gameplay relies on the adjacent `metricsFallback` export when seeding defaults (`src/gameplay.js:368-371`).【F:src/sprite-catalog.js†L170-L180】【F:src/gameplay.js†L368-L371】
  - Dependencies: Calls `getCatalogEntry` for lookup.【F:src/sprite-catalog.js†L166-L172】
  - Edge cases handled or missed: Provides a safe fallback; does not memoize lookups or warn on missing entries.【F:src/sprite-catalog.js†L170-L172】
  - Performance: O(1) map access; negligible.【F:src/sprite-catalog.js†L166-L172】
  - Units / spaces: Metrics express sprite width as a fraction of road width (`wN`), aspect ratio, tint RGBA, and optional atlas metadata.【F:src/sprite-catalog.js†L10-L16】【F:src/sprite-catalog.js†L112-L156】
  - Determinism: Deterministic mapping from ID to metrics/fallback.【F:src/sprite-catalog.js†L10-L16】【F:src/sprite-catalog.js†L170-L172】
  - Keep / change / delete: Keep; simplifies caller code that only needs metrics. Alternative is repeated `getEntry` + fallback checks.【F:src/sprite-catalog.js†L166-L172】
  - Confidence / assumptions: High confidence; tiny wrapper around `getCatalogEntry`.【F:src/sprite-catalog.js†L166-L172】

### 3.10 Math Utilities (`src/math.js`)



- `clamp`
  - Purpose: Limits a numeric value to an inclusive `[min, max]` range, preventing downstream math from exceeding configured bounds in rendering and gameplay systems.【F:src/math.js†L1-L1】【F:src/render.js†L84-L104】【F:src/gameplay.js†L1199-L1201】
  - Inputs: `value` (number to bound), `min` lower limit, `max` upper limit; expects numeric inputs with `min ≤ max` for intuitive results.【F:src/math.js†L1-L1】
  - Outputs: Returns the clipped number within the specified range.【F:src/math.js†L1-L1】
  - Side effects: None; pure function.【F:src/math.js†L1-L1】
  - Shared state touched and where it’s used: Imported by the renderer to constrain random colours and camera tilt easing (`src/render.js:35-1048`) and by gameplay to cap velocity, lateral position, and lane indices (`src/gameplay.js:564-2349`).【F:src/render.js†L35-L1048】【F:src/gameplay.js†L564-L2349】
  - Dependencies: Uses `Math.min`/`Math.max`.【F:src/math.js†L1-L1】
  - Edge cases handled or missed: If `min > max` the nested min/max effectively returns `min`; caller should ensure sensible bounds.【F:src/math.js†L1-L1】
  - Performance: Constant-time; heavily used but negligible cost per call.【F:src/math.js†L1-L1】
  - Units / spaces: Agnostic—applies to whatever units callers supply (colors, speeds, angles). Example: clamps HSV parameters and tilt degrees.【F:src/render.js†L84-L104】【F:src/render.js†L1032-L1043】
  - Determinism: Deterministic pure math.【F:src/math.js†L1-L1】
  - Keep / change / delete: Keep; ubiquitous helper avoiding verbose inline min/max chains.【F:src/math.js†L1-L1】
  - Confidence / assumptions: High confidence; trivial wrapper around built-ins.【F:src/math.js†L1-L1】



- `clamp01`
  - Purpose: Convenience wrapper that clamps a value into the `[0,1]` interval, widely used for normalised ratios and easing inputs.【F:src/math.js†L2-L2】【F:src/gameplay.js†L570-L588】
  - Inputs: `value` number.【F:src/math.js†L2-L2】
  - Outputs: Returns `value` bounded between `0` and `1`.【F:src/math.js†L2-L2】
  - Side effects: None.【F:src/math.js†L2-L2】
  - Shared state touched and where it’s used: Applied across gameplay for interpolation weights and normalised timers (`src/gameplay.js:570-1869`) and inside world asset easing definitions (`src/world.js:482-506`).【F:src/gameplay.js†L570-L1869】【F:src/world.js†L482-L506】
  - Dependencies: Calls `clamp`.【F:src/math.js†L2-L2】
  - Edge cases handled or missed: Guarantees output in `[0,1]`; does not warn on NaN input (propagates NaN).【F:src/math.js†L2-L2】
  - Performance: Constant-time; frequent but cheap.【F:src/math.js†L2-L2】
  - Units / spaces: Intended for normalised scalar ratios.【F:src/math.js†L2-L2】【F:src/gameplay.js†L570-L588】
  - Determinism: Deterministic.【F:src/math.js†L2-L2】
  - Keep / change / delete: Keep; reduces boilerplate when constraining easing parameters.【F:src/math.js†L2-L2】
  - Confidence / assumptions: High confidence; simple call-through.【F:src/math.js†L2-L2】



- `lerp`
  - Purpose: Performs linear interpolation between `start` and `end` by factor `t`, supporting numerous projection and animation calculations.【F:src/math.js†L4-L4】【F:src/render.js†L780-L812】【F:src/world.js†L503-L510】
  - Inputs: `start`, `end`, `t` numbers; `t` typically within `[0,1]` though not enforced.【F:src/math.js†L4-L4】
  - Outputs: Returns interpolated value `start + (end - start) * t`.【F:src/math.js†L4-L4】
  - Side effects: None.【F:src/math.js†L4-L4】
  - Shared state touched and where it’s used: Critical for draw-list generation (road strips, sprite placement) and cliff easing (`src/render.js:780-1290`) and for cliff CSV interpolation in world data (`src/world.js:503-510`).【F:src/render.js†L780-L1290】【F:src/world.js†L503-L510】
  - Dependencies: Relies on arithmetic only.【F:src/math.js†L4-L4】
  - Edge cases handled or missed: Accepts any numeric `t`; extrapolates when outside `[0,1]` which some callers expect.【F:src/math.js†L4-L4】
  - Performance: Constant-time; invoked per sprite/segment interpolation but extremely cheap.【F:src/math.js†L4-L4】
  - Units / spaces: Works in caller units (pixels, world metres, colour components).【F:src/render.js†L780-L1290】
  - Determinism: Deterministic given inputs.【F:src/math.js†L4-L4】
  - Keep / change / delete: Keep; ubiquitous interpolation helper.【F:src/math.js†L4-L4】
  - Confidence / assumptions: High confidence.【F:src/math.js†L4-L4】



- `pctRem`
  - Purpose: Computes the fractional remainder of `value` relative to `total`, returning a normalised modulus often used for wrapping track positions.【F:src/math.js†L5-L5】【F:src/render.js†L1004-L1015】
  - Inputs: `value` number, `total` number (non-zero recommended).【F:src/math.js†L5-L5】
  - Outputs: `(value % total) / total` result.【F:src/math.js†L5-L5】
  - Side effects: None.【F:src/math.js†L5-L5】
  - Shared state touched and where it’s used: Used by the renderer to compute the camera’s fractional progress through a segment for draw ordering (`src/render.js:1004-1015`).【F:src/render.js†L1004-L1015】
  - Dependencies: Native modulo operator.【F:src/math.js†L5-L5】
  - Edge cases handled or missed: Inherits JavaScript `%` semantics (negative values keep sign of dividend); callers must avoid zero totals.【F:src/math.js†L5-L5】
  - Performance: Constant-time.【F:src/math.js†L5-L5】
  - Units / spaces: Outputs a ratio in `[0,1)` for positive totals; used as a unit interval along the track.【F:src/render.js†L1004-L1015】
  - Determinism: Deterministic.【F:src/math.js†L5-L5】
  - Keep / change / delete: Keep; concise helper for normalised modular arithmetic.【F:src/math.js†L5-L5】
  - Confidence / assumptions: High confidence.【F:src/math.js†L5-L5】



- `createEaseIn`
  - Purpose: Factory that returns an easing function raising `clamp01(t)` to a power, producing standard ease-in curves.【F:src/math.js†L7-L8】【F:src/math.js†L17-L23】
  - Inputs: `power` positive number.【F:src/math.js†L7-L7】
  - Outputs: Returns `(t) => Math.pow(clamp01(t), power)`.【F:src/math.js†L7-L7】
  - Side effects: None.【F:src/math.js†L7-L7】
  - Shared state touched and where it’s used: Instantiates `easeInQuad01`/`easeInCub01` used in easing families (`src/math.js:18-23`).【F:src/math.js†L18-L23】
  - Dependencies: Uses `clamp01`, `Math.pow`.【F:src/math.js†L7-L7】
  - Edge cases handled or missed: Clamps negative/overshoot `t` automatically; does not validate `power` (NaN propagates).【F:src/math.js†L7-L7】
  - Performance: Constant-time per call; used only to define static easers.【F:src/math.js†L18-L23】
  - Units / spaces: Operates on normalised time in `[0,1]`.【F:src/math.js†L7-L23】
  - Determinism: Deterministic.【F:src/math.js†L7-L7】
  - Keep / change / delete: Keep; avoids repeating exponent logic for each curve.【F:src/math.js†L18-L23】
  - Confidence / assumptions: High confidence.【F:src/math.js†L7-L7】



- `createEaseOut`
  - Purpose: Produces an ease-out function that mirrors ease-in behaviour by flipping and clamping `t`.【F:src/math.js†L8-L8】【F:src/math.js†L17-L23】
  - Inputs: `power` number.【F:src/math.js†L8-L8】
  - Outputs: `(t) => 1 - Math.pow(1 - clamp01(t), power)`.【F:src/math.js†L8-L8】
  - Side effects: None.【F:src/math.js†L8-L8】
  - Shared state touched and where it’s used: Used to build `easeOutQuad01`/`easeOutCub01` curves consumed by `EASE_CURVES_01`.【F:src/math.js†L19-L23】【F:src/math.js†L33-L36】
  - Dependencies: `clamp01`, `Math.pow`.【F:src/math.js†L8-L8】
  - Edge cases handled or missed: Handles out-of-range `t` by clamping; same NaN caveats as `createEaseIn`.【F:src/math.js†L8-L8】
  - Performance: Constant-time; invoked during module init only.【F:src/math.js†L19-L23】
  - Units / spaces: Normalised `[0,1]` domain.【F:src/math.js†L8-L23】
  - Determinism: Deterministic.【F:src/math.js†L8-L8】
  - Keep / change / delete: Keep; complements other ease factories.【F:src/math.js†L19-L23】
  - Confidence / assumptions: High confidence.【F:src/math.js†L8-L8】



- `createEaseInOut`
  - Purpose: Generates a symmetric ease-in/ease-out curve by applying a power to the first half of the timeline and mirroring it for the second half.【F:src/math.js†L9-L15】
  - Inputs: `power` number.【F:src/math.js†L9-L15】
  - Outputs: Returns `(t) => { … }` splitting around `0.5`.【F:src/math.js†L9-L15】
  - Side effects: None.【F:src/math.js†L9-L15】
  - Shared state touched and where it’s used: Creates `easeInOutQuad01`/`easeInOutCub01` referenced by smoothing tables.【F:src/math.js†L20-L23】【F:src/math.js†L33-L36】
  - Dependencies: `clamp01`, `Math.pow`.【F:src/math.js†L9-L15】
  - Edge cases handled or missed: Clamps `t`; handles degenerate `power` but does not guard against negative exponents.【F:src/math.js†L9-L15】
  - Performance: Constant-time; executed during initialisation.【F:src/math.js†L20-L23】
  - Units / spaces: Normalised time domain.【F:src/math.js†L9-L15】
  - Determinism: Deterministic.【F:src/math.js†L9-L15】
  - Keep / change / delete: Keep; avoids hand-writing mirrored curves.【F:src/math.js†L20-L23】
  - Confidence / assumptions: High confidence.【F:src/math.js†L9-L15】



- `easeLinear01`
  - Purpose: Identity easing returning `clamp01(t)`, used as the neutral curve in easing tables.【F:src/math.js†L17-L17】【F:src/math.js†L33-L36】
  - Inputs: `t` number.【F:src/math.js†L17-L17】
  - Outputs: `clamp01(t)`.【F:src/math.js†L17-L17】
  - Side effects: None.【F:src/math.js†L17-L17】
  - Shared state touched and where it’s used: Included in `EASE_CURVES_01.linear` for default smoothing and referenced by `getEase01`.【F:src/math.js†L33-L42】
  - Dependencies: `clamp01`.【F:src/math.js†L17-L17】
  - Edge cases handled or missed: Clamps out-of-range values; NaN propagates.【F:src/math.js†L17-L17】
  - Performance: Constant-time.【F:src/math.js†L17-L17】
  - Units / spaces: `[0,1]` domain.【F:src/math.js†L17-L17】
  - Determinism: Deterministic.【F:src/math.js†L17-L17】
  - Keep / change / delete: Keep; baseline entry in easing map.【F:src/math.js†L33-L42】
  - Confidence / assumptions: High confidence.【F:src/math.js†L17-L17】



- `easeInQuad01`
  - Purpose: Quadratic ease-in curve produced by `createEaseIn(2)` for smooth acceleration.【F:src/math.js†L18-L18】【F:src/math.js†L33-L36】
  - Inputs: `t` number.【F:src/math.js†L18-L18】
  - Outputs: Returns `clamp01(t)^2`.【F:src/math.js†L7-L18】
  - Side effects: None.【F:src/math.js†L18-L18】
  - Shared state touched and where it’s used: Populates `EASE_CURVES_01.smooth.in` and `CURVE_EASE.smooth.in` used by world/renderer smoothing utilities.【F:src/math.js†L33-L48】
  - Dependencies: `createEaseIn`.【F:src/math.js†L18-L18】
  - Edge cases handled or missed: Clamps `t`; NaN flows through.【F:src/math.js†L7-L18】
  - Performance: Constant-time.【F:src/math.js†L18-L18】
  - Units / spaces: Normalised time.【F:src/math.js†L18-L36】
  - Determinism: Deterministic.【F:src/math.js†L18-L18】
  - Keep / change / delete: Keep; part of standard easing set.【F:src/math.js†L33-L48】
  - Confidence / assumptions: High confidence.【F:src/math.js†L18-L18】



- `easeOutQuad01`
  - Purpose: Quadratic ease-out curve for decelerating transitions.【F:src/math.js†L19-L19】
  - Inputs: `t` number.【F:src/math.js†L19-L19】
  - Outputs: Returns `1 - (1 - clamp01(t))^2`.【F:src/math.js†L8-L19】
  - Side effects: None.【F:src/math.js†L19-L19】
  - Shared state touched and where it’s used: Provides `EASE_CURVES_01.smooth.out` and `CURVE_EASE.smooth.out`.【F:src/math.js†L33-L48】
  - Dependencies: `createEaseOut`.【F:src/math.js†L19-L19】
  - Edge cases handled or missed: Same as other ease functions.【F:src/math.js†L8-L19】
  - Performance: Constant-time.【F:src/math.js†L19-L19】
  - Units / spaces: `[0,1]` domain.【F:src/math.js†L19-L36】
  - Determinism: Deterministic.【F:src/math.js†L19-L19】
  - Keep / change / delete: Keep; complements ease-in for smooth curves.【F:src/math.js†L33-L48】
  - Confidence / assumptions: High confidence.【F:src/math.js†L19-L19】



- `easeInOutQuad01`
  - Purpose: Symmetric quadratic ease-in/out curve for smooth transitions.【F:src/math.js†L20-L20】
  - Inputs: `t` number.【F:src/math.js†L20-L20】
  - Outputs: Piecewise polynomial produced by `createEaseInOut(2)`.【F:src/math.js†L9-L20】
  - Side effects: None.【F:src/math.js†L20-L20】
  - Shared state touched and where it’s used: Selected by `EASE_CURVES_01.smooth.io` and by `getEase01('smooth:io')` to shape cliff easing blends.【F:src/math.js†L33-L42】【F:src/world.js†L483-L506】
  - Dependencies: `createEaseInOut`.【F:src/math.js†L20-L20】
  - Edge cases handled or missed: Handles all `t` by clamping; NaN passes through.【F:src/math.js†L9-L20】
  - Performance: Constant-time.【F:src/math.js†L20-L20】
  - Units / spaces: `[0,1]` time.【F:src/math.js†L20-L36】
  - Determinism: Deterministic.【F:src/math.js†L20-L20】
  - Keep / change / delete: Keep; key part of smoothing presets.【F:src/math.js†L33-L42】
  - Confidence / assumptions: High confidence.【F:src/math.js†L20-L20】



- `easeInCub01`
  - Purpose: Cubic ease-in for sharper acceleration.【F:src/math.js†L21-L21】
  - Inputs: `t` number.【F:src/math.js†L21-L21】
  - Outputs: `clamp01(t)^3`.【F:src/math.js†L7-L21】
  - Side effects: None.【F:src/math.js†L21-L21】
  - Shared state touched and where it’s used: Supplies `EASE_CURVES_01.sharp.in` and `CURVE_EASE.sharp.in`.【F:src/math.js†L33-L48】
  - Dependencies: `createEaseIn`.【F:src/math.js†L21-L21】
  - Edge cases handled or missed: Same as other easing helpers.【F:src/math.js†L7-L21】
  - Performance: Constant-time.【F:src/math.js†L21-L21】
  - Units / spaces: `[0,1]` time.【F:src/math.js†L21-L36】
  - Determinism: Deterministic.【F:src/math.js†L21-L21】
  - Keep / change / delete: Keep; part of sharper easing family.【F:src/math.js†L33-L48】
  - Confidence / assumptions: High confidence.【F:src/math.js†L21-L21】



- `easeOutCub01`
  - Purpose: Cubic ease-out curve for quick start/slow finish transitions.【F:src/math.js†L22-L22】
  - Inputs: `t` number.【F:src/math.js†L22-L22】
  - Outputs: `1 - (1 - clamp01(t))^3`.【F:src/math.js†L8-L22】
  - Side effects: None.【F:src/math.js†L22-L22】
  - Shared state touched and where it’s used: Used in `EASE_CURVES_01.sharp.out` and `CURVE_EASE.sharp.out`.【F:src/math.js†L33-L48】
  - Dependencies: `createEaseOut`.【F:src/math.js†L22-L22】
  - Edge cases handled or missed: Same as other curves.【F:src/math.js†L8-L22】
  - Performance: Constant-time.【F:src/math.js†L22-L22】
  - Units / spaces: `[0,1]`.【F:src/math.js†L22-L36】
  - Determinism: Deterministic.【F:src/math.js†L22-L22】
  - Keep / change / delete: Keep.【F:src/math.js†L33-L48】
  - Confidence / assumptions: High confidence.【F:src/math.js†L22-L22】



- `easeInOutCub01`
  - Purpose: Cubic ease-in/out for sharper yet symmetric transitions.【F:src/math.js†L23-L23】
  - Inputs: `t` number.【F:src/math.js†L23-L23】
  - Outputs: Piecewise cubic computed via `createEaseInOut(3)`.【F:src/math.js†L9-L23】
  - Side effects: None.【F:src/math.js†L23-L23】
  - Shared state touched and where it’s used: Provides `EASE_CURVES_01.sharp.io` and exported `easeInOutCub01` for smoothing tables.【F:src/math.js†L33-L36】【F:src/math.js†L73-L74】
  - Dependencies: `createEaseInOut`.【F:src/math.js†L23-L23】
  - Edge cases handled or missed: Same as other ease functions.【F:src/math.js†L9-L23】
  - Performance: Constant-time.【F:src/math.js†L23-L23】
  - Units / spaces: `[0,1]` time.【F:src/math.js†L23-L36】
  - Determinism: Deterministic.【F:src/math.js†L23-L23】
  - Keep / change / delete: Keep; part of exported easing suite.【F:src/math.js†L73-L74】
  - Confidence / assumptions: High confidence.【F:src/math.js†L23-L23】



- `createCurveEase`
  - Purpose: Lifts a `[0,1]` easing function into a three-parameter lerp helper returning values between `start` and `end`.【F:src/math.js†L25-L25】
  - Inputs: `fn01` easing function.【F:src/math.js†L25-L25】
  - Outputs: Returns `(start, end, t) => lerp(start, end, fn01(t))`.【F:src/math.js†L25-L25】
  - Side effects: None.【F:src/math.js†L25-L25】
  - Shared state touched and where it’s used: Constructs the exported `easeLinear`, `easeInQuad`, `easeOutQuad`, `easeInCub`, and `easeOutCub` curve helpers.【F:src/math.js†L27-L31】
  - Dependencies: Depends on `lerp` and provided easing.【F:src/math.js†L25-L31】
  - Edge cases handled or missed: Inherits behaviour from `fn01`; does not guard against non-function inputs.【F:src/math.js†L25-L31】
  - Performance: Constant-time per invocation; used mainly for exported curves.【F:src/math.js†L25-L31】
  - Units / spaces: Accepts caller-defined units for `start`/`end`; `t` expected in `[0,1]`.【F:src/math.js†L25-L31】
  - Determinism: Deterministic.【F:src/math.js†L25-L31】
  - Keep / change / delete: Keep; promotes reuse of easing when interpolating arbitrary values.【F:src/math.js†L25-L31】
  - Confidence / assumptions: High confidence.【F:src/math.js†L25-L31】



- `easeLinear`
  - Purpose: Interpolates between two values using the linear `[0,1]` easing, serving as a convenience wrapper around `lerp`.【F:src/math.js†L27-L27】
  - Inputs: `start`, `end`, `t`.【F:src/math.js†L27-L27】
  - Outputs: `lerp(start, end, clamp01(t))`.【F:src/math.js†L25-L27】
  - Side effects: None.【F:src/math.js†L27-L27】
  - Shared state touched and where it’s used: Exported for external modules via `MathUtil` though no in-repo callers currently reference it directly.【F:src/math.js†L63-L78】
  - Dependencies: `createCurveEase` + `easeLinear01`.【F:src/math.js†L25-L36】
  - Edge cases handled or missed: Clamps `t`; otherwise mirrors `lerp`.【F:src/math.js†L25-L27】
  - Performance: Constant-time.【F:src/math.js†L27-L27】
  - Units / spaces: Caller-defined units.【F:src/math.js†L27-L27】
  - Determinism: Deterministic.【F:src/math.js†L27-L27】
  - Keep / change / delete: Keep; part of public MathUtil API.【F:src/math.js†L63-L78】
  - Confidence / assumptions: High confidence.【F:src/math.js†L27-L27】



- `easeInQuad`
  - Purpose: Applies quadratic ease-in between values via `createCurveEase(easeInQuad01)`.【F:src/math.js†L28-L28】
  - Inputs: `start`, `end`, `t`.【F:src/math.js†L28-L28】
  - Outputs: Returns eased interpolation.【F:src/math.js†L25-L28】
  - Side effects: None.【F:src/math.js†L28-L28】
  - Shared state touched and where it’s used: Exported for potential animation code; no active callers yet.【F:src/math.js†L63-L78】
  - Dependencies: `createCurveEase`, `easeInQuad01`.【F:src/math.js†L25-L36】
  - Edge cases handled or missed: Clamps `t`; inherits easing behaviour.【F:src/math.js†L25-L28】
  - Performance: Constant-time.【F:src/math.js†L28-L28】
  - Units / spaces: Caller-defined.【F:src/math.js†L28-L28】
  - Determinism: Deterministic.【F:src/math.js†L28-L28】
  - Keep / change / delete: Keep; part of exported easing suite.【F:src/math.js†L63-L78】
  - Confidence / assumptions: High confidence.【F:src/math.js†L28-L28】



- `easeOutQuad`
  - Purpose: Quadratic ease-out interpolation helper.【F:src/math.js†L29-L29】
  - Inputs: `start` and `end` values with easing factor `t` (clamped internally to `[0,1]`).【F:src/math.js†L25-L29】
  - Outputs: Returns `createCurveEase(easeOutQuad01)(start, end, t)` for a fast-start/slow-end transition.【F:src/math.js†L25-L29】
  - Side effects: None.【F:src/math.js†L29-L29】
  - Shared state touched and where it’s used: Exported; no direct repo usage yet.【F:src/math.js†L63-L78】
  - Dependencies: `createCurveEase`, `easeOutQuad01`.【F:src/math.js†L25-L36】
  - Edge cases handled or missed: Same as other curve eases.【F:src/math.js†L25-L29】
  - Performance: Constant-time.【F:src/math.js†L29-L29】
  - Units / spaces: Caller-defined.【F:src/math.js†L29-L29】
  - Determinism: Deterministic.【F:src/math.js†L29-L29】
  - Keep / change / delete: Keep; ensures ease-out API parity.【F:src/math.js†L63-L78】
  - Confidence / assumptions: High confidence.【F:src/math.js†L29-L29】



- `easeInCub`
  - Purpose: Cubic ease-in interpolation between values.【F:src/math.js†L30-L30】
  - Inputs: `start`, `end`, `t` easing factor (clamped to `[0,1]`).【F:src/math.js†L25-L30】
  - Outputs: Returns `createCurveEase(easeInCub01)(start, end, t)` for sharper acceleration.【F:src/math.js†L25-L30】
  - Side effects: None.【F:src/math.js†L30-L30】
  - Shared state touched and where it’s used: Exported for potential callers; no current in-repo usage.【F:src/math.js†L63-L78】
  - Dependencies: `createCurveEase`, `easeInCub01`.【F:src/math.js†L25-L36】
  - Edge cases handled or missed: Same as other curves.【F:src/math.js†L25-L30】
  - Performance: Constant-time.【F:src/math.js†L30-L30】
  - Units / spaces: Caller-defined.【F:src/math.js†L30-L30】
  - Determinism: Deterministic.【F:src/math.js†L30-L30】
  - Keep / change / delete: Keep; completes cubic easing trio.【F:src/math.js†L63-L78】
  - Confidence / assumptions: High confidence.【F:src/math.js†L30-L30】



- `easeOutCub`
  - Purpose: Cubic ease-out interpolation helper.【F:src/math.js†L31-L31】
  - Inputs: `start`, `end`, `t` easing factor clamped to `[0,1]`.【F:src/math.js†L25-L31】
  - Outputs: Returns `createCurveEase(easeOutCub01)(start, end, t)` for easing to a stop.【F:src/math.js†L25-L31】
  - Side effects: None.【F:src/math.js†L31-L31】
  - Shared state touched and where it’s used: Exported but not currently referenced.【F:src/math.js†L63-L78】
  - Dependencies: `createCurveEase`, `easeOutCub01`.【F:src/math.js†L25-L36】
  - Edge cases handled or missed: Same as other curves.【F:src/math.js†L25-L31】
  - Performance: Constant-time.【F:src/math.js†L31-L31】
  - Units / spaces: Caller-defined.【F:src/math.js†L31-L31】
  - Determinism: Deterministic.【F:src/math.js†L31-L31】
  - Keep / change / delete: Keep; matches API of other easing helpers.【F:src/math.js†L63-L78】
  - Confidence / assumptions: High confidence.【F:src/math.js†L31-L31】



- `getEase01`
  - Purpose: Parses strings like `'smooth:io'` and returns the corresponding `[0,1]` easing function from `EASE_CURVES_01`, defaulting gracefully on unknown inputs.【F:src/math.js†L33-L42】
  - Inputs: `spec` string (case-insensitive, expects `curve:mode`).【F:src/math.js†L39-L41】
  - Outputs: Function reference (ease-in/out/linear).【F:src/math.js†L39-L42】
  - Side effects: None; trims and lowercases the input.【F:src/math.js†L39-L41】
  - Shared state touched and where it’s used: Used by world cliff processing to fetch easing curves for cliff offsets (`src/world.js:483-506`).【F:src/world.js†L483-L506】
  - Dependencies: `EASE_CURVES_01` map, string methods.【F:src/math.js†L33-L42】
  - Edge cases handled or missed: Defaults to `'smooth:io'` when parsing fails; unrecognised modes fall back to `io`.【F:src/math.js†L39-L42】
  - Performance: Constant-time string parsing.【F:src/math.js†L39-L42】
  - Units / spaces: Operates on normalised `[0,1]` curves returned from the map.【F:src/math.js†L33-L42】
  - Determinism: Deterministic for a given spec.【F:src/math.js†L39-L42】
  - Keep / change / delete: Keep; centralises easing selection logic.【F:src/math.js†L33-L42】
  - Confidence / assumptions: High confidence.【F:src/math.js†L39-L42】



- `computeCurvature`
  - Purpose: Calculates curvature κ from first and second derivatives (`dy`, `d2y`) for road profile analysis.【F:src/math.js†L51-L51】
  - Inputs: `dy` slope, `d2y` second derivative.【F:src/math.js†L51-L51】
  - Outputs: `d2y / (1 + dy^2)^(3/2)`.【F:src/math.js†L51-L51】
  - Side effects: None.【F:src/math.js†L51-L51】
  - Shared state touched and where it’s used: Used in HUD/debug displays and gameplay physics to gauge banking/airborne behaviour (`src/render.js:2015-2023`, `src/gameplay.js:2217-2227`).【F:src/render.js†L2015-L2023】【F:src/gameplay.js†L2217-L2227】
  - Dependencies: Math.pow.【F:src/math.js†L51-L51】
  - Edge cases handled or missed: When derivatives are zero curvature is zero; does not guard against overflow when slopes are huge.【F:src/math.js†L51-L51】
  - Performance: Constant-time.【F:src/math.js†L51-L51】
  - Units / spaces: Assumes consistent world units for derivatives (e.g., metres).【F:src/math.js†L51-L51】
  - Determinism: Deterministic.【F:src/math.js†L51-L51】
  - Keep / change / delete: Keep; critical for curvature-based logic.【F:src/math.js†L51-L51】
  - Confidence / assumptions: High confidence.【F:src/math.js†L51-L51】



- `tangentNormalFromSlope`
  - Purpose: Converts a slope `dy` into unit tangent (`tx`,`ty`) and normal (`nx`,`ny`) vectors for physics and rendering alignment.【F:src/math.js†L53-L60】
  - Inputs: `dy` slope (Δy/Δx).【F:src/math.js†L53-L55】
  - Outputs: Object containing tangent and normal components normalised to length 1.【F:src/math.js†L53-L60】
  - Side effects: None.【F:src/math.js†L53-L60】
  - Shared state touched and where it’s used: Gameplay uses it to orient hop/landing physics and determine support forces on slopes (`src/gameplay.js:1884-1901`, `src/gameplay.js:2217-2227`).【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2217-L2227】
  - Dependencies: `Math.sqrt`.【F:src/math.js†L53-L60】
  - Edge cases handled or missed: Handles zero slope gracefully; does not guard against `dy` = `Infinity` (would yield zero due to `1/√(1+∞)`).【F:src/math.js†L53-L60】
  - Performance: Constant-time.【F:src/math.js†L53-L60】
  - Units / spaces: Produces unit vectors in world space matching the slope definition.【F:src/math.js†L53-L60】
  - Determinism: Deterministic.【F:src/math.js†L53-L60】
  - Keep / change / delete: Keep; fundamental for physics integration.【F:src/gameplay.js†L1884-L1901】【F:src/gameplay.js†L2217-L2227】
  - Confidence / assumptions: High confidence.【F:src/math.js†L53-L60】

### 3.11 Testing Utilities (`test/glrenderer.resize.test.js`)



- `assert`
  - Purpose: Minimal assertion helper for the resize smoke test that throws an `Error` when a condition is false, stopping the test early with a readable message.【F:test/glrenderer.resize.test.js†L1-L5】
  - Inputs: `condition` boolean-like, `message` string.【F:test/glrenderer.resize.test.js†L1-L5】
  - Outputs: None; returns `undefined` on success.【F:test/glrenderer.resize.test.js†L1-L5】
  - Side effects: Throws when the condition fails, aborting the script.【F:test/glrenderer.resize.test.js†L1-L5】
  - Shared state touched and where it’s used: Called to validate uniform updates and cached canvas size during the resize checks (`test/glrenderer.resize.test.js:47-60`).【F:test/glrenderer.resize.test.js†L47-L60】
  - Dependencies: Uses the built-in `Error` constructor.【F:test/glrenderer.resize.test.js†L1-L5】
  - Edge cases handled or missed: Treats any truthy value as pass; does not provide deep comparison utilities.【F:test/glrenderer.resize.test.js†L1-L5】
  - Performance: Constant-time; invoked a handful of times per test run.【F:test/glrenderer.resize.test.js†L47-L60】
  - Units / spaces: N/A.【F:test/glrenderer.resize.test.js†L1-L5】
  - Determinism: Deterministic for given inputs.【F:test/glrenderer.resize.test.js†L1-L5】
  - Keep / change / delete: Keep; lightweight inline assertion avoids pulling external deps. Alternative is Node’s `assert` module, but the custom helper keeps output consistent.【F:test/glrenderer.resize.test.js†L1-L5】
  - Confidence / assumptions: High confidence; trivial guard.【F:test/glrenderer.resize.test.js†L1-L5】



- `makeRenderer`
  - Purpose: Builds a partially mocked `GLRenderer` instance with stubbed GL calls so the test can run `begin()` without a browser context.【F:test/glrenderer.resize.test.js†L15-L41】
  - Inputs: `width`, `height` numbers for the fake canvas.【F:test/glrenderer.resize.test.js†L15-L19】
  - Outputs: Object `{ renderer, calls, gl }` where `renderer` mimics a configured GLRenderer instance, `calls` logs `uniform2f` invocations, and `gl` exposes stubbed WebGL functions.【F:test/glrenderer.resize.test.js†L17-L41】
  - Side effects: Allocates arrays/objects and seeds renderer fields like `_canvasWidth`/`_canvasHeight` and fog caches.【F:test/glrenderer.resize.test.js†L29-L38】
  - Shared state touched and where it’s used: Supplies the renderer under test and tracking state for subsequent assertions (`test/glrenderer.resize.test.js:43-60`).【F:test/glrenderer.resize.test.js†L29-L60】
  - Dependencies: Relies on `GLRenderer.prototype` from the main module and the stubbed GL function implementations defined within.【F:test/glrenderer.resize.test.js†L11-L41】
  - Edge cases handled or missed: Assumes numeric width/height; does not simulate other GL methods beyond those used by `begin`.【F:test/glrenderer.resize.test.js†L15-L41】
  - Performance: Constant-time setup per test run.【F:test/glrenderer.resize.test.js†L15-L41】
  - Units / spaces: Width/height in pixels matching canvas dimensions expected by renderer.【F:test/glrenderer.resize.test.js†L17-L38】
  - Determinism: Deterministic; produces identical mocks for given inputs.【F:test/glrenderer.resize.test.js†L15-L41】
  - Keep / change / delete: Keep; encapsulates boilerplate for GL renderer tests. Alternative is to duplicate stub setup within each test.【F:test/glrenderer.resize.test.js†L15-L60】
  - Confidence / assumptions: High confidence; proven by existing smoke test.【F:test/glrenderer.resize.test.js†L15-L60】



- `gl.viewport`
  - Purpose: Stubbed no-op representing `gl.viewport` so the renderer can call it without throwing during tests.【F:test/glrenderer.resize.test.js†L18-L21】【F:src/gl/renderer.js†L149-L155】
  - Inputs: Same signature as real WebGL (`x`, `y`, `width`, `height`), though the stub ignores them.【F:test/glrenderer.resize.test.js†L18-L21】
  - Outputs: `undefined`.【F:test/glrenderer.resize.test.js†L19-L19】
  - Side effects: None; intentionally inert.【F:test/glrenderer.resize.test.js†L19-L19】
  - Shared state touched and where it’s used: Invoked by `renderer.begin()` when preparing each frame (`src/gl/renderer.js:149-155`).【F:src/gl/renderer.js†L149-L155】【F:test/glrenderer.resize.test.js†L45-L55】
  - Dependencies: Defined inside `makeRenderer`; no external requirements.【F:test/glrenderer.resize.test.js†L15-L21】
  - Edge cases handled or missed: Does not validate viewport parameters; adequate for the resize smoke test which only cares about uniform updates.【F:test/glrenderer.resize.test.js†L19-L19】
  - Performance: Constant-time no-op.【F:test/glrenderer.resize.test.js†L19-L19】
  - Units / spaces: Would normally operate in canvas pixels; ignored here.【F:src/gl/renderer.js†L149-L155】
  - Determinism: Always no-op.【F:test/glrenderer.resize.test.js†L19-L19】
  - Keep / change / delete: Keep; simplest stub needed for the test. Alternative is to track calls, but viewport changes aren’t asserted here.【F:test/glrenderer.resize.test.js†L18-L21】
  - Confidence / assumptions: High confidence; fits test scope.【F:test/glrenderer.resize.test.js†L18-L21】



- `gl.clearColor`
  - Purpose: Stub placeholder for `gl.clearColor`, satisfying renderer expectations without touching real GL state.【F:test/glrenderer.resize.test.js†L18-L21】【F:src/gl/renderer.js†L149-L161】
  - Inputs: RGBA floats; ignored by the stub.【F:test/glrenderer.resize.test.js†L20-L20】
  - Outputs: `undefined`.【F:test/glrenderer.resize.test.js†L20-L20】
  - Side effects: None.【F:test/glrenderer.resize.test.js†L20-L20】
  - Shared state touched and where it’s used: Called during `begin()` before clearing the frame.【F:src/gl/renderer.js†L149-L161】【F:test/glrenderer.resize.test.js†L45-L55】
  - Dependencies: Declared inside `makeRenderer`.【F:test/glrenderer.resize.test.js†L15-L21】
  - Edge cases handled or missed: Does not capture parameters; acceptable because the test only inspects viewport uniform behaviour.【F:test/glrenderer.resize.test.js†L20-L20】
  - Performance: Constant-time no-op.【F:test/glrenderer.resize.test.js†L20-L20】
  - Units / spaces: Normally expects colour components in `[0,1]`; ignored here.【F:src/gl/renderer.js†L149-L161】
  - Determinism: Always no-op.【F:test/glrenderer.resize.test.js†L20-L20】
  - Keep / change / delete: Keep; lightweight stub sufficient for the test. Alternative is to record values if future assertions require it.【F:test/glrenderer.resize.test.js†L18-L58】
  - Confidence / assumptions: High confidence.【F:test/glrenderer.resize.test.js†L20-L20】



- `gl.clear`
  - Purpose: No-op stub for `gl.clear`, allowing the renderer to invoke buffer clears without a real WebGL context.【F:test/glrenderer.resize.test.js†L18-L21】【F:src/gl/renderer.js†L149-L161】
  - Inputs: Bitmask flags; ignored.【F:test/glrenderer.resize.test.js†L21-L21】
  - Outputs: `undefined`.【F:test/glrenderer.resize.test.js†L21-L21】
  - Side effects: None.【F:test/glrenderer.resize.test.js†L21-L21】
  - Shared state touched and where it’s used: Executed by `begin()` immediately after setting the clear colour.【F:src/gl/renderer.js†L149-L161】【F:test/glrenderer.resize.test.js†L45-L55】
  - Dependencies: Defined within `makeRenderer`.【F:test/glrenderer.resize.test.js†L15-L21】
  - Edge cases handled or missed: Doesn’t emulate error handling or buffer state; adequate for verifying uniform updates.【F:test/glrenderer.resize.test.js†L21-L21】
  - Performance: Constant-time no-op.【F:test/glrenderer.resize.test.js†L21-L21】
  - Units / spaces: Would normally operate on framebuffer bits; ignored here.【F:src/gl/renderer.js†L149-L161】
  - Determinism: Always no-op.【F:test/glrenderer.resize.test.js†L21-L21】
  - Keep / change / delete: Keep; minimal stub. Alternative is to track invocation counts if tests need it later.【F:test/glrenderer.resize.test.js†L18-L58】
  - Confidence / assumptions: High confidence.【F:test/glrenderer.resize.test.js†L21-L21】



- `gl.uniform2f`
  - Purpose: Test stub for `gl.uniform2f` that records calls so the test can assert whether the view-size uniform updates on resize.【F:test/glrenderer.resize.test.js†L22-L24】
  - Inputs: `location`, `x`, `y` parameters mirroring WebGL’s API.【F:test/glrenderer.resize.test.js†L22-L24】
  - Outputs: `undefined`; instead pushes into the shared `calls` log.【F:test/glrenderer.resize.test.js†L22-L24】
  - Side effects: Appends `[ 'uniform2f', location, x, y ]` into the `calls` array captured outside the stub.【F:test/glrenderer.resize.test.js†L22-L24】
  - Shared state touched and where it’s used: Enables assertions verifying that `u_viewSize` updates only when the canvas size changes (`test/glrenderer.resize.test.js:47-59`).【F:test/glrenderer.resize.test.js†L47-L59】
  - Dependencies: Accesses the closure-scoped `calls` array established in `makeRenderer`.【F:test/glrenderer.resize.test.js†L16-L24】
  - Edge cases handled or missed: Only logs calls; does not coerce inputs or filter by uniform location (test handles filtering).【F:test/glrenderer.resize.test.js†L22-L58】
  - Performance: O(1) per invocation; used twice in the smoke test.【F:test/glrenderer.resize.test.js†L45-L59】
  - Units / spaces: Captures canvas width/height in pixels to confirm resizing behaviour.【F:test/glrenderer.resize.test.js†L51-L59】
  - Determinism: Deterministic; purely records provided arguments.【F:test/glrenderer.resize.test.js†L22-L59】
  - Keep / change / delete: Keep; core to the resize verification. Alternative would be spying via a test framework, which is overkill here.【F:test/glrenderer.resize.test.js†L22-L59】
  - Confidence / assumptions: High confidence.【F:test/glrenderer.resize.test.js†L22-L59】



- `gl.uniform1i`
  - Purpose: Stub for integer uniform updates; returns nothing because the test does not need to track fog toggles.【F:test/glrenderer.resize.test.js†L25-L26】【F:src/gl/renderer.js†L149-L169】
  - Inputs: Uniform location and integer value; ignored.【F:test/glrenderer.resize.test.js†L25-L25】
  - Outputs: `undefined`.【F:test/glrenderer.resize.test.js†L25-L25】
  - Side effects: None.【F:test/glrenderer.resize.test.js†L25-L25】
  - Shared state touched and where it’s used: Called when `begin()` updates fog enable flags based on config.【F:src/gl/renderer.js†L163-L169】【F:test/glrenderer.resize.test.js†L45-L55】
  - Dependencies: Declared in `makeRenderer`.【F:test/glrenderer.resize.test.js†L15-L26】
  - Edge cases handled or missed: Does not record values, so future assertions about fog enable toggling would require enhancements.【F:test/glrenderer.resize.test.js†L25-L25】
  - Performance: Constant-time no-op.【F:test/glrenderer.resize.test.js†L25-L25】
  - Units / spaces: Represents integer uniforms (e.g., booleans as 0/1).【F:src/gl/renderer.js†L163-L169】
  - Determinism: Always no-op.【F:test/glrenderer.resize.test.js†L25-L25】
  - Keep / change / delete: Keep; simplest stub satisfying renderer calls. Alternative is to push into `calls` if future tests need to inspect fog toggles.【F:test/glrenderer.resize.test.js†L25-L55】
  - Confidence / assumptions: High confidence.【F:test/glrenderer.resize.test.js†L25-L25】



- `gl.uniform3f`
  - Purpose: Stub for 3-component uniform updates (fog colour) invoked during `begin()`.【F:test/glrenderer.resize.test.js†L26-L26】【F:src/gl/renderer.js†L163-L169】
  - Inputs: Uniform location and three floats; ignored.【F:test/glrenderer.resize.test.js†L26-L26】
  - Outputs: `undefined`.【F:test/glrenderer.resize.test.js†L26-L26】
  - Side effects: None.【F:test/glrenderer.resize.test.js†L26-L26】
  - Shared state touched and where it’s used: Supports fog colour updates inside `begin()` without needing a real GL context.【F:src/gl/renderer.js†L163-L169】【F:test/glrenderer.resize.test.js†L45-L55】
  - Dependencies: Declared inside `makeRenderer`.【F:test/glrenderer.resize.test.js†L15-L26】
  - Edge cases handled or missed: Does not record values; acceptable because the test focuses on canvas resize behaviour.【F:test/glrenderer.resize.test.js†L26-L26】
  - Performance: Constant-time no-op.【F:test/glrenderer.resize.test.js†L26-L26】
  - Units / spaces: Would normally carry RGB fog components in `[0,1]`; ignored here.【F:src/gl/renderer.js†L163-L169】
  - Determinism: Always no-op.【F:test/glrenderer.resize.test.js†L26-L26】
  - Keep / change / delete: Keep; minimal stub fulfilling renderer requirements. Alternative is to track colour changes if future assertions demand it.【F:test/glrenderer.resize.test.js†L26-L55】
  - Confidence / assumptions: High confidence.【F:test/glrenderer.resize.test.js†L26-L26】
