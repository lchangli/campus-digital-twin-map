// 纯路网算法：浏览器通过 CampusRouting 使用，Node.js 可直接运行回归测试。
(function () {
  class MinHeap {
    constructor() {
      this.items = [];
    }

    push(item) {
      const items = this.items;
      let index = items.length;
      items.push(item);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (items[parent].cost <= item.cost) break;
        items[index] = items[parent];
        index = parent;
      }
      items[index] = item;
    }

    pop() {
      const items = this.items;
      const first = items[0];
      const last = items.pop();
      if (items.length > 0) {
        let index = 0;
        while (index * 2 + 1 < items.length) {
          let child = index * 2 + 1;
          if (child + 1 < items.length && items[child + 1].cost < items[child].cost) child++;
          if (last.cost <= items[child].cost) break;
          items[index] = items[child];
          index = child;
        }
        items[index] = last;
      }
      return first;
    }
  }

  function findShortestPath(startNodeId, endNodeId, allRoadData, preferredMode) {
    const modes = ['driving', 'ebike', 'walking'];
    const modeWeights = { walking: 2, ebike: 5, driving: 10 };
    if (Object.hasOwn(modeWeights, preferredMode)) modeWeights[preferredMode] = 1;

    const allNodes = new Set();
    for (const mode of modes) {
      for (const [node, edges] of Object.entries(allRoadData[mode] || {})) {
        allNodes.add(node);
        for (const edge of edges) allNodes.add(edge.to);
      }
    }

    const noPath = { nodes: [], distance: 0, modes: [] };
    if (!allNodes.has(startNodeId) || !allNodes.has(endNodeId)) return noPath;
    if (startNodeId === endNodeId) return { nodes: [startNodeId], distance: 0, modes: [] };

    const distances = new Map([[startNodeId, 0]]);
    const previous = new Map();
    const queue = new MinHeap();
    queue.push({ node: startNodeId, cost: 0 });

    while (queue.items.length > 0) {
      const { node, cost } = queue.pop();
      // 同一节点的更短路径入队后，略过先前留下的较大代价。
      if (cost !== distances.get(node)) continue;
      if (node === endNodeId) break;

      for (const mode of modes) {
        for (const edge of allRoadData[mode]?.[node] || []) {
          const nextCost = cost + edge.dist * modeWeights[mode];
          if (nextCost < (distances.get(edge.to) ?? Infinity)) {
            distances.set(edge.to, nextCost);
            previous.set(edge.to, { from: node, mode, dist: edge.dist });
            queue.push({ node: edge.to, cost: nextCost });
          }
        }
      }
    }

    if (!distances.has(endNodeId)) return noPath;

    const nodes = [endNodeId];
    const pathModes = [];
    let distance = 0;
    for (let node = endNodeId; node !== startNodeId;) {
      const edge = previous.get(node);
      nodes.push(edge.from);
      pathModes.push(edge.mode);
      distance += edge.dist;
      node = edge.from;
    }
    return { nodes: nodes.reverse(), distance, modes: pathModes.reverse() };
  }

  const api = { findShortestPath };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.CampusRouting = api;
})();
