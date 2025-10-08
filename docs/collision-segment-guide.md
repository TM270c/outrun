# Segment Tracking and Airborne Collision Reference

## Why the current segment matters
The game keeps cars, scenery sprites, and pickups in per-segment buckets. As long as we know the player's active segment index we can figure out which cars to collide with, which props to draw, and which triggers to fire. Losing that index would desync collisions and rendering from the physics position.

## Baseline collision flow
`updatePhysics` runs every frame and calls `resolveCollisions` after integrating the player's motion. The collision helper looks up the segment that contains the player, gathers any additional segments we crossed during the frame, and then processes car and pickup checks for each visited slice of track.【F:src/gameplay.js†L549-L599】【F:src/gameplay.js†L786-L788】

Within each segment the car loop compares the player's normalized lane position with every NPC car's offset. If the player is faster than the car and their half-widths overlap, we clamp the player's ground speed to the NPC's speed and rewind the wrapped ground distance so the player snaps in behind the traffic car.【F:src/gameplay.js†L530-L546】 Pickups in the same segment (and in immediate neighbors) are then checked so collectibles register even when the player crosses a boundary mid-frame.【F:src/gameplay.js†L517-L599】

## How the player can skip segments
The physics update integrates `phys.s` using the ground tangent when the player is driving and the stored airborne velocity components when the player is in the air. Because the airborne branch has no ground friction, `phys.s` can advance more than one segment length in a single frame, so a plain `segmentAtS` call would only ever see the landing segment.【F:src/gameplay.js†L646-L707】

## Segment stepping implementation
To keep track of every segment we touched during a fast frame, the update captures the starting segment index before integrating motion. After the physics step finishes we compute how many segment indices we advanced (or rewound) and ask `resolveCollisions` to walk that many steps, invoking the per-segment logic on each intermediate index before finally visiting the landing segment.【F:src/gameplay.js†L605-L608】【F:src/gameplay.js†L750-L788】 This makes collision and pickup logic aware of rapid teleports, boosts, or hops that traverse multiple segments in one tick.

## Why airborne car hits still fail
Even with segment stepping, airborne collisions do not "stick." The collision handler only adjusts the ground velocity (`phys.vtan`) and rewinds the wrapped position. The airborne integration, however, continues to use the cached hop velocity components (`phys.vx`/`phys.vy`), so on the next frame the player immediately advances past the NPC again. None of the airborne state—velocity components or grounded flag—is updated when the collision fires, so the response never affects the numbers that the air branch reads.【F:src/gameplay.js†L530-L546】【F:src/gameplay.js†L688-L707】

## Next steps
To make airborne collisions resolve correctly we need to reconcile the hop velocity with the car impact. Projecting the car's speed onto the airborne tangent, updating `phys.vx`/`phys.vy`, and potentially forcing the player to land would keep the subsequent physics ticks aligned with the collision result. That follow-up change will ensure segment-aware collisions work both on the road and while airborne.
