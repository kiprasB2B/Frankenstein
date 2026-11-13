// Grafo duomenų ir sluoksnių sutartys.
// Architektūra: GraphData → Layout (pozicijos) → Renderer (piešimas) ← GraphView (sąveika).
// 3D režimui pakaktų naujo Layout (pvz. d3-force-3d su z koordinate) ir Renderer (WebGL/three.js),
// GraphView ir duomenų modelis lieka tie patys.

export interface GraphNodeData {
  id: string;
  label: string;
  exists: boolean;
  tags: string[];
  /** Kategorijos spalva „r,g,b“ (pagal aplanką); be jos – pagrindinė spalva. */
  color?: string;
  group?: string;
}

export interface GraphLinkData {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNodeData[];
  links: GraphLinkData[];
}

/** Mazgas su pozicija (z – ateities 3D režimui). */
export interface SimNode extends GraphNodeData {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  degree: number;
  index?: number;
}

export interface SimLink {
  source: SimNode;
  target: SimNode;
}

export interface Layout {
  readonly nodes: SimNode[];
  readonly links: SimLink[];
  setData(data: GraphData): void;
  onTick(cb: () => void): void;
  /** Pakelia simuliacijos „temperatūrą“ (pvz. tempiant mazgą). */
  reheat(alpha?: number): void;
  setDragging(active: boolean): void;
  pin(node: SimNode, x: number, y: number, z?: number): void;
  release(node: SimNode): void;
  stop(): void;
}

export interface Camera {
  x: number; // pasaulio koordinatė ekrano centre
  y: number;
  k: number; // mastelis
  yaw?: number; // 3D: pasukimas apie Y ašį
  pitch?: number; // 3D: pasukimas apie X ašį
}

export interface RenderState {
  camera: Camera;
  hover: SimNode | null;
  active: string | null;
  neighbors: Set<string>;
  filter: string;
}

export interface Renderer {
  readonly canvas: HTMLElement;
  resize(width: number, height: number): void;
  draw(layout: Layout, state: RenderState): void;
  /** Ekrano taškas → mazgas (arba null). */
  pick(layout: Layout, state: RenderState, sx: number, sy: number): SimNode | null;
  /** Ekrano taškas → pasaulio koordinatės (tempiant mazgą). 3D – mazgo gylyje. */
  unproject?(state: RenderState, sx: number, sy: number, node: SimNode): { x: number; y: number; z?: number };
  destroy(): void;
}
