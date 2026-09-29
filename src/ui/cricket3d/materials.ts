import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { colors, scene } from '../tokens';
import { BALL, BEZEL, CYLINDER, DIAL, LIGHT, PITCH, PLATE, rgb, STADIUM } from './shaders';

type Name = 'ball' | 'cylinder' | 'pitch' | 'stadium' | 'bezel' | 'dial' | 'plate';
const SOURCES: Record<Name, string> = {
  ball: BALL,
  cylinder: CYLINDER,
  pitch: PITCH,
  stadium: STADIUM,
  bezel: BEZEL,
  dial: DIAL,
  plate: PLATE,
};
const compiled = new Map<Name, SkRuntimeEffect | null>();

/**
 * A kit shader, compiled once for the life of the app. Null if this phone's
 * Skia cannot compile it; every component then draws nothing rather than
 * failing the screen it sits on.
 */
export function effect(name: Name): SkRuntimeEffect | null {
  if (!compiled.has(name)) {
    let made: SkRuntimeEffect | null = null;
    try {
      made = Skia.RuntimeEffect.Make(SOURCES[name]);
    } catch {
      made = null;
    }
    compiled.set(name, made);
  }
  return compiled.get(name) ?? null;
}

const lime = rgb(colors.accent);

/** Every material the kit paints with, as shader colours, from the tokens. */
export const MATERIAL = {
  light: LIGHT,
  lime,
  /** The seam: the ball's own lime, deep in shade. */
  seam: [lime[0] * 0.5, lime[1] * 0.55, lime[2] * 0.3] as [number, number, number],
  wood: rgb(scene.wood),
  floodlight: rgb(scene.floodlight),
  night: rgb(scene.night),
  haze: rgb(scene.haze),
  turf: rgb(scene.turf),
  turfDeep: rgb(scene.turfDeep),
  pitch: rgb(scene.pitch),
  pitchWorn: rgb(scene.pitchWorn),
  crease: rgb(scene.crease),
  metal: rgb(scene.metal),
  metalDark: rgb(scene.metalDark),
  bg: rgb(colors.bg),
  surface: rgb(colors.surface),
};
