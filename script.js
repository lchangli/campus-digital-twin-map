CampusUI.initSession();


let pickMode = null;
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;
let tiles3dLayer;
let roadNodes = [];
let roadLoadError = null;
let roadData = {
  walking: {},
  ebike: {},
  driving: {}
};


// 本项目使用本地模型和第三方底图，不在源码中保存个人 Cesium ion token。

const map = new mars3d.Map("mars3dContainer", {
  scene: {
    center: { lat: 32.137, lng: 114.035, alt: 2500, heading: 0, pitch: -45 }
  },
  control: {
    geocoder: false,
    baseLayerPicker: false
  },
  terrain: {
    show: false
  },
  basemaps: [
    {
      name: "腾讯深蓝 (推荐)",
      type: "tencent",
      layer: "custom",
      style: 4,
      show: true
    },
    {
      name: "高德月光银",
      type: "gaode",
      layer: "vec",
      style: "light",
      show: false
    }
  ]
});

const viewer = map.viewer;

map.clock.currentTime = Cesium.JulianDate.fromDate(new Date("2022-11-01 12:00:00"));
map.scene.light = new Cesium.DirectionalLight({
  direction: map.scene.camera.direction
});
map.camera.percentageChanged = 0.001;
map.on(mars3d.EventType.cameraChanged, function (event) {
  map.scene.light.direction = map.scene.camera.direction;
});

const silhouetteBlue = Cesium.PostProcessStageLibrary.createEdgeDetectionStage();
silhouetteBlue.uniforms.color = Cesium.Color.YELLOW;
silhouetteBlue.uniforms.length = 0.02;
silhouetteBlue.selected = [];
if (viewer.scene.postProcessStages.get(0)?.name !== 'silhouette') {
  viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createSilhouetteStage([silhouetteBlue]));
}

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(114.03465, 32.13705, 2500),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),
    roll: 0.0
  },
  duration: 3
});


const pickGraphicLayer = new mars3d.layer.GraphicLayer({
  name: "选点标记图层",
  zIndex: 1000
});
map.addLayer(pickGraphicLayer);

function addRoadLayer(geojson) {
  const roadLayer = new mars3d.layer.GeoJsonLayer({
    name: "校园道路",
    data: geojson,
    symbol: {
      styleOptions: {
        width: 3,
        material: Cesium.Color.fromCssColorString('#FFD700').withAlpha(0.8),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.TERRAIN
      }
    },
    popup: "名称：{name}"
  });
  map.addLayer(roadLayer);
}

const addBuildings = async () => {
  try {
    tiles3dLayer = new mars3d.layer.TilesetLayer({
      name: "校园建筑白模",
      url: "./model/tileset.json",
      maximumScreenSpaceError: 1,
      popup: [
        { field: "name", name: "名称" },
        { field: "height", name: "高度", unit: "米" }
      ],
      marsJzwStyle: false,
      customShader: new Cesium.CustomShader({
        lightingModel: Cesium.LightingModel.PBR,
        fragmentShaderText: `
            void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
            {
              vec3 baseColor = vec3(0.7, 0.7, 0.7);
              vec4 position = czm_inverseModelView * vec4(fsInput.attributes.positionEC, 1);
              float heightFactor = clamp(position.z / 100.0, 0.0, 1.0);
              material.diffuse = baseColor + (heightFactor * 0.2); 
              material.roughness = 0.5;
            } `
      })
    });
    map.addLayer(tiles3dLayer);

    tiles3dLayer.readyPromise.then(() => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(114.034902, 32.126723, 1500),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0
        },
        duration: 2
      });
    });
  } catch (error) {
    console.error("模型加载失败", error);
  }
};
addBuildings();

async function loadMyTileset() {
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl('./Data/tileset.json', {
      progressiveResolutionHeightFraction: 0.5,
      maximumScreenSpaceError: 16,
    });

    viewer.scene.primitives.add(tileset);
    await viewer.zoomTo(tileset);

    const heightOffset = -125;
    const cartographic = Cesium.Cartographic.fromCartesian(tileset.boundingSphere.center);
    const surface = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0.0);
    const offset = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, heightOffset);
    const translation = Cesium.Cartesian3.subtract(offset, surface, new Cesium.Cartesian3());
    tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);

    console.log("3DTiles loaded");
  } catch (error) {
    console.error("load tileset error:", error);
  }
}
loadMyTileset();


const featurePoints = CampusData.featurePoints;

