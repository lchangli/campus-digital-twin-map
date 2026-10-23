if (!localStorage.getItem('isLogin')) {
  alert('请先登录系统！');
  window.location.href = 'index.html';
}
document.getElementById('userName').textContent = `欢迎您，${localStorage.getItem('username') || 'admin'}`;


let activePathEntities = [];
let pickMode = null;
let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;
let lastPickedFeature = null;
let selectedBuildingName = null;
let tiles3dLayer;
let roadNodes = [];
let roadLoadError = null;
let activePathPolyline = null;
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


const featurePoints = [
  { lon: 114.032215, lat: 32.134658, name: '理科楼', category: '教学楼' },
  { lon: 114.032215, lat: 32.134658, name: '理科楼南楼', category: '教学楼' },
  { lon: 114.032215, lat: 32.134658, name: '理科北楼', category: '教学楼' },
  { lon: 114.033502, lat: 32.134015, name: '教2', category: '教学楼' },
  { lon: 114.033980, lat: 32.134085, name: '科技馆', category: '教学楼' },
  { lon: 114.033095, lat: 32.134045, name: '教3', category: '教学楼' },
  { lon: 114.033465, lat: 32.135152, name: '旧图书馆', category: '图书馆' },
  { lon: 114.033505, lat: 32.133495, name: '行政楼', category: '办公楼' },
  { lon: 114.033425, lat: 32.137085, name: '人文楼', category: '教学楼' },
  { lon: 114.033652, lat: 32.136280, name: '社科楼', category: '教学楼' },
  { lon: 114.034650, lat: 32.137050, name: '逸夫楼', category: '教学楼' },
  { lon: 114.033375, lat: 32.140195, name: '新图书馆', category: '图书馆' },
  { lon: 114.031542, lat: 32.139450, name: '体育馆', category: '运动场' },
  { lon: 114.031086, lat: 32.138752, name: '琴房', category: '教学楼' },
  { lon: 114.033415, lat: 32.141512, name: '教科楼', category: '教学楼' },
  { lon: 114.033358, lat: 32.140995, name: '经管楼', category: '教学楼' },
  { lon: 114.033642, lat: 32.135852, name: '教8', category: '教学楼' },
  { lon: 114.034768, lat: 32.134562, name: '化学楼', category: '教学楼' },
  { lon: 114.034472, lat: 32.134885, name: '教4', category: '教学楼' },
  { lon: 114.034785, lat: 32.134945, name: '教7', category: '教学楼' },
  { lon: 114.034865, lat: 32.139485, name: '艺术楼', category: '教学楼' },
  { lon: 114.035198, lat: 32.134975, name: '教6', category: '教学楼' },
  { lon: 114.033502, lat: 32.142015, name: '计算机楼', category: '教学楼' },
  { lon: 114.035565, lat: 32.140035, name: '教9', category: '教学楼' },
  { lon: 114.035705, lat: 32.141415, name: '生科楼', category: '教学楼' },
  { lon: 114.035675, lat: 32.142035, name: '数学楼', category: '教学楼' },
  { lon: 114.034783, lat: 32.144292, name: '体育学院', category: '教学楼' },
  { lon: 114.032452, lat: 32.143991, name: '国际教育学院', category: '教学楼' },
  { lon: 114.035932, lat: 32.133807, name: '教5', category: '教学楼' },
  { lon: 114.033765, lat: 32.142587, name: '综合实验楼', category: '教学楼' },

  { lon: 114.036705, lat: 32.137585, name: '浉源餐厅', category: '餐厅' },
  { lon: 114.037465, lat: 32.138985, name: '景明餐厅', category: '餐厅' },
  { lon: 114.037935, lat: 32.135675, name: '海苑餐厅', category: '餐厅' },
  { lon: 114.034804, lat: 32.146133, name: '东区一餐厅', category: '餐厅' },
  { lon: 114.035045, lat: 32.133545, name: '校医院', category: '校医院' },
  { lon: 114.034625, lat: 32.132915, name: '南湖酒店', category: '其他' },
  { lon: 114.036155, lat: 32.137025, name: '幼儿园', category: '其他' },
  { lon: 114.036685, lat: 32.139635, name: '综合楼', category: '其他' },

  { lon: 114.033475, lat: 32.132595, name: '明德广场', category: '其他' },
  { lon: 114.034235, lat: 32.138415, name: '一棵树广场', category: '其他' },
  { lon: 114.033285, lat: 32.138175, name: '文心亭', category: '其他' },
  { lon: 114.033185, lat: 32.139165, name: '半亩塘', category: '其他' },
  { lon: 114.032115, lat: 32.139145, name: '青年广场', category: '运动场' },
  { lon: 114.035755, lat: 32.137615, name: '心语广场', category: '其他' },
  { lon: 114.032035, lat: 32.136145, name: "西操场", category: '运动场' },
  { lon: 114.037685, lat: 32.137455, name: "东操场", category: '运动场' },

  { lon: 114.033551, lat: 32.131955, name: "南门", category: '学校大门' },
  { lon: 114.031016, lat: 32.140162, name: "西门", category: '学校大门' },
  { lon: 114.036924, lat: 32.148650, name: "北门", category: '学校大门' },

  { lon: 114.034845, lat: 32.132285, name: '一舍', category: '宿舍' },
  { lon: 114.036415, lat: 32.133575, name: "研究生宿舍", category: '宿舍' },
  { lon: 114.035365, lat: 32.137675, name: "1号楼", category: '宿舍' },
  { lon: 114.035555, lat: 32.137955, name: "2号楼", category: '宿舍' },
  { lon: 114.036325, lat: 32.138195, name: "3号楼", category: '宿舍' },
  { lon: 114.035795, lat: 32.138215, name: "4号楼", category: '宿舍' },
  { lon: 114.036355, lat: 32.138465, name: "5号楼", category: '宿舍' },
  { lon: 114.035665, lat: 32.138525, name: "6号楼", category: '宿舍' },
  { lon: 114.036365, lat: 32.138775, name: "7号楼", category: '宿舍' },
  { lon: 114.035645, lat: 32.138815, name: "8号楼", category: '宿舍' },
  { lon: 114.036405, lat: 32.139105, name: "9号楼", category: '宿舍' },
  { lon: 114.035705, lat: 32.139105, name: "28号楼", category: '宿舍' },
  { lon: 114.037865, lat: 32.139585, name: "10号楼", category: '宿舍' },
  { lon: 114.038215, lat: 32.139315, name: "11号楼", category: '宿舍' },
  { lon: 114.038995, lat: 32.139005, name: "12号楼", category: '宿舍' },
  { lon: 114.038255, lat: 32.139045, name: "13号楼", category: '宿舍' },
  { lon: 114.038385, lat: 32.138715, name: "14号楼", category: '宿舍' },
  { lon: 114.038285, lat: 32.138415, name: "15号楼", category: '宿舍' },
  { lon: 114.037245, lat: 32.138475, name: "16号楼", category: '宿舍' },
  { lon: 114.037245, lat: 32.138145, name: "17号楼", category: '宿舍' },
  { lon: 114.037155, lat: 32.137885, name: "18号楼", category: '宿舍' },
  { lon: 114.037085, lat: 32.136565, name: "19号楼", category: '宿舍' },
  { lon: 114.036875, lat: 32.136295, name: "20号楼", category: '宿舍' },
  { lon: 114.036315, lat: 32.135605, name: "21号楼", category: '宿舍' },
  { lon: 114.036125, lat: 32.135285, name: "22号楼", category: '宿舍' },
  { lon: 114.036895, lat: 32.135645, name: "23号楼", category: '宿舍' },
  { lon: 114.036735, lat: 32.135115, name: "24号楼", category: '宿舍' },
  { lon: 114.037135, lat: 32.135115, name: "25号楼", category: '宿舍' },
  { lon: 114.038015, lat: 32.136815, name: "26号楼", category: '宿舍' },
  { lon: 114.037875, lat: 32.136185, name: "27号楼", category: '宿舍' },
  { lon: 114.036485, lat: 32.136005, name: "29号楼", category: '宿舍' },
  { lon: 114.037335, lat: 32.143295, name: "北泽园1号", category: '宿舍' },
  { lon: 114.037435, lat: 32.142955, name: "北泽园2号", category: '宿舍' },
  { lon: 114.037525, lat: 32.142715, name: "北泽园3号", category: '宿舍' },
  { lon: 114.037305, lat: 32.142415, name: "北泽园4号", category: '宿舍' },
  { lon: 114.037175, lat: 32.142095, name: "北泽园5号", category: '宿舍' },
  { lon: 114.037055, lat: 32.141825, name: "北泽园6号", category: '宿舍' },
  { lon: 114.036785, lat: 32.141545, name: "北泽园7号", category: '宿舍' },
  { lon: 114.036555, lat: 32.141255, name: "北泽园8号", category: '宿舍' },
  { lon: 114.034767, lat: 32.145143, name: '信院5号楼', category: '宿舍' },
  { lon: 114.034973, lat: 32.145462, name: '信院6号楼', category: '宿舍' },
  { lon: 114.035236, lat: 32.145726, name: '信院7号楼', category: '宿舍' },
];

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


