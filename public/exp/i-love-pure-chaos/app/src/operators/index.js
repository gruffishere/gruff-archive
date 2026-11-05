import * as pixelSort from './pixel-sort.js';
import * as channelShift from './channel-shift.js';
import * as bitCrush from './bit-crush.js';
import * as jpegBomb from './jpeg-bomb.js';
import * as blockShuffle from './block-shuffle.js';
import * as displacement from './displacement.js';
import * as noise from './noise.js';
import * as threshold from './threshold.js';
import * as vhsTracking from './vhs-tracking.js';
import * as scratch from './scratch.js';
import * as databend from './databend.js';
import * as chromaticAberration from './chromatic-aberration.js';
import * as frameBlend from './frame-blend.js';
import * as scramble from './scramble.js';
import * as waveTear from './wave-tear.js';
import * as rgbCorrupt from './rgb-corrupt.js';
import * as glitchZoom from './glitch-zoom.js';
import * as paletteCorrupt from './palette-corrupt.js';

export const OPERATORS = [
  pixelSort,
  channelShift,
  bitCrush,
  jpegBomb,
  blockShuffle,
  displacement,
  noise,
  threshold,
  vhsTracking,
  scratch,
  databend,
  chromaticAberration,
  frameBlend,
  scramble,
  waveTear,
  rgbCorrupt,
  glitchZoom,
  paletteCorrupt,
];
