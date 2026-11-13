import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation3D } from 'd3-force-3d';
import type { GraphData, Layout, SimLink, SimNode } from './types';
import { nodeRadius } from './forceLayout2d';

/** 3D jėgų išdėstymas su d3-force-3d (ta pati Layout sąsaja kaip 2D). */
export class ForceLayout3D implements Layout {
  nodes: SimNode[] = [];
  links: SimLink[] = [];
  private sim: Simulation3D<SimNode>;
  private tickCb: () => void = () => {};

  constructor() {
    this.sim = forceSimulation<SimNode>([], 3)
      .force('charge', forceManyBody<SimNode>().strength((n: SimNode) => -70 - n.degree * 8).distanceMax(600))
      .force('link', forceLink<SimNode, SimLink>().id((n: SimNode) => n.id).distance(55).strength(0.6))
      .force('center', forceCenter(0, 0, 0))
      .force('collide', forceCollide<SimNode>((n: SimNode) => nodeRadius(n) + 5))
      .alphaDecay(0.02)
      .velocityDecay(0.35)
      .on('tick', () => this.tickCb());
  }

  setData(data: GraphData) {
    const old = new Map(this.nodes.map((n) => [n.id, n]));
    const degree = new Map<string, number>();
    for (const l of data.links) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }
    const N = data.nodes.length;
    this.nodes = data.nodes.map((d, i) => {
      const prev = old.get(d.id);
      // Fibonačio sfera – tolygus pradinis išsidėstymas
      const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(1, N));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 40 + 10 * Math.cbrt(N);
      return {
        ...d,
        x: prev?.x ?? r * Math.sin(phi) * Math.cos(theta),
        y: prev?.y ?? r * Math.sin(phi) * Math.sin(theta),
        z: prev?.z ?? r * Math.cos(phi),
        degree: degree.get(d.id) ?? 0,
      };
    });
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = data.links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)! }));
    this.sim.nodes(this.nodes);
    this.sim.force('link').links(this.links);
    this.sim.alpha(old.size ? 0.3 : 1).restart();
  }

  onTick(cb: () => void) {
    this.tickCb = cb;
  }

  reheat(alpha = 0.3) {
    this.sim.alpha(Math.max(this.sim.alpha(), alpha)).restart();
  }

  setDragging(active: boolean) {
    this.sim.alphaTarget(active ? 0.25 : 0);
    if (active) this.sim.restart();
  }

  pin(node: SimNode, x: number, y: number, z?: number) {
    node.fx = x;
    node.fy = y;
    node.fz = z ?? node.z ?? 0;
  }

  release(node: SimNode) {
    node.fx = node.fy = node.fz = null;
  }

  stop() {
    this.sim.stop();
  }
}