function exportData(data, type = 'json', fileName = '校园三维数据') {
  let content = '';
  let fileExt = '';
  if (type === 'json') {
    content = JSON.stringify(data, null, 2);
    fileExt = '.json';
  } else if (type === 'excel') {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(item => Object.values(item).join(',')).join('\n');
    content = '\uFEFF' + headers + '\n' + rows;
    fileExt = '.csv';
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName + '_' + new Date().getTime() + fileExt;
  a.click();
  URL.revokeObjectURL(url);
}

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

function showToast(msg, duration = 2500) {
  let toast = document.getElementById('_mobileToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_mobileToast';
    toast.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(30,40,60,0.92)', 'color:#fff', 'padding:10px 20px',
      'border-radius:20px', 'font-size:14px', 'z-index:9999',
      'pointer-events:none', 'white-space:nowrap', 'max-width:80vw',
      'text-align:center', 'line-height:1.5', 'transition:opacity .3s'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function startPicking(type) {
  pickMode = type;
  showToast(type === 'start' ? "请在地图上点击选择【起点】" : "请在地图上点击选择【终点】");
}


const menuItems = document.querySelectorAll('.menu-item');
const panelTabs = document.querySelectorAll('.panel-tab');
menuItems.forEach(item => {
  item.addEventListener('click', () => {
    menuItems.forEach(mi => mi.classList.remove('active'));
    item.classList.add('active');

    const tabId = item.dataset.tab + 'Tab';
    panelTabs.forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
  });
});


map.on(mars3d.EventType.click, function (event) {
  if (!pickMode) return;
  const cartesian = event.cartesian;
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
});

viewer.screenSpaceEventHandler.setInputAction((event) => {
  if (lastPickedFeature) lastPickedFeature.color = Cesium.Color.WHITE;
  silhouetteBlue.selected = [];
  document.getElementById('modelInfo').innerHTML = '未选中任何建筑';

  const pick = viewer.scene.pick(event.position);
  let foundName = "";

  if (Cesium.defined(pick)) {
    if (pick.id instanceof Cesium.Entity) {
      foundName = pick.id.id;
    } else if (pick instanceof Cesium.Cesium3DTileFeature) {
      lastPickedFeature = pick;
      pick.color = Cesium.Color.YELLOW.withAlpha(0.6);
      silhouetteBlue.selected = [pick];
      foundName = pick.getProperty('name') || pick.getProperty('Name') || pick.getProperty('id');
    }
  }

  if (foundName) {
    const info = featurePoints.find(p => p.name.trim() === foundName.toString().trim());

    if (info) {
      document.getElementById('modelInfo').innerHTML = `
                <div style="color: #ecc94b; font-weight: bold; font-size: 15px; margin-bottom: 8px;">${info.name}</div>
                <div style="line-height: 1.8; font-size: 13px;">
                    <span style="color: #a0aec0;">类别：</span>${info.category || '校舍'}<br>
                    <span style="color: #a0aec0;">经度：</span>${info.lon.toFixed(5)}<br>
                    <span style="color: #a0aec0;">纬度：</span>${info.lat.toFixed(5)}<br>
                    <hr style="border: 0; border-top: 1px solid #4a5568; margin: 8px 0;">
                    <div style="color: #63b3ed;">已录入校园空间数据库。</div>
                </div>
            `;

      const targetEntity = viewer.entities.getById(info.name);
      if (targetEntity) {
        viewer.flyTo(targetEntity, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 400),
          duration: 1.5
        });
      }
    } else {
      document.getElementById('modelInfo').innerHTML = `
                <div style="color: #ecc94b;">识别到：${foundName}</div>
                <div style="font-size: 12px; color: #718096; margin-top: 5px;">未查询到该建筑的详细属性。</div>
            `;
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


const attrBtn = document.getElementById('attrBtn');
const attrInput = document.getElementById('attrInput');
const attrResult = document.getElementById('attrResult');
const attrLoading = document.getElementById('attrLoading');

attrBtn.addEventListener('click', () => {
  const keyword = attrInput.value.trim();
  if (!keyword) {
    attrResult.innerHTML = '请输入建筑名称。';
    return;
  }

  attrLoading.style.display = 'block';
  attrResult.innerHTML = '';

  setTimeout(() => {
    const results = featurePoints.filter(item => item.name.includes(keyword));

    if (results.length > 0) {
      let html = `查询结果（共${results.length}条）：<br><br>`;

      const firstMatch = results[0];
      const targetEntity = viewer.entities.getById(firstMatch.name);

      if (targetEntity) {
        viewer.flyTo(targetEntity, {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            300
          ),
          duration: 2
        });
      }

      results.forEach((item, index) => {
        html += `
            <strong>${index + 1}. ${item.name}</strong><br>
            类别：${item.category}<br>
            经度：${item.lon.toFixed(5)}<br>
            纬度：${item.lat.toFixed(5)}<br><br>
          `;
      });
      attrResult.innerHTML = html;
    } else {
      attrResult.innerHTML = `未查询到"${keyword}"的相关信息。`;
    }
    attrLoading.style.display = 'none';
  }, 800);
});


const spaceBtn = document.getElementById('spaceBtn');
const spaceInput = document.getElementById('spaceInput');
const spaceResult = document.getElementById('spaceResult');
const spaceLoading = document.getElementById('spaceLoading');

spaceBtn.addEventListener('click', () => {
  const range = parseInt(spaceInput.value.trim());
  if (isNaN(range) || range <= 0) {
    spaceResult.innerHTML = '请输入有效的查询范围。';
    return;
  }

  spaceLoading.style.display = 'block';

  const center = viewer.camera.position;
  const results = featurePoints.filter(item => {
    const itemPos = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 0);
    const distance = Cesium.Cartesian3.distance(center, itemPos);
    item.currentDistance = Math.floor(distance);
    return distance <= range;
  });

  results.sort((a, b) => a.currentDistance - b.currentDistance);
  setTimeout(() => {
    let html = `空间查询（${range}米范围内共 ${results.length} 处）：<br><br>`;
    if (results.length > 0) {
      results.forEach((item, index) => {
        html += `${index + 1}. <strong>${item.name}</strong><br>
                  距中心：${item.currentDistance}米<br>
                  类别：${item.category || '未知'}<br><br>`;
      });
    } else {
      html = `该范围内暂无建筑，请扩大范围或移动视角。`;
    }
    spaceResult.innerHTML = html;
    spaceLoading.style.display = 'none';
  }, 500);
});


const qaBtn = document.getElementById('qaBtn');
const qaInput = document.getElementById('qaInput');
const qaResult = document.getElementById('qaResult');
const qaLoading = document.getElementById('qaLoading');

qaBtn.addEventListener('click', () => {
  const question = qaInput.value.trim();
  if (!question) return;

  qaLoading.style.display = 'block';
  qaResult.innerHTML = '';

  setTimeout(() => {
    let answer = '';
    let targetEntity = null;

    const aliasMap = {
      "地理科学学院": { building: "理科楼南楼", formal: "地理科学学院" },
      "地科院": { building: "理科楼南楼", formal: "地理科学学院" },
      "物理学院": { building: "理科楼南楼", formal: "物理学院" },
      "数学与统计学院": { building: "数学楼", formal: "数学与统计学院" },
      "数学院": { building: "数学楼", formal: "数学与统计学院" },
      "文学院": { building: "人文楼", formal: "文学院" },
      "生科院院": { building: "生科楼", formal: "生命科学学院" },
      "传媒学院": { building: "社科楼", formal: "传媒学院" },
      "马克思主义学院": { building: "社科楼", formal: "马克思主义学院" },
      "教务处": { building: "行政楼", formal: "教务处" },
      "招生就业处": { building: "逸夫楼", formal: "招生就业处" },
      "财务处": { building: "行政楼", formal: "财务处" },
      "学生处": { building: "行政楼", formal: "学生处" },
      "校团委": { building: "行政楼", formal: "校团委" },
      "研究生院": { building: "行政楼", formal: "研究生院" },
      "计算机与信息技术学院": { building: "实验楼", formal: "计算机与信息技术学院" },
      "计算机学院": { building: "实验楼", formal: "计算机与信息技术学院" },
      "软件学院": { building: "实验楼", formal: "计算机与信息技术学院" },
      "物理电子工程学院": { building: "理科楼", formal: "物理电子工程学院" },
      "物电学院": { building: "理科楼", formal: "物理电子工程学院" },
      "化学化工学院": { building: "化学楼", formal: "化学化工学院" },
      "化学学院": { building: "化学楼", formal: "化学化工学院" },
      "建筑与土木工程学院": { building: "理科楼", formal: "建筑与土木工程学院" },
      "土木学院": { building: "理科楼", formal: "建筑与土木工程学院" },
      "法学与社会学学院": { building: "社科楼", formal: "法学与社会学学院" },
      "法学院": { building: "社科楼", formal: "法学与社会学学院" },
      "商学院": { building: "社科楼", formal: "商学院" },
      "经济学院": { building: "社科楼", formal: "商学院" },
      "外国语学院": { building: "外语楼", formal: "外国语学院" },
      "外语学院": { building: "外语楼", formal: "外国语学院" },
      "教育科学学院": { building: "教科楼", formal: "教育科学学院" },
      "教科院": { building: "教科楼", formal: "教育科学学院" },
      "历史文化学院": { building: "人文楼", formal: "历史文化学院" },
      "历院": { building: "人文楼", formal: "历史文化学院" },
      "美术与设计学院": { building: "艺术楼", formal: "美术与设计学院" },
      "美院": { building: "艺术楼", formal: "美术与设计学院" },
      "音乐与舞蹈学院": { building: "艺术楼", formal: "音乐与舞蹈学院" },
      "音乐学院": { building: "艺术楼", formal: "音乐与舞蹈学院" },
      "国际教育学院": { building: "国际教育学院", formal: "国际教育学院" },
      "国教院": { building: "国际教育学院", formal: "国际教育学院" },
    };

    let matchedAlias = null;
    for (let key in aliasMap) {
      if (question.includes(key)) {
        matchedAlias = aliasMap[key];
        break;
      }
    }

    if (matchedAlias) {
      const buildingData = featurePoints.find(p => p.name === matchedAlias.building);
      if (buildingData) {
        answer = `已找到 ${matchedAlias.formal}，位于${matchedAlias.building}，正在地图中定位...`;
        targetEntity = viewer.entities.getById(matchedAlias.building);
      }
    }

    if (!answer) {
      const buildingData = featurePoints.find(p => question.includes(p.name));
      if (buildingData) {
        answer = `已找到 ${buildingData.name}（${buildingData.category}），正在定位。`;
        targetEntity = viewer.entities.getById(buildingData.name);
      }
    }

    if (!answer) {
      answer = `暂无"${question}"的相关位置信息。`;
    }

    qaResult.innerHTML = `<div style="padding: 8px; background: rgba(66, 153, 225, 0.1); border-radius: 4px; border-left: 3px solid #63b3ed;">
                            ${answer}
                          </div>`;

    if (targetEntity) {
      viewer.flyTo(targetEntity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          200
        ),
        duration: 2.0
      });
    }
    qaLoading.style.display = 'none';
    qaInput.value = '';
  }, 800);
});

qaInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') qaBtn.click();
});


