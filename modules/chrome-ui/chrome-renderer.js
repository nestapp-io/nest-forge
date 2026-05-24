(function () {
    const api = window.chromeApi;
    const titleEl = document.getElementById('app-title');
    const iconEl = document.getElementById('app-icon');
    const menubar = document.getElementById('menubar');
    const burger = document.getElementById('menu-burger');
    const titlebar = document.getElementById('titlebar');
    const brand = titlebar.querySelector('.brand');
    const controls = document.getElementById('window-controls');
    const btnMin = controls.querySelector('[data-action="minimize"]');
    const btnMax = controls.querySelector('[data-action="toggle-max"]');
    let menuModel = [];
    let showMenu = false;
    let responsiveEnabled = false;
    let activeBtn = null;

    function clearActive() {
        if (activeBtn) {
            activeBtn.classList.remove('active');
            activeBtn = null;
        }
    }

    function renderHorizontal() {
        menubar.innerHTML = '';
        for (const top of menuModel) {
            const btn = document.createElement('button');
            btn.className = 'menu-top';
            btn.type = 'button';
            btn.setAttribute('role', 'menuitem');
            btn.textContent = top.label;
            btn.dataset.topLabel = top.label;

            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                clearActive();
                btn.classList.add('active');
                activeBtn = btn;
                const rect = btn.getBoundingClientRect();
                api.popupTopMenu(top.label, Math.round(rect.left), 32);
            });

            btn.addEventListener('mouseenter', () => {
                if (activeBtn && activeBtn !== btn) {
                    clearActive();
                    btn.classList.add('active');
                    activeBtn = btn;
                    const rect = btn.getBoundingClientRect();
                    api.popupTopMenu(top.label, Math.round(rect.left), 32);
                }
            });

            menubar.appendChild(btn);
        }
    }

    async function refreshMenu() {
        if (!showMenu) return;
        menuModel = (await api.getMenu()) || [];
        renderHorizontal();
        applyResponsive();
    }

    function applyResponsive() {
        if (!responsiveEnabled) return;
        menubar.style.display = 'flex';
        burger.hidden = true;
        const wantedWidth = brand.offsetWidth + menubar.scrollWidth + controls.offsetWidth + 24;
        const haveWidth = titlebar.clientWidth;
        const collapse = wantedWidth > haveWidth;
        menubar.style.display = collapse ? 'none' : 'flex';
        burger.hidden = !collapse;
    }

    document.addEventListener('click', () => clearActive());

    controls.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        if (btn.disabled || btn.hidden) return;
        const a = btn.dataset.action;
        if (a === 'minimize') api.minimize();
        else if (a === 'toggle-max') api.toggleMax();
        else if (a === 'close') api.close();
    });

    burger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const rect = burger.getBoundingClientRect();
        api.popupBurgerMenu(Math.round(rect.left), 32);
    });

    api.onAppName((name) => { if (titleEl) titleEl.textContent = name || ''; });

    (async () => {
        const initData = await api.init();
        const platform = initData.platform || 'linux';
        document.body.dataset.platform = platform;

        titleEl.textContent = initData.appName || '';
        if (initData.icon) {
            iconEl.src = initData.icon;
        } else {
            iconEl.style.display = 'none';
        }

        showMenu = !!initData.showMenu;

        if (platform === 'darwin') {
            controls.hidden = true;
            brand.style.paddingLeft = '78px';
        } else {
            const ctrls = initData.controls || {};
            if (btnMin) btnMin.hidden = !ctrls.minimizable;
            if (btnMax) btnMax.hidden = !ctrls.maximizable;
        }

        if (showMenu) {
            menuModel = (await api.getMenu()) || [];
            renderHorizontal();
            responsiveEnabled = true;
            applyResponsive();
            new ResizeObserver(applyResponsive).observe(document.body);
            api.onMenuChanged(() => refreshMenu());
        } else {
            menubar.style.display = 'none';
            burger.hidden = true;
        }
    })();
})();