fetch("./road/road.geojson")
  .then(res => {
    if (!res.ok) throw new Error(`路网请求失败（HTTP ${res.status}）`);
    return res.json();
  })
  .then(geojson => {
    roadData.walking = {};
    roadData.ebike = {};
    roadData.driving = {};
    const allNodesSet = new Set();

    geojson.features.forEach(feature => {
      const geom = feature.geometry;
      const props = feature.properties;
      if (!geom) return;

      let lines = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;

      lines.forEach(coords => {
        for (let i = 0; i < coords.length - 1; i++) {
          const p1 = coords[i];
          const p2 = coords[i + 1];
          const node1 = p1[0].toFixed(6) + "," + p1[1].toFixed(6);
          const node2 = p2[0].toFixed(6) + "," + p2[1].toFixed(6);

          const dist = Cesium.Cartesian3.distance(
            Cesium.Cartesian3.fromDegrees(p1[0], p1[1]),
            Cesium.Cartesian3.fromDegrees(p2[0], p2[1])
          );

          const addToGraph = (graph, n1, n2, d) => {
            if (!graph[n1]) graph[n1] = [];
            graph[n1].push({ to: n2, dist: d });
            if (!graph[n2]) graph[n2] = [];
            graph[n2].push({ to: n1, dist: d });
          };

          if (props.allow_walk === 1) addToGraph(roadData.walking, node1, node2, dist);
          if (props.allow_ebik === 1) addToGraph(roadData.ebike, node1, node2, dist);
          if (props.allow_car === 1) addToGraph(roadData.driving, node1, node2, dist);

          allNodesSet.add(node1);
          allNodesSet.add(node2);
        }
      });
    });

    roadNodes = Array.from(allNodesSet).filter(node =>
      roadData.walking[node] || roadData.ebike[node] || roadData.driving[node]
    );
    if (roadNodes.length === 0) throw new Error('路网中没有可通行路段');
    addRoadLayer(geojson);
  })
  .catch(error => {
    roadNodes = [];
    roadLoadError = error;
    document.getElementById('pathInfo').textContent = '路网数据加载失败，请刷新页面重试。';
    console.error('路网数据加载失败：', error);
  });


featurePoints.forEach(point => {
  viewer.entities.add({
    id: point.name,
    position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 2),
    point: {
      pixelSize: 6,
      color: Cesium.Color.fromCssColorString('#48BB78').withAlpha(0.9),
      outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: point.name,
      font: '12px MicroSoft YaHei',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -12),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1500)
    },
    description: `
            <div style="padding: 10px; background: rgba(42, 42, 42, 0.8); color: white; border-radius: 4px;">
                <b style="font-size: 16px;">${point.name}</b><br/>
                <hr/>
                <table style="width: 100%">
                    <tr><th>类别:</th><td>${point.category || '建筑'}</td></tr>
                    <tr><th>经度:</th><td>${point.lon.toFixed(6)}</td></tr>
                    <tr><th>纬度:</th><td>${point.lat.toFixed(6)}</td></tr>
                </table>
            </div>`
  });
});


function findFeatureByName(name) {
  const query = name.trim();
  if (!query) return null;
  return featurePoints.find(p => p.name === query) || featurePoints.find(p => p.name.includes(query));
}

function findNearestRoadNode(cartesian) {
  let minDistance = Infinity;
  let nearestNode = null;

  roadNodes.forEach(nodeStr => {
    const coords = nodeStr.split(",").map(Number);
    const nodePos = Cesium.Cartesian3.fromDegrees(coords[0], coords[1]);
    const d = Cesium.Cartesian3.distance(cartesian, nodePos);
    if (d < minDistance) {
      minDistance = d;
      nearestNode = { id: nodeStr, pos: nodePos };
    }
  });
  return nearestNode;
}

function runMultiModalDijkstra(startNodeId, endNodeId, allRoadData, preferredMode) {
  const result = CampusRouting.findShortestPath(startNodeId, endNodeId, allRoadData, preferredMode);
  const path = result.nodes.map(node => {
    const [lon, lat] = node.split(',').map(Number);
    return Cesium.Cartesian3.fromDegrees(lon, lat);
  });
  return { path, distance: result.distance, modes: result.modes };
}

function clearPlannedPath() {
  if (window.activePathEntities && window.activePathEntities.length > 0) {
    window.activePathEntities.forEach(entity => viewer.entities.remove(entity));
  }
  window.activePathEntities = [];
  document.getElementById('pathInfo').textContent = '';
}

