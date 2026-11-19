import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import {
  mrt, normalView, output, pass, velocity, convertToTexture,
  vec3, vec4, float, dot, mix, smoothstep, length, uv, vec2, max, pow
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';

const grade = (inputColor) => {
  const col = inputColor.rgb;
  const centerUv = uv();
  const luminance = dot(col, vec3(.2126, .7152, .0722));
  const saturated = mix(vec3(luminance), col, 1.1);
  const tint = mix(vec3(.94, 1.0, 1.055), vec3(1.055, .99, .91), smoothstep(.15, .8, luminance));
  const graded = pow(max(saturated.mul(tint), vec3(0)), vec3(.965));
  const vignette = smoothstep(.92, .22, length(centerUv.sub(.5).mul(vec2(1.02, 1.08))));
  return vec4(graded.mul(mix(float(.62), float(1.04), vignette)), inputColor.a);
};

export function createPostPipeline(renderer, scene, camera) {
  const mode = new URLSearchParams(location.search).get('post') || 'full';
  const webgpu = !!renderer.backend?.isWebGPUBackend;
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: normalView, velocity }));

  const color = scenePass.getTextureNode('output');
  const normal = scenePass.getTextureNode('normal');
  const depth = scenePass.getTextureNode('depth');
  const velocityTexture = scenePass.getTextureNode('velocity');

  let final = color;
  if (mode === 'color') {
    pipeline.outputNode = color;
  } else if (mode === 'bloom') {
    pipeline.outputNode = color.add(bloom(color, .62, .52, .82));
  } else if (mode === 'ao') {
    const aoPass = ao(depth, normal, camera);
    const aoTexture = aoPass.getTextureNode();
    pipeline.outputNode = color.mul(vec4(vec3(aoTexture.r), 1));
  } else if (mode === 'ssr') {
    if (!webgpu) {
      pipeline.outputNode = color;
    } else {
      const ssrPass = ssr(convertToTexture(color), depth, normal, { camera, stochastic: false, reflectNonMetals: true, binaryRefine: true, metalnessNode: float(.34), roughnessNode: float(.2) });
      ssrPass.quality.value = .5;
      ssrPass.maxDistance.value = 16;
      ssrPass.thickness.value = .24;
      ssrPass.intensity.value = .62;
      ssrPass.resolutionScale = .7;
      pipeline.outputNode = color.add(ssrPass.getTextureNode().mul(.62));
    }
  } else if (mode === 'motion') {
    pipeline.outputNode = motionBlur(convertToTexture(color), velocityTexture, 10);
  } else {
    const aoPass = ao(depth, normal, camera);
    const aoTexture = aoPass.getTextureNode();
    const aoColor = color.mul(vec4(vec3(aoTexture.r), 1));
    final = aoColor;
    if (webgpu) {
      const ssrPass = ssr(convertToTexture(aoColor), depth, normal, { camera, stochastic: false, reflectNonMetals: true, binaryRefine: true, metalnessNode: float(.34), roughnessNode: float(.2) });
      ssrPass.quality.value = .58;
      ssrPass.maxDistance.value = 18;
      ssrPass.thickness.value = .24;
      ssrPass.intensity.value = .68;
      ssrPass.resolutionScale = .72;
      final = aoColor.add(ssrPass.getTextureNode().mul(.68));
    }
    final = final.add(bloom(final, .58, .52, .82));
    final = motionBlur(convertToTexture(final), velocityTexture, 10);
    pipeline.outputNode = grade(final);
  }
  pipeline.outputColorTransform = true;

  return {
    pipeline,
    mode,
    render() { pipeline.render(); },
    setSize() {},
    get isWebGPU() { return webgpu; }
  };
}