// 手动改写名称后，取消此前地图选点，避免输入内容被旧坐标覆盖。
document.getElementById('startNode').addEventListener('input', function () {
  startPoint = null;
  if (startMarker) pickGraphicLayer.removeGraphic(startMarker);
  startMarker = null;
});
document.getElementById('endNode').addEventListener('input', function () {
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


const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

exportJsonBtn.addEventListener('click', () => {
  exportData(featurePoints, 'json', '校园建筑属性');
  alert('JSON数据已导出。');
});

exportExcelBtn.addEventListener('click', () => {
  exportData(featurePoints, 'excel', '校园建筑属性');
  alert('Excel(CSV)数据已导出。');
});


const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.addEventListener('click', () => {
  if (confirm('确定要退出登录吗？')) {
    localStorage.removeItem('isLogin');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
  }
});


(function () {
  const sidebar = document.querySelector('.sidebar');
  const panel = document.querySelector('.panel');
  const menuBtn = document.getElementById('menuBtn');
  const panelBtn = document.getElementById('panelBtn');
  const mask = document.getElementById('drawerMask');

  function openDrawer(el) {
    el.classList.add('open');
    if (mask) {
      mask.style.display = 'block';
      requestAnimationFrame(() => mask.classList.add('show'));
    }
  }

  function closeDrawer(el) {
    el.classList.remove('open');
    if (mask) {
      mask.classList.remove('show');
      setTimeout(() => { mask.style.display = 'none'; }, 280);
    }
  }

  function closeAll() {
    if (sidebar) closeDrawer(sidebar);
    if (panel) closeDrawer(panel);
  }

  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !sidebar.classList.contains('open');
      if (panel) closeDrawer(panel);
      opening ? openDrawer(sidebar) : closeDrawer(sidebar);
    });
  }

  if (panelBtn && panel) {
    panelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !panel.classList.contains('open');
      if (sidebar) closeDrawer(sidebar);
      opening ? openDrawer(panel) : closeDrawer(panel);
    });
  }

  if (mask) {
    mask.addEventListener('click', closeAll);
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
        closeDrawer(sidebar);
        if (panel && !panel.classList.contains('open')) {
          if (mask) { mask.classList.remove('show'); setTimeout(() => { mask.style.display = 'none'; }, 280); }
        }
      }
      if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !panelBtn.contains(e.target)) {
        closeDrawer(panel);
        if (sidebar && !sidebar.classList.contains('open')) {
          if (mask) { mask.classList.remove('show'); setTimeout(() => { mask.style.display = 'none'; }, 280); }
        }
      }
    }
  });

  // 菜单项点击后在移动端自动关闭侧边栏并打开面板
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeDrawer(sidebar);
        openDrawer(panel);
      }
    });
  });

  function applyMobileCesiumTweaks() {
    try {
      if (viewer && viewer.scene && viewer.scene.postProcessStages) {
        try { viewer.scene.postProcessStages.removeAll(); } catch (e) { }
      }

      if (typeof tiles3dLayer !== 'undefined' && tiles3dLayer) {
        try {
          if (tiles3dLayer.maximumScreenSpaceError !== undefined) tiles3dLayer.maximumScreenSpaceError = 8;
        } catch (e) { }
      }
      if (viewer && viewer.scene && viewer.scene.screenSpaceCameraController) {
        const c = viewer.scene.screenSpaceCameraController;
        c.enableRotate = true;
        c.enableTranslate = true;
        c.enableZoom = true;
        c.enableTilt = true;
      }
    } catch (err) {
      console.warn('mobile tweaks failed', err);
    }
  }

  function checkAndApply() {
    if (window.innerWidth <= 768) applyMobileCesiumTweaks();
  }
  window.addEventListener('resize', checkAndApply);
  checkAndApply();
})();
