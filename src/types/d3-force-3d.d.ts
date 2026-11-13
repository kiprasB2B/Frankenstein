// Minimalūs d3-force-3d tipai (paketas jų neturi). API sutampa su d3-force + Z ašis.
declare module 'd3-force-3d' {
  export interface Force3D<N> {
    (alpha: number): void;
    initialize?(nodes: N[], ...args: unknown[]): void;
    [k: string]: any;
  }
  export interface Simulation3D<N> {
    nodes(): N[];
    nodes(n: N[]): this;
    force(name: string): any;
    force(name: string, f: any): this;
    alpha(): number;
    alpha(a: number): this;
    alphaTarget(a: number): this;
    alphaDecay(a: number): this;
    velocityDecay(a: number): this;
    numDimensions(n: number): this;
    restart(): this;
    stop(): this;
    on(type: string, cb: () => void): this;
  }
  export function forceSimulation<N>(nodes?: N[], numDimensions?: number): Simulation3D<N>;
  export function forceManyBody<N>(): any;
  export function forceLink<N, L>(links?: L[]): any;
  export function forceCenter<N>(x?: number, y?: number, z?: number): any;
  export function forceCollide<N>(radius?: number | ((n: N) => number)): any;
  export function forceX<N>(x?: number): any;
  export function forceY<N>(y?: number): any;
  export function forceZ<N>(z?: number): any;
}
