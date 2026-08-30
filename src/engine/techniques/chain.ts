/**
 * Chain scaffolding shared by simple colouring and remote pairs.
 *
 * Both techniques build the same shape: an undirected graph over cells whose
 * edges mean "these two cells hold opposite truth values". Two-colouring such a
 * graph partitions a connected component into a set that is all-true and a set
 * that is all-false — we never learn which, and that is exactly the point: any
 * conclusion that holds under both assignments is proved.
 *
 * The colouring is only meaningful if the component is bipartite. A non-
 * bipartite component means some cycle of alternating links closes on itself
 * with the wrong parity, which is a contradiction in the puzzle rather than a
 * deduction we are entitled to make. Such components are reported as
 * `bipartite: false` and every caller skips them: a detector that reasoned from
 * one could emit an arbitrary elimination, and an unsound elimination is the
 * one bug this engine must not have (R6).
 */

import type { CellIndex, House } from '../types';

/** An "exactly one of these two" edge, and the house that justifies it. */
export interface Link {
  a: CellIndex;
  b: CellIndex;
  house: House;
}

export type Color = 0 | 1;

export interface ChainComponent {
  /** Every cell in the component, ascending. */
  cells: CellIndex[];
  /** The links wholly inside the component. */
  links: Link[];
  color: ReadonlyMap<CellIndex, Color>;
  adjacency: ReadonlyMap<CellIndex, readonly CellIndex[]>;
  /** False when some link joins two cells of the same colour — see the header. */
  bipartite: boolean;
}

/**
 * Connected components of the link graph, each two-coloured. Components come
 * back ordered by their lowest cell, and each component's `cells` and
 * adjacency lists are ascending, so a detector scanning them is deterministic.
 */
export function chainComponents(links: readonly Link[]): ChainComponent[] {
  const adjacency = new Map<CellIndex, CellIndex[]>();
  const incident = new Map<CellIndex, Link[]>();
  const add = (from: CellIndex, to: CellIndex, link: Link): void => {
    const neighbours = adjacency.get(from) ?? [];
    if (!neighbours.includes(to)) neighbours.push(to);
    adjacency.set(from, neighbours);
    const touching = incident.get(from) ?? [];
    touching.push(link);
    incident.set(from, touching);
  };
  for (const link of links) {
    add(link.a, link.b, link);
    add(link.b, link.a, link);
  }
  for (const neighbours of adjacency.values()) neighbours.sort((x, y) => x - y);

  const nodes = [...adjacency.keys()].sort((x, y) => x - y);
  const color = new Map<CellIndex, Color>();
  const components: ChainComponent[] = [];

  for (const root of nodes) {
    if (color.has(root)) continue;
    color.set(root, 0);
    const cells: CellIndex[] = [root];
    for (let head = 0; head < cells.length; head++) {
      const cell = cells[head];
      const next: Color = color.get(cell) === 0 ? 1 : 0;
      for (const neighbour of adjacency.get(cell) ?? []) {
        if (color.has(neighbour)) continue;
        color.set(neighbour, next);
        cells.push(neighbour);
      }
    }
    cells.sort((x, y) => x - y);
    const member = new Set(cells);
    const inside = [...new Set(cells.flatMap((c) => incident.get(c) ?? []))];
    components.push({
      cells,
      links: inside,
      color: new Map(cells.map((c) => [c, color.get(c) as Color])),
      adjacency: new Map(cells.map((c) => [c, (adjacency.get(c) ?? []).filter((n) => member.has(n))])),
      bipartite: inside.every((l) => color.get(l.a) !== color.get(l.b)),
    });
  }
  return components;
}

/**
 * Shortest path from `from` to `to` through the component, inclusive of both
 * ends, or null when they are not connected. Used as a finding's evidence: the
 * player is shown the chain that carries the argument, not the whole component.
 */
export function shortestPath(
  component: ChainComponent,
  from: CellIndex,
  to: CellIndex,
): CellIndex[] | null {
  if (from === to) return [from];
  const parent = new Map<CellIndex, CellIndex>([[from, from]]);
  const queue: CellIndex[] = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbour of component.adjacency.get(queue[head]) ?? []) {
      if (parent.has(neighbour)) continue;
      parent.set(neighbour, queue[head]);
      if (neighbour === to) {
        const path: CellIndex[] = [to];
        while (path[0] !== from) path.unshift(parent.get(path[0]) as CellIndex);
        return path;
      }
      queue.push(neighbour);
    }
  }
  return null;
}

/** The houses justifying each step of `path`, in order. */
export function pathHouses(component: ChainComponent, path: readonly CellIndex[]): House[] {
  const houses: House[] = [];
  for (let i = 1; i < path.length; i++) {
    const link = component.links.find(
      (l) =>
        (l.a === path[i - 1] && l.b === path[i]) || (l.b === path[i - 1] && l.a === path[i]),
    );
    if (link) houses.push(link.house);
  }
  return houses;
}
