// 通用界面：会话提示、菜单、移动抽屉与窄屏地图设置。
(function () {
  function initSession() {
    if (!localStorage.getItem('isLogin')) {
      alert('请先登录系统！');
      window.location.href = 'index.html';
    }
    document.getElementById('userName').textContent = `欢迎您，${localStorage.getItem('username') || 'admin'}`;
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

  function init({ viewer, getBuildingLayer }) {
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

    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', () => {
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('isLogin');
        localStorage.removeItem('username');
        window.location.href = 'index.html';
      }
    });
    const sidebar = document.querySelector('.sidebar');
    const panel = document.querySelector('.panel');
    const menuBtn = document.getElementById('menuBtn');
    const panelBtn = document.getElementById('panelBtn');
    const mask = document.getElementById('drawerMask');
    let maskHideTimer;
    const hasOpenDrawer = () => sidebar?.classList.contains('open') || panel?.classList.contains('open');

    // 移动端 CSS 中遮罩占满屏幕，初始必须隐藏，避免透明遮罩拦截点击。
    if (mask) {
      mask.style.display = 'none';
      mask.classList.remove('show');
    }

    function syncMask() {
      if (!mask) return;
      clearTimeout(maskHideTimer);
      if (hasOpenDrawer()) {
        mask.style.display = 'block';
        requestAnimationFrame(() => {
          if (hasOpenDrawer()) mask.classList.add('show');
        });
      } else {
        mask.classList.remove('show');
        maskHideTimer = setTimeout(() => {
          if (!hasOpenDrawer()) mask.style.display = 'none';
        }, 280);
      }
    }

    function openDrawer(el) {
      el.classList.add('open');
      syncMask();
    }

    function closeDrawer(el) {
      el.classList.remove('open');
      syncMask();
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
        }
        if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !panelBtn.contains(e.target)) {
          closeDrawer(panel);
        }
      }
    });

    // 菜单项点击后在移动端自动关闭侧边栏并打开面板
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (event) => {
        if (window.innerWidth <= 768) {
          event.stopPropagation();
          closeDrawer(sidebar);
          openDrawer(panel);
        }
      });
    });

    function applyMobileCesiumTweaks() {
      const tiles3dLayer = getBuildingLayer();
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
      else closeAll();
    }
    window.addEventListener('resize', checkAndApply);
    checkAndApply();
  }

  globalThis.CampusUI = { initSession, init, showToast };
})();
