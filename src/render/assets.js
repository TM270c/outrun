import { TUNE_PLAYER } from '../config.js';

export const ASSET_MANIFEST = {
  road: 'tex/road-seg.png',
  rail: 'tex/guardrail.png',
  cliff: 'tex/cliff.png',
  boostJump: 'tex/boost.png',
  boostDrive: 'tex/boost.png',
  horizon1: 'tex/paralax-1.png',
  horizon2: 'tex/paralax-2.png',
  horizon3: 'tex/paralax-3.png',
  car: 'tex/car.png',
  semi: 'tex/semi.png',
  tree: 'tex/tree.png',
  sign: 'tex/billboard.png',
};

export async function loadAllTextures(glRenderer) {
  const entries = await Promise.all(
    Object.entries(ASSET_MANIFEST).map(async ([key, path]) => [key, await glRenderer.loadTexture(path)])
  );
  return Object.fromEntries(entries);
}

export function createSpriteMeta(glRenderer, textures) {
  const pickup = glRenderer.makeCircleTex(64);
  return {
    PLAYER: { wN: 0.16, aspect: 0.7, tint: [0.9, 0.22, 0.21, 1], tex: null },
    CAR: { wN: 0.28, aspect: 0.7, tint: [0.2, 0.7, 1.0, 1], tex: () => textures.car || null },
    SEMI: { wN: 0.34, aspect: 1.6, tint: [0.85, 0.85, 0.85, 1], tex: () => textures.semi || null },
    TREE: { wN: 0.5, aspect: 3.0, tint: [0.22, 0.7, 0.22, 1], tex: () => textures.tree || null },
    SIGN: { wN: 0.55, aspect: 1.0, tint: [1.0, 1.0, 1.0, 1], tex: () => textures.sign || null },
    PALM: { wN: 0.38, aspect: 3.2, tint: [0.25, 0.62, 0.27, 1], tex: () => textures.tree || null },
    PICKUP: { wN: 0.1, aspect: 1.0, tint: [1.0, 0.92, 0.2, 1], tex: () => pickup || null },
  };
}

export const getKindScale = (kind) => (kind === 'PLAYER' ? TUNE_PLAYER.playerScale : 1.0);
