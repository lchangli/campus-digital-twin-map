// 地图工作台：会话、功能面板、地图选点提示与窄屏设置。
(function () {
  let controls;

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
      toast.className = 'app-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
  }

  function init({ viewer, getBuildingLayer, cancelPicking = () => {} }) {
    if (controls) return controls;

    const menuItems = [...document.querySelectorAll('.menu-item')];
    const panelTabs = [...document.querySelectorAll('.panel-tab')];
    const panel = document.getElementById('toolPanel');
    const panelScroll = panel.querySelector('.panel-scroll');
    const heading = document.getElementById('panelHeading');
    const pickNotice = document.getElementById('pickNotice');
    const pickNoticeText = document.getElementById('pickNoticeText');
    const cancelPickBtn = document.getElementById('cancelPickBtn');
    const helpToggle = document.getElementById('helpToggle');
    const helpTip = document.getElementById('helpTip');
    const titles = {
      model: '模型浏览', attr: '属性查询', space: '空间查询',
      qa: '建筑查询', export: '数据导出', path: '路径规划'
    };
    let activeTab = 'model';
    let panelOpen = false;
    let pickMode = null;
    let savedScrollTop = 0;
    const isMobile = () => window.innerWidth <= 768;
    const currentNav = () => menuItems.find(item => item.dataset.tab === activeTab);
    const focusElement = element => element?.focus({ preventScroll: true });

    function selectTab(tab) {
      if (tab === activeTab) return;
      activeTab = tab;
      savedScrollTop = 0;
      panelScroll.scrollTop = 0;
    }

    function syncPanel() {
      const visible = panelOpen && !(pickMode && isMobile());
      if (!panel.hidden) savedScrollTop = panelScroll.scrollTop;
      const focusInInactiveTab = panelTabs.some(tab =>
        tab.id !== `${activeTab}Tab` && tab.contains(document.activeElement));
      // 先移动焦点，再隐藏面板，避免键盘停留在不可见的表单中。
      if (!visible && panel.contains(document.activeElement)) {
        focusElement(pickMode ? cancelPickBtn : currentNav());
      }
      panel.hidden = !visible;
      panel.inert = !visible;
      document.body.classList.toggle('panel-open', visible);
      heading.textContent = titles[activeTab];
      panelTabs.forEach(tab => {
        const selected = visible && tab.id === `${activeTab}Tab`;
        tab.hidden = !selected;
        tab.inert = !selected;
      });
      if (visible) panelScroll.scrollTop = savedScrollTop;
      if (pickNotice.hidden && pickNotice.contains(document.activeElement)) {
        focusElement(visible ? heading : currentNav());
      } else if (visible && focusInInactiveTab) {
        focusElement(heading);
      }
      menuItems.forEach(item => {
        const selected = item.dataset.tab === activeTab;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-expanded', String(selected && visible));
        if (selected) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
    }

    function syncPickNotice() {
      pickNotice.hidden = !pickMode;
      pickNotice.inert = !pickMode;
      pickNoticeText.textContent = pickMode === 'start'
        ? '请在地图上点击选择起点'
        : pickMode === 'end' ? '请在地图上点击选择终点' : '';
    }

    function stopPicking() {
      const wasPicking = Boolean(pickMode);
      // 先清本地状态，回调中的 setPickMode(null) 不会重新打开其他面板。
      pickMode = null;
      syncPickNotice();
      if (wasPicking) cancelPicking();
    }

    function openPanel(tab, { focus = false } = {}) {
      if (!titles[tab]) return;
      selectTab(tab);
      panelOpen = true;
      if (tab !== 'path') stopPicking();
      syncPanel();
      if (focus && !panel.hidden) focusElement(heading);
    }

    function closePanel({ focus = true } = {}) {
      panelOpen = false;
      stopPicking();
      syncPanel();
      if (focus) focusElement(currentNav());
    }

    function setPickMode(mode) {
      pickMode = mode === 'start' || mode === 'end' ? mode : null;
      if (pickMode) {
        selectTab('path');
        panelOpen = true;
      }
      syncPickNotice();
      syncPanel();
    }

    menuItems.forEach(item => {
      item.addEventListener('click', () => {
        selectTab(item.dataset.tab);
        panelOpen = activeTab !== 'model';
        stopPicking();
        syncPanel();
        if (panelOpen) focusElement(heading);
      });
    });
    document.getElementById('panelCloseBtn').addEventListener('click', () => closePanel());
    cancelPickBtn.addEventListener('click', () => {
      stopPicking();
      syncPanel();
      focusElement(heading);
    });

    function setHelpVisible(visible, { focus = false } = {}) {
      if (!visible && helpTip.contains(document.activeElement)) focus = true;
      helpTip.hidden = !visible;
      helpTip.inert = !visible;
      helpToggle.setAttribute('aria-expanded', String(visible));
      if (focus) focusElement(helpToggle);
    }
    helpToggle.addEventListener('click', () => setHelpVisible(helpTip.hidden));
    document.getElementById('helpDismiss').addEventListener('click', () => setHelpVisible(false));
    setHelpVisible(!helpTip.hidden);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!helpTip.hidden && (helpTip.contains(document.activeElement) || document.activeElement === helpToggle)) {
        setHelpVisible(false, { focus: true });
      } else if (pickMode && isMobile()) {
        stopPicking();
        syncPanel();
        focusElement(heading);
      } else if (panelOpen) {
        closePanel();
      } else if (!helpTip.hidden) {
        setHelpVisible(false, { focus: true });
      } else {
        return;
      }
      event.preventDefault();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('isLogin');
        localStorage.removeItem('username');
        window.location.href = 'index.html';
      }
    });

    function applyMobileCesiumTweaks() {
      const tiles3dLayer = getBuildingLayer();
      if (tiles3dLayer && tiles3dLayer.maximumScreenSpaceError !== undefined) {
        tiles3dLayer.maximumScreenSpaceError = 8;
      }
      const cameraControl = viewer?.scene?.screenSpaceCameraController;
      if (cameraControl) {
        cameraControl.enableRotate = true;
        cameraControl.enableTranslate = true;
        cameraControl.enableZoom = true;
        cameraControl.enableTilt = true;
      }
    }

    function onResize() {
      if (isMobile()) applyMobileCesiumTweaks();
      syncPanel();
    }
    controls = { openPanel, closePanel, setPickMode };
    window.addEventListener('resize', onResize);
    syncPickNotice();
    onResize();
    return controls;
  }

  globalThis.CampusUI = {
    initSession, init, showToast,
    openPanel: (...args) => controls?.openPanel(...args),
    closePanel: (...args) => controls?.closePanel(...args),
    setPickMode: (...args) => controls?.setPickMode(...args)
  };
})();