function drawMultiModePath(fullPositions, distance, modes, mainMode, rawStart, rawEnd) {
  clearPlannedPath();

  const modeColors = {
    walking: Cesium.Color.fromCssColorString('#ff2200'),
    ebike: Cesium.Color.fromCssColorString('#FFFF00'),
    driving: Cesium.Color.fromCssColorString('#00FFFF')
  };

  if (rawStart && fullPositions.length > 0) {
    const startConnector = viewer.entities.add({
      name: 'Start_Connector',
      polyline: {
        positions: [rawStart, fullPositions[0]],
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.WHITE,
          dashLength: 10
        }),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.BOTH
      }
    });
    window.activePathEntities.push(startConnector);
  }

  let currentSegmentPositions = [fullPositions[0]];

  for (let i = 0; i < modes.length; i++) {
    const currentMode = modes[i];
    const nextMode = modes[i + 1];
    const nextNode = fullPositions[i + 1];
    currentSegmentPositions.push(nextNode);

    if (currentMode !== nextMode || i === modes.length - 1) {
      const segmentColor = modeColors[currentMode] || Cesium.Color.WHITE;

      const segmentEntity = viewer.entities.add({
        name: `Path_Segment_${currentMode}`,
        polyline: {
          positions: currentSegmentPositions,
          width: 15,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            taperPower: 1,
            color: segmentColor
          }),
          clampToGround: true,
          classificationType: Cesium.ClassificationType.BOTH,
          zIndex: 9999
        }
      });

      window.activePathEntities.push(segmentEntity);
      currentSegmentPositions = [nextNode];
    }
  }

  if (rawEnd && fullPositions.length > 0) {
    const endConnector = viewer.entities.add({
      name: 'End_Connector',
      polyline: {
        positions: [fullPositions[fullPositions.length - 1], rawEnd],
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.WHITE,
          dashLength: 10
        }),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.BOTH
      }
    });
    window.activePathEntities.push(endConnector);
  }

  const speedMap = { walking: 1.2, ebike: 5.5, driving: 10.0 };
  const seconds = modes.reduce((total, mode, index) => total +
    Cesium.Cartesian3.distance(fullPositions[index], fullPositions[index + 1]) / speedMap[mode], 0);
  const minutes = Math.ceil(seconds / 60);

  const displayColor = modeColors[mainMode].toCssColorString();
  const modeNames = { walking: '步行', ebike: '电动车', driving: '驾车' };
  const modeName = modeNames[mainMode];
  const legend = [...new Set(modes)].map(mode =>
    `<span style="color:${modeColors[mode].toCssColorString()}; margin-right: 10px;">━ ${modeNames[mode]}</span>`
  ).join('');

  const pathInfoBox = document.getElementById('pathInfo');
  if (pathInfoBox) {
    pathInfoBox.innerHTML = `
      <div style="background: ${displayColor}; color: #000; padding: 6px; border-radius: 4px; font-weight: bold; text-align: center; margin-bottom: 10px;">
        规划完成 · 优先${modeName}
      </div>
      <div style="padding: 5px; border: 1px dashed ${displayColor}; border-radius: 4px;">
        <span style="color: #a0aec0;">总距离：</span><b style="color: #fff; font-size: 15px;">${distance.toFixed(0)}</b> 米<br>
        <span style="color: #a0aec0;">预计用时：</span><b style="color: #fff; font-size: 15px;">约 ${minutes}</b> 分钟
      </div>
      <div style="margin-top: 8px; font-size: 12px;">路段图例：${legend}</div>
    `;
  }

  viewer.flyTo(window.activePathEntities, {
    duration: 2,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 800)
  });
}



function startPicking(type) {
  pickMode = type;
  CampusUI.showToast(type === 'start' ? "请在地图上点击选择【起点】" : "请在地图上点击选择【终点】");
}


function pickPathPoint(cartesian) {
  if (!cartesian) return;

  const point = mars3d.LngLatPoint.fromCartesian(cartesian);
  const displayCoords = `${point.lng.toFixed(6)}, ${point.lat.toFixed(6)}`;

  if (pickMode === 'start') {
    startPoint = cartesian;
    document.getElementById('startNode').value = "已选起点: " + displayCoords;

    if (startMarker) pickGraphicLayer.removeGraphic(startMarker);
    startMarker = new mars3d.graphic.PointEntity({
      position: cartesian,
      style: {
        color: "#22c55e",
        pixelSize: 12,
        outlineColor: "#ffffff",
        outlineWidth: 2,
        label: { text: "起点", font_size: 14, pixelOffsetY: -20, background: true, backgroundColor: "#22c55e" }
      }
    });
    pickGraphicLayer.addGraphic(startMarker);
    pickMode = 'end';

  } else if (pickMode === 'end') {
    endPoint = cartesian;
    document.getElementById('endNode').value = "已选终点: " + displayCoords;

    if (endMarker) pickGraphicLayer.removeGraphic(endMarker);
    endMarker = new mars3d.graphic.PointEntity({
      position: cartesian,
      style: {
        color: "#ef4444",
        pixelSize: 12,
        outlineColor: "#ffffff",
        outlineWidth: 2,
        label: { text: "终点", font_size: 14, pixelOffsetY: -20, background: true, backgroundColor: "#ef4444" }
      }
    });
    pickGraphicLayer.addGraphic(endMarker);
    pickMode = null;
  }
}

 // 手动改写名称后，取消此前地图选点，避免输入内容被旧坐标覆盖。
