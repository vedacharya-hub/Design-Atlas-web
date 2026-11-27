import type { ShaderDefinition } from '../../lib/custom-effect-runtime';
import {
  setup as setupLiquidMetal,
  render as renderLiquidMetal,
  manifest as manifestLiquidMetal,
} from '../../lib/custom-effects/CodeComponentId_c421a4d62d3ef0ba266d0523fef883b785f6ebbc_3160';

/** "Liquid Metal" shader fill on the Iris mark in the Figma panel design; params copied from the file. */
export const LIQUID_METAL: ShaderDefinition = {
  setup: setupLiquidMetal,
  render: renderLiquidMetal,
  manifest: manifestLiquidMetal,
  params: {
    bands: 2.4000000953674316,
    definition: 4,
    color2: { r: 0.574462890625, g: 0.574462890625, b: 0.574462890625, a: 1 },
    frequency: 0.10000000149011612,
    speed: 1.600000023841858,
    exposure: 1.100000023841858,
    saturation: 1,
    contrastAmt: 1.100000023841858,
    amplitude: 0.6000000238418579,
    color1: { r: 1, g: 1, b: 1, a: 1 },
    color3: { r: 0.5440955758094788, g: 0.5440955758094788, b: 0.5440955758094788, a: 1 },
    grain: 0.1599999964237213,
    color4: { r: 0.6268404722213745, g: 0.6173756718635559, b: 0.6173756718635559, a: 1 },
    featureScale: 0.4000000059604645,
    seed: 32,
  },
};
