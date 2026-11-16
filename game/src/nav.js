// The waypoint graph the bots walk: breadth-first search over the map's hand-placed
// nodes, with a nearest-node lookup for any position. Paths are short (the graph has
// 41 nodes), so BFS is instant and needs no weights.
export function createNav(nodes, edges) {
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  function nearest(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const dx = nodes[i][0] - x;
      const dz = nodes[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  // Returns waypoints as [x, z] pairs from the caller's position to the target, the
  // first being the next node to walk to. Empty when already there.
  function path(fromX, fromZ, toX, toZ) {
    const start = nearest(fromX, fromZ);
    const goal = nearest(toX, toZ);
    if (start === goal) return [[toX, toZ]];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      if (node === goal) break;
      for (const next of adjacency[node]) {
        if (prev[next] === -1) {
          prev[next] = node;
          queue.push(next);
        }
      }
    }
    if (prev[goal] === -1) return [[toX, toZ]];
    const chain = [];
    let node = goal;
    while (node !== start) {
      chain.push(nodes[node]);
      node = prev[node];
    }
    chain.reverse();
    chain.push([toX, toZ]);
    return chain;
  }

  return { nearest, path, nodes };
}