document.getElementById('startNode').addEventListener('input', function () {
  pickMode = null;
  startPoint = null;
  if (startMarker) pickGraphicLayer.removeGraphic(startMarker);
  startMarker = null;
});
document.getElementById('endNode').addEventListener('input', function () {
  pickMode = null;
  endPoint = null;
  if (endMarker) pickGraphicLayer.removeGraphic(endMarker);
  endMarker = null;
});

document.getElementById('planBtn').onclick = function () {
  clearPlannedPath();
  if (roadLoadError) return alert('路网数据加载失败，请刷新页面重试。');
  if (roadNodes.length === 0) return alert("路网数据解析中...");
  let finalStartId = null;
  let finalEndId = null;

  if (startPoint instanceof Cesium.Cartesian3) {
    const nearestStart = findNearestRoadNode(startPoint);
    finalStartId = nearestStart ? nearestStart.id : null;
  } else {
    const startName = document.getElementById('startNode').value.replace("已选起点: ", "").trim();
    const feature = findFeatureByName(startName);
    if (feature) {
      const node = findNearestRoadNode(Cesium.Cartesian3.fromDegrees(feature.lon, feature.lat));
      finalStartId = node ? node.id : null;
    }
  }

  if (endPoint instanceof Cesium.Cartesian3) {
    const nearestEnd = findNearestRoadNode(endPoint);
    finalEndId = nearestEnd ? nearestEnd.id : null;
  } else {
    const endName = document.getElementById('endNode').value.replace("已选终点: ", "").trim();
    const feature = findFeatureByName(endName);
    if (feature) {
      const node = findNearestRoadNode(Cesium.Cartesian3.fromDegrees(feature.lon, feature.lat));
      finalEndId = node ? node.id : null;
    }
  }

  if (!finalStartId || !finalEndId) {
    return alert("请先在地图上准确选点，或输入正确的建筑名称");
  }
  if (finalStartId === finalEndId) {
    document.getElementById('pathInfo').textContent = '起终点位于同一路网节点，无需规划路网路线；请核对选点位置。';
    return;
  }

  const selectedMode = document.getElementById('travelMode').value;
  const result = runMultiModalDijkstra(finalStartId, finalEndId, roadData, selectedMode);

  if (result.path && result.path.length > 0) {
    drawMultiModePath(result.path, result.distance, result.modes, selectedMode, startPoint, endPoint);

    const uniqueModes = [...new Set(result.modes)];
    if (uniqueModes.length > 1 || uniqueModes[0] !== selectedMode) {
      const modeNames = { driving: '驾车', walking: '步行', ebike: '电动车' };
      const modeDesc = uniqueModes.map(m => modeNames[m]).join(' + ');
      const infoDiv = document.getElementById('pathInfo');
      if (infoDiv) {
        const description = uniqueModes.length > 1 ? `[${modeDesc}] 混合路径` : `${modeDesc}路径`;
        infoDiv.innerHTML += `<div style="color:#ecc94b; font-size:12px; margin-top:5px;">实际采用${description}，请按各路段方式通行。</div>`;
      }
    }
  } else {
    document.getElementById('pathInfo').textContent = '起终点之间没有连通的可通行路段。';
    alert('无法规划路径，请检查起终点是否在路网连通范围内。');
  }
};

document.getElementById('clearPathBtn').onclick = function () {
  clearPlannedPath();

  pickGraphicLayer.clear();
  startPoint = null;
  endPoint = null;
  startMarker = null;
  endMarker = null;
  pickMode = null;

  document.getElementById('startNode').value = "";
  document.getElementById('endNode').value = "";
  document.getElementById('pathInfo').innerHTML = "";
};


const queries = CampusQueries.init({
  viewer,
  featurePoints,
  aliases: CampusData.buildingAliases,
  silhouetteBlue
});
// 应用只有一个左键入口：选点消费整次点击，不再触发建筑定位。
viewer.screenSpaceEventHandler.setInputAction(event => {
  if (pickMode) {
    pickPathPoint(map.getCurrentMousePosition(event.position));
    return;
  }
  queries.selectBuildingAt(event.position);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
CampusExports.init({ featurePoints });
CampusUI.init({ viewer, getBuildingLayer: () => tiles3dLayer });
