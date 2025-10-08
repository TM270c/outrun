# Car Collision and Segment Tracking (Plain-English Notes)

## Why we care about the current segment
The game keeps every object (road sprites, cars, pickups) on a repeating list of segments. Knowing which segment the player is on is how we decide which cars can hit you and which props need to be drawn. Losing that link would make the camera and collision checks drift out of sync.

## What the collision step does
1. Every frame `updatePhysics` calls `resolveCollisions` *after* the physics numbers have been updated.
2. The first thing `resolveCollisions` does is ask `segmentAtS(state.phys.s)` which segment owns the player right now. That helper wraps the raw distance so the index always lands inside the track.
3. We only look at cars that live in that segment. If the player’s lane overlap is larger than the combined half-widths **and** the player is moving faster, we treat it as running into the back of the car. We then slow the player to match the car and push the player’s `s` value a little bit behind the NPC (again using wrapping so the number stays valid).
4. Right after the car loop we also check nearby segments for pickups, so collectibles are still found if you crossed a boundary during that frame.

## How physics can “skip” segments
When the player is airborne we keep integrating the forward distance `phys.s` using the current speed and the time step. Because there is no ground friction slowing the car down, that distance can jump farther than one segment length in a single frame. We do **not** visit the skipped segments one by one. Instead, `phys.s` just lands on the final wrapped distance and the next `segmentAtS` call instantly reports the segment that contains that landing point. That is why it can feel like we “skip” segments while in the air.

## Why the tracking still works
- `segmentAtS` always wraps the distance before dividing by the segment size, so even if we skipped several segments in one step, the resulting index still points to the correct segment for the new `s` value.
- Rendering and UI never cache a segment index; they recompute it from `state.phys.s` each frame, so the sprite and horizon stay aligned with the actual wrapped distance.
- Collision responses (like snapping behind a car) also rely on wrapped helpers (`wrapDistance`), so even a sudden backward jump keeps the player tied to a valid segment, preventing desync between physics and what you see on screen.

## Keeping segment bookkeeping during long aerial steps
The tricky part is not *knowing* the landing segment—we already get that for free from `segmentAtS`—but detecting everything we might have crossed while airborne (cars, pickups, triggers). There are a few ways to approach it:

1. **Clamp the aerial displacement.** You can limit the forward motion to at most one segment length per physics step (for example, by capping `phys.vtan * dt`). This guarantees that the next update is still in the neighboring segment, so the usual collision code keeps working. The downside is that it artificially slows the player whenever they have enough speed to travel farther than one segment, and it can make boosts or steep downhill sections feel mushy.
2. **Sub-step the segment traversal instead.** Keep the current high-speed physics, but after each update compute how far you actually moved: `const delta = wrapByLength(newS - oldS, trackLengthRef())`. If `delta` is larger than `segmentLength`, march through the intermediate boundaries yourself. A simple loop that increments `oldS` by `segmentLength` (wrapping each time) lets you call `segmentAtS` for every segment you crossed in that frame and run collision/pickup checks on each one. You can even early-out once the accumulated distance exceeds the actual delta so the loop stays small.
3. **Track entry/exit events explicitly.** Store the previous segment index (from `segmentAtS(oldS)`) and compare it with the new index after the physics step. If they differ, you know how many segments were skipped: `const segDelta = (newIndex - oldIndex + segmentCount) % segmentCount`. You can then iterate `segDelta` times, advancing the segment index via `wrapSegmentIndex` and invoking any per-segment triggers. This avoids floating-point drift entirely because it operates on segment indices.

Any of these strategies keeps the collision system informed about skipped segments without sacrificing the accurate landing position that the current physics provides. Option 2 or 3 are usually preferred: they preserve the fast airborne motion while still giving the collision system a chance to react to every segment the player passed through.
