// 查询模块显式接收地图视图和地物目录，内部维护建筑选择状态。
(function () {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function init({ viewer, featurePoints, aliases, silhouetteBlue }) {
    let lastPickedFeature = null;
    function featureCard(info, index = null, distance = null) {
      return `<article class="result-card">
        <h3>${index === null ? '' : `${index + 1}. `}${escapeHtml(info.name)}</h3>
        <dl class="detail-grid">
          <dt>类别</dt><dd>${escapeHtml(info.category || '校舍')}</dd>
          ${distance === null ? `<dt>经度</dt><dd>${info.lon.toFixed(5)}</dd><dt>纬度</dt><dd>${info.lat.toFixed(5)}</dd>` :
            `<dt>距中心</dt><dd>${Math.floor(distance)} 米</dd>`}
        </dl>
      </article>`;
    }

    function selectBuildingAt(position) {
      if (lastPickedFeature) lastPickedFeature.color = Cesium.Color.WHITE;
      silhouetteBlue.selected = [];
      document.getElementById('modelInfo').textContent = '点击地图中的建筑或名称，查看详细信息。';

      const pick = viewer.scene.pick(position);
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
        CampusUI.openPanel('model');
        const info = featurePoints.find(p => p.name.trim() === foundName.toString().trim());

        if (info) {
          document.getElementById('modelInfo').innerHTML = featureCard(info);

          const targetEntity = viewer.entities.getById(info.name);
          if (targetEntity) {
            viewer.flyTo(targetEntity, {
              offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 400),
              duration: 1.5
            });
          }
        } else {
          document.getElementById('modelInfo').innerHTML = `<article class="result-card">
            <h3>${escapeHtml(foundName)}</h3><p>未查询到该建筑的详细属性。</p></article>`;
        }
      }
    }


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
      attrBtn.disabled = true;
      attrResult.innerHTML = '';

      setTimeout(() => {
        const results = featurePoints.filter(item => item.name.includes(keyword));

        if (results.length > 0) {
          let html = `<p class="result-count">找到 ${results.length} 处建筑</p>`;

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
            html += featureCard(item, index);
          });
          attrResult.innerHTML = html;
        } else {
          attrResult.innerHTML = `未查询到"${escapeHtml(keyword)}"的相关信息。`;
        }
        attrLoading.style.display = 'none';
        attrBtn.disabled = false;
      }, 800);
    });
    attrInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) attrBtn.click();
    });


    const spaceBtn = document.getElementById('spaceBtn');
    const spaceInput = document.getElementById('spaceInput');
    const spaceResult = document.getElementById('spaceResult');
    const spaceLoading = document.getElementById('spaceLoading');

    spaceBtn.addEventListener('click', () => {
      const range = Number(spaceInput.value.trim());
      if (!Number.isFinite(range) || range <= 0) {
        spaceResult.innerHTML = '请输入有效的查询范围。';
        return;
      }

      const canvas = viewer.scene.canvas;
      const ellipsoid = viewer.scene.globe.ellipsoid;
      const centerPosition = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), ellipsoid
      );
      if (!centerPosition) {
        spaceResult.textContent = '画面中心未对准地面，请调整视角后再查询。';
        return;
      }
      const center = ellipsoid.cartesianToCartographic(centerPosition);
      spaceLoading.style.display = 'block';
      spaceBtn.disabled = true;

      const results = featurePoints.flatMap(item => {
        const itemPosition = Cesium.Cartographic.fromDegrees(item.lon, item.lat);
        const distance = new Cesium.EllipsoidGeodesic(center, itemPosition, ellipsoid).surfaceDistance;
        return distance <= range ? [{ ...item, distance }] : [];
      });

      results.sort((a, b) => a.distance - b.distance);
      setTimeout(() => {
        let html = `<p class="result-count">${range} 米范围内共 ${results.length} 处建筑</p>`;
        if (results.length > 0) {
          results.forEach((item, index) => {
            html += featureCard(item, index, item.distance);
          });
        } else {
          html = `该范围内暂无建筑，请扩大范围或移动视角。`;
        }
        spaceResult.innerHTML = html;
        spaceLoading.style.display = 'none';
        spaceBtn.disabled = false;
      }, 500);
    });
    spaceInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) spaceBtn.click();
    });


    const qaBtn = document.getElementById('qaBtn');
    const qaInput = document.getElementById('qaInput');
    const qaResult = document.getElementById('qaResult');
    const qaLoading = document.getElementById('qaLoading');

    qaBtn.addEventListener('click', () => {
      const question = qaInput.value.trim();
      if (!question) {
        qaResult.textContent = '请输入建筑或学院名称。';
        return;
      }

      qaLoading.style.display = 'block';
      qaBtn.disabled = true;
      qaResult.innerHTML = '';

      setTimeout(() => {
        let answer = '';
        let targetEntity = null;



        let matchedAlias = null;
        for (let key in aliases) {
          if (question.includes(key)) {
            matchedAlias = aliases[key];
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
          answer = `暂无"${escapeHtml(question)}"的相关位置信息。`;
        }

        qaResult.innerHTML = `<div class="result-card">${answer}</div>`;

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
        qaBtn.disabled = false;
        qaInput.value = '';
      }, 800);
    });

    qaInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) qaBtn.click();
    });

    return { selectBuildingAt };
  }

  globalThis.CampusQueries = { init };
})();
