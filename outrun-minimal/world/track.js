import { segmentLength } from '../core/config.js';
import { ease01 } from '../core/math.js';

const trackSections = [
  {
    id: 'intro',
    lengthSegments: 35,
    curve: 0.0,
    heightDelta: 0,
    guardrails: 'both',
    boostType: 'none',
    boostStartSegment: 0,
    boostEndSegment: 0,
    boostCenterT: 0.5,
    cliffLeftId: 'mesa-left',
    cliffRightId: 'mesa-right'
  },
  {
    id: 'sway',
    lengthSegments: 42,
    curve: -1.4,
    heightDelta: 12,
    guardrails: 'left',
    boostType: 'drive',
    boostStartSegment: 12,
    boostEndSegment: 22,
    boostCenterT: 0.55,
    cliffLeftId: 'mesa-left'
  },
  {
    id: 'crest',
    lengthSegments: 30,
    curve: 1.8,
    heightDelta: -18,
    guardrails: 'right',
    boostType: 'jump',
    boostStartSegment: 8,
    boostEndSegment: 14,
    boostCenterT: 0.45,
    cliffRightId: 'mesa-right'
  }
];

const cliffProfiles = [
  {
    id: 'mesa-left',
    side: 'left',
    lengthSegments: 32,
    offsets: [0, 1.5, 3.2, 4.4, 5.1, 4.8, 3.0, 1.2, 0.5, 0.3, 0.1, 0]
  },
  {
    id: 'mesa-right',
    side: 'right',
    lengthSegments: 28,
    offsets: [0, 0.8, 2.5, 3.5, 4.1, 3.4, 2.2, 1.1, 0.4, 0.1, 0]
  }
];

function buildSegments(sections = trackSections) {
  const segments = [];
  let z = 0;
  let startY = 0;

  sections.forEach((section) => {
    for (let i = 0; i < section.lengthSegments; i += 1) {
      const t = section.lengthSegments <= 1 ? 0 : i / (section.lengthSegments - 1);
      const et = ease01(t);
      const curve = section.curve * et;
      const centerY = startY + section.heightDelta * et;

      segments.push({
        index: segments.length,
        sectionId: section.id,
        localIndex: i,
        t,
        zStart: z,
        zEnd: z + segmentLength,
        centerY,
        curve,
        guardrails: section.guardrails,
        boostType: section.boostType,
        inBoostZone: i >= section.boostStartSegment && i <= section.boostEndSegment,
        boostCenterT: section.boostCenterT,
        cliffLeftId: section.cliffLeftId,
        cliffRightId: section.cliffRightId
      });

      z += segmentLength;
    }

    startY += section.heightDelta;
  });

  return { segments, length: z };
}

function getCliffProfile(id) {
  return cliffProfiles.find((profile) => profile.id === id);
}

export { trackSections, cliffProfiles, buildSegments, getCliffProfile };
