import { describe, expect, it } from 'vitest';
import { BRIDGES } from '../content/bridges.ts';
import { generateWorld } from '../world/index.ts';
import { bridgeBays } from '../render/bridges.ts';
import { buildBridgeGeometry } from './bridge.ts';

describe('viaduct bay geometry', () => {
  const g = buildBridgeGeometry();
  const M = BRIDGES.model;

  it('is one merged geometry with colour, ao and emissive, under the triangle budget', () => {
    for (const a of ['position', 'normal', 'color', 'ao', 'emissive'])
      expect(g.getAttribute(a), a).toBeTruthy();
    const tris = g.getAttribute('position').count / 3;
    expect(tris).toBeLessThan(900);
    expect(tris).toBeGreaterThan(100);
    expect(buildBridgeGeometry(1).getAttribute('position').count).toBeLessThan(
      g.getAttribute('position').count,
    );
  });

  it('has the deck top at y = 0, spans one bay along z and feet under the sea', () => {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.z).toBeCloseTo(-M.bay / 2, 3);
    expect(bb.max.z).toBeCloseTo(M.bay / 2, 3);
    expect(bb.min.y).toBeCloseTo(-M.pierDepth, 3);
    // parapet + cap + lamp stay below ~4 u above the deck
    expect(bb.max.y).toBeLessThan(4);
    expect(bb.max.y).toBeGreaterThan(M.parapetH);
    // body is the deck width (+ cornice overhang), centred
    expect(bb.max.x).toBeLessThan(M.deckW / 2 + 0.4);
    expect(bb.min.x).toBeCloseTo(-bb.max.x, 2);
  });

  it('is deterministic', () => {
    const a = Array.from(buildBridgeGeometry().getAttribute('color').array);
    expect(Array.from(buildBridgeGeometry().getAttribute('color').array)).toEqual(a);
  });

  it('bays tile each bridge end to end along its deck', () => {
    const w = generateWorld(1001);
    const bays = bridgeBays(w.bridges);
    expect(bays).toHaveLength(w.bridges.reduce((n, b) => n + b.bays, 0));
    const b = w.bridges[0];
    const first = bays[0];
    const last = bays[b.bays - 1];
    const half = (b.length / b.bays) * 0.5;
    const along = (p: { x: number; z: number }): number =>
      (p.x - b.ax) * Math.sin(b.yaw) + (p.z - b.az) * Math.cos(b.yaw);
    expect(along(first) - half).toBeCloseTo(0, 3);
    expect(along(last) + half).toBeCloseTo(b.length, 3);
    expect(first.stretch).toBeCloseTo(b.length / b.bays / M.bay, 6);
    expect(first.y).toBeGreaterThan(Math.min(b.ay, b.by) - 0.01);
  });
});
