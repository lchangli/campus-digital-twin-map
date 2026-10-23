const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { findShortestPath } = require('../routing.js');

function graph(pairs) {
  const result = {};
  for (const [from, to, dist] of pairs) {
    (result[from] ||= []).push({ to, dist });
    result[to] ||= [];
  }
  return result;
}

test('不存在的起终点、空图与不连通节点都返回无路径', () => {
  const roads = { walking: graph([['A', 'B', 2], ['C', 'D', 3]]) };
  for (const [from, to] of [['', 'B'], ['A', 'missing'], ['missing', 'missing'], ['A', 'D']]) {
    assert.deepEqual(findShortestPath(from, to, roads, 'walking'), { nodes: [], distance: 0, modes: [] });
  }
  assert.deepEqual(findShortestPath('A', 'B', {}, 'walking').nodes, []);
});

test('有效的同一节点返回零距离，而不制造路段', () => {
  assert.deepEqual(findShortestPath('A', 'A', { walking: graph([['A', 'B', 2]]) }, 'walking'), {
    nodes: ['A'], distance: 0, modes: []
  });
});

test('终点仅出现在边的to字段时仍可到达', () => {
  assert.deepEqual(findShortestPath('A', 'B', { walking: { A: [{ to: 'B', dist: 2 }] } }, 'walking'), {
    nodes: ['A', 'B'], distance: 2, modes: ['walking']
  });
});

test('更短路径更新已入队节点，并跳过堆中的旧记录', () => {
  const roads = { walking: graph([
    ['A', 'B', 10], ['A', 'C', 1], ['C', 'B', 1], ['B', 'D', 20], ['C', 'D', 40]
  ]) };
  assert.deepEqual(findShortestPath('A', 'D', roads, 'walking'), {
    nodes: ['A', 'C', 'B', 'D'], distance: 22, modes: ['walking', 'walking', 'walking']
  });
});

test('优先方式改变加权路径，返回的距离仍是实际米数', () => {
  const roads = {
    walking: graph([['A', 'B', 100]]),
    driving: graph([['A', 'B', 20]])
  };
  assert.equal(findShortestPath('A', 'B', roads, 'walking').distance, 100);
  assert.deepEqual(findShortestPath('A', 'B', roads, 'driving'), {
    nodes: ['A', 'B'], distance: 20, modes: ['driving']
  });
});

test('保留混合方式补路段的行为，并逐段返回真实方式', () => {
  const roads = {
    walking: graph([['A', 'B', 4], ['A', 'C', 40]]),
    driving: graph([['B', 'C', 3]])
  };
  assert.deepEqual(findShortestPath('A', 'C', roads, 'walking'), {
    nodes: ['A', 'B', 'C'], distance: 7, modes: ['walking', 'driving']
  });
  assert.deepEqual(findShortestPath('A', 'B', { walking: roads.walking }, 'driving').modes, ['walking']);
});

test('零距离边和环不会导致前驱重建死循环', () => {
  const roads = { walking: graph([['A', 'B', 0], ['B', 'A', 0], ['B', 'C', 1]]) };
  assert.deepEqual(findShortestPath('A', 'C', roads, 'walking'), {
    nodes: ['A', 'B', 'C'], distance: 1, modes: ['walking', 'walking']
  });
});

// 独立使用 WGS84 椭球计算 ECEF 弦长，对照页面中 Cesium 的路段米数。
function cartesian([lon, lat]) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const e2 = 6.6943799901413165e-3;
  const n = 6378137 / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return [n * Math.cos(phi) * Math.cos(lambda), n * Math.cos(phi) * Math.sin(lambda),
    n * (1 - e2) * Math.sin(phi)];
}

function distance(a, b) {
  const p = cartesian(a);
  const q = cartesian(b);
  return Math.hypot(...p.map((value, index) => value - q[index]));
}

test('真实校园路网：南门至新图书馆步行约957米', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '../road/road.geojson'), 'utf8'));
  const roads = { walking: {}, ebike: {}, driving: {} };
  for (const feature of data.features) {
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const line of lines) {
      for (let index = 1; index < line.length; index++) {
        const start = line[index - 1];
        const end = line[index];
        const a = start.slice(0, 2).map(value => value.toFixed(6)).join(',');
        const b = end.slice(0, 2).map(value => value.toFixed(6)).join(',');
        for (const [mode, permission] of [['walking', 'allow_walk'], ['ebike', 'allow_ebik'], ['driving', 'allow_car']]) {
          if (feature.properties[permission] !== 1) continue;
          (roads[mode][a] ||= []).push({ to: b, dist: distance(start, end) });
          (roads[mode][b] ||= []).push({ to: a, dist: distance(start, end) });
        }
      }
    }
  }
  const nodes = [...new Set(Object.values(roads).flatMap(Object.keys))];
  const nearest = point => nodes.reduce((closest, node) =>
    distance(point, node.split(',').map(Number)) < distance(point, closest.split(',').map(Number)) ? node : closest);
  const route = findShortestPath(nearest([114.033551, 32.131955]), nearest([114.033375, 32.140195]), roads, 'walking');
  assert.equal(nodes.length, 452);
  assert.equal(Math.round(route.distance), 957);
  assert.ok(route.nodes.length > 2);
  assert.equal(route.modes.length, route.nodes.length - 1);
  assert.ok(route.modes.every(mode => mode === 'walking'));
});
