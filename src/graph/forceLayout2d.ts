import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import type { GraphData, Layout, SimLink, SimNode } from './types';

/** 2D jėgų išdėstymas su d3-force. */
export class ForceLayout2D implements Layout {
  nodes: SimNode[] = [];
  links: SimLink[] = [];
  private sim: Simulation<SimNode, SimLink>;
  private tickCb: () => void = () => {};

  constructor() {
    this.sim = forceSimulation<SimNode, SimLink>()
      .force('charge', forceManyBody<SimNode>().strength((n) => -60 - n.degree * 8).distanceMax(500))
      .force('link', forceLink<SimNode, SimLink>().id((n) => n.id).distance(60).strength(0.6))
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('x', forceX(0).strength(0.03))
      .force('y', forceY(0).strength(0.03))
      .force('collide', forceCollide<SimNode>().radius((n) => nodeRadius(n) + 6))
      .alphaDecay(0.025)
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
    this.nodes = data.nodes.map((d, i) => {
      const prev = old.get(d.id);
      const angle = i * 2.399963; // auksinis kampas – tolygus pradinis išsidėstymas
      const r = 12 * Math.sqrt(i + 1);
      return {
        ...d,
        x: prev?.x ?? Math.cos(angle) * r,
        y: prev?.y ?? Math.sin(angle) * r,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        degree: degree.get(d.id) ?? 0,
      };
    });
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = data.links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)! }));
    this.sim.nodes(this.nodes);
    (this.sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>).links(this.links);
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

  pin(node: SimNode, x: number, y: number) {
    node.fx = x;
    node.fy = y;
  }

  release(node: SimNode) {
    node.fx = null;
    node.fy = null;
  }

  stop() {
    this.sim.stop();
  }
}

export function nodeRadius(n: SimNode): number {
  return (n.exists ? 3.5 : 2.5) + Math.sqrt(n.degree) * 1.8;
}
