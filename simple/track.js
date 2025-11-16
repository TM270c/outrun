import { World } from './world.js';

function createSegment(index, curve = 0, cliffLeft = 0, cliffRight = 0) {
  const z = index * World.segmentLength;
  return {
    index,
    curve,
    cliffLeft,
    cliffRight,
    p1: { world: { x: 0, y: 0, z } },
    p2: { world: { x: 0, y: 0, z: z + World.segmentLength } },
  };
}

function repeat(segments, length, curve = 0, cliffs = 0, switchSides = false) {
  const startIndex = segments.length;
  for (let i = 0; i < length; i += 1) {
    const cliffLeft = switchSides ? cliffs && (i % 2 === 0 ? cliffs : 0) : cliffs;
    const cliffRight = switchSides ? cliffs && (i % 2 !== 0 ? cliffs : 0) : cliffs;
    segments.push(createSegment(startIndex + i, curve, cliffLeft, cliffRight));
  }
}

export function buildTrack() {
  const segments = [];

  repeat(segments, 80, 0, 0);
  repeat(segments, 60, 0.0005, 700, true);
  repeat(segments, 40, 0, 0);
  repeat(segments, 70, -0.0008, 1100, false);
  repeat(segments, 80, 0.0002, 400, true);
  repeat(segments, 120, 0, 0);

  const totalSegments = segments.length;
  for (let i = 0; i < 60; i += 1) {
    segments.push(createSegment(totalSegments + i, 0, 900, 900));
  }

  return segments;
}
