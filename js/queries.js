// 查询模块显式接收地图视图和地物目录，内部维护建筑选择状态。
(function () {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function init({ viewer, featurePoints, aliases, silhouetteBlue }) {
    let lastPickedFeature = null;
    function selectBuildingAt(position) {
      if (lastPickedFeature) lastPickedFeature.color = Cesium.Color.WHITE;
      silhouetteBlue.selected = [];
      document.getElementById('modelInfo').innerHTML = '未选中任何建筑';

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
                    <div style="color: #ecc94b;">识别到：${escapeHtml(foundName)}</div>
                    <div style="font-size: 12px; color: #718096; margin-top: 5px;">未查询到该建筑的详细属性。</div>
                `;
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
          attrResult.innerHTML = `未查询到"${escapeHtml(keyword)}"的相关信息。`;
        }
        attrLoading.style.display = 'none';
      }, 800);
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

      const results = featurePoints.flatMap(item => {
        const itemPosition = Cesium.Cartographic.fromDegrees(item.lon, item.lat);
        const distance = new Cesium.EllipsoidGeodesic(center, itemPosition, ellipsoid).surfaceDistance;
        return distance <= range ? [{ ...item, distance }] : [];
      });

      results.sort((a, b) => a.distance - b.distance);
      setTimeout(() => {
        let html = `空间查询（${range}米范围内共 ${results.length} 处）：<br><br>`;
        if (results.length > 0) {
          results.forEach((item, index) => {
            html += `${index + 1}. <strong>${item.name}</strong><br>
                      距中心：${Math.floor(item.distance)}米<br>
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

    return { selectBuildingAt };
  }

  globalThis.CampusQueries = { init };
})();
