AFRAME.registerComponent('spin', {
  schema: { speed: { type: 'number', default: 0.5 } },
  tick: function (t, dt) {
    this.el.object3D.rotation.y += this.data.speed * dt / 1000;
  }
});


AFRAME.registerComponent('hover-highlight', {
  init: function () {
    this.el.addEventListener('mouseenter', () => {
      this.el.setAttribute('material', 'emissive', '#224444');
    });
    this.el.addEventListener('mouseleave', () => {
      this.el.setAttribute('material', 'emissive', '#000');
    });
  }
});


AFRAME.registerComponent('pendulum-lab-controller', {
  init: async function() {
    const ANGLES   = [15, 30, 45, 60, 90];
    const LENGTHS  = [1, 2, 3, 5];
    const DAMPINGS = [{ name: 'None', value: 0 }, { name: 'Low', value: 0.3 }, { name: 'High', value: 1.5 }];
    const MASSES   = [1, 5, 10, 20];
    const activeButtons = { angle: null, length: null, damping: null, mass: null };
    const defaultColors = { angle: '#555', length: '#795548', damping: '#9C27B0', mass: '#455A64' };
    const activeColors  = { angle: '#00BCD4', length: '#FF9800', damping: '#E040FB', mass: '#26C6DA' };

    const pendulum = this.el.querySelector('#pend');
    if (!pendulum) return;

    const highlight = (group, btn) => {
      if (activeButtons[group]) activeButtons[group].setAttribute('material', `color:${defaultColors[group]}`);
      btn.setAttribute('material', `color:${activeColors[group]}`);
      activeButtons[group] = btn;
    };

    const autoRestart = (currentModel) => {
      const comp = pendulum.components.pendulum;
      if (comp && comp.bob && currentModel) comp.createBob(currentModel);
    };

    const assetsEl = document.querySelector('a-assets');
    const inventory = await window.ModelLibrary.prepareAssets(assetsEl);
    let currentModel = window.ModelLibrary.getSelectedModelDescriptor(inventory);

    const buildButtonGroup = (containerId, items, group, getAttr, getLabel, defaultVal) => {
      const container = this.el.querySelector(`#${containerId}`);
      if (!container) return;
      items.forEach((item, idx) => {
        const btn = document.createElement('a-entity');
        btn.setAttribute('class', 'clickable');
        btn.setAttribute('position', `${-0.3 + idx * 0.21} 0 0`);
        btn.setAttribute('geometry', `primitive:box; width:0.19; height:0.12; depth:0.04`);
        btn.setAttribute('material', `color:${defaultColors[group]}`);
        btn.setAttribute('text', `value:${getLabel(item)}; align:center; zOffset:0.021; width:2.5; color:white`);
        btn.addEventListener('click', () => {
          pendulum.setAttribute('pendulum', getAttr(item));
          highlight(group, btn);
          autoRestart(currentModel);
        });
        container.appendChild(btn);
        if (item === defaultVal || (item && item.value === 0)) highlight(group, btn);
      });
    };

    buildButtonGroup('angle-select', ANGLES, 'angle',
      v => `angle: ${v}`, v => `${v}°`, 45);
    buildButtonGroup('len-select', LENGTHS, 'length',
      v => `length: ${v}`, v => `${v}m`, 3);
    buildButtonGroup('damp-select', DAMPINGS, 'damping',
      v => `damping: ${v.value}`, v => v.name, 0);
    buildButtonGroup('mass-select', MASSES, 'mass',
      v => `mass: ${v}`, v => `${v}kg`, 5);

    const wire = (selector, handler) => {
      const el = this.el.querySelector(selector);
      if (el) el.addEventListener('click', handler);
    };
    wire('#btn-attach',  () => { if (currentModel) pendulum.components.pendulum.createBob(currentModel); });
    wire('#btn-release', () => pendulum.components.pendulum.release());
    wire('#btn-reset',   () => pendulum.components.pendulum.removeBob());
    wire('#btn-model-device', () => {
      const panel = document.getElementById('model-device');
      if (panel && panel.components['model-selector-panel']) panel.components['model-selector-panel'].togglePanel();
    });

    this.onModelSelected = (e) => { if (e.detail.model) currentModel = window.ModelLibrary.getModelDescriptor(e.detail.model); };
    window.addEventListener('physics-sandbox:model-selected', this.onModelSelected);
  },
  remove: function() { window.removeEventListener('physics-sandbox:model-selected', this.onModelSelected); }
});

// ─── Optics Bench Controller ──────────────────────────────────────────────────
