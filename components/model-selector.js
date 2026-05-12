(function () {
  if (!window.AFRAME || !window.ModelLibrary) return;

  // ─── Easing helper for scale animation ───────────────────────────────────
  function lerpScale(el, from, to, durationMs) {
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / durationMs, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const s = from + (to - from) * ease;
      el.setAttribute('scale', `${s} ${s} ${s}`);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Build a styled button entity ────────────────────────────────────────
  function makeBtn(w, h, color, label, textColor, textWidth) {
    const b = document.createElement('a-entity');
    b.setAttribute('class', 'clickable panel-btn');
    b.setAttribute('geometry', `primitive:box;width:${w};height:${h};depth:0.028`);
    b.setAttribute('material', `color:${color};emissive:#000;emissiveIntensity:0.12;opacity:0.96`);
    b.setAttribute('text',
      `value:${label};align:center;zOffset:0.015;width:${textWidth || (w * 4)};color:${textColor || '#fff'}`);

    // Hover glow
    b.addEventListener('mouseenter', () => {
      b.setAttribute('material', `color:${color};emissive:${color};emissiveIntensity:0.45;opacity:1`);
      lerpScale(b, 1, 1.04, 120);
    });
    b.addEventListener('mouseleave', () => {
      b.setAttribute('material', `color:${color};emissive:#000;emissiveIntensity:0.12;opacity:0.96`);
      lerpScale(b, 1.04, 1, 120);
    });
    return b;
  }

  // ─── Category icon map ────────────────────────────────────────────────────
  const CATEGORY_ICONS = {
    objects:    '⬛',
    characters: '🧍',
    animals:    '🐾',
    toys:       '🎡',
    vehicles:   '🚗',
    tools:      '🔧',
  };

  // ─── Physics descriptor lines ─────────────────────────────────────────────
  function physicsLine(item) {
    const m = item.mass != null ? `${item.mass}kg` : '?kg';
    const s = item.colliderShape || 'box';
    return `${m}  ${s}`;
  }

  AFRAME.registerComponent('model-selector-panel', {
    schema: {
      open:      { type: 'boolean', default: false },
      pageSize:  { type: 'number',  default: 6 },
      title:     { type: 'string',  default: 'MODEL SELECTOR' },
      autoClose: { type: 'boolean', default: false }
    },

    init: function () {
      this.inventory    = [];
      this.scrollOffset = 0;
      this.selectedModel = null;
      this._panelBuilt  = false;
      this.activeTab    = 'models';

      // ── External model-selection event ──
      this.handleModelSelected = evt => {
        this.selectedModel = evt.detail.model || window.ModelLibrary.getSelectedModel(this.inventory);
        this._refreshList();
        this._refreshHeader();
        if (this.data.autoClose && this.selectedModel) this.closePanel();
        this.el.emit('model-selected', { model: this.selectedModel }, false);
      };

      // ── Keyboard ──
      this._onKeyDown = evt => {
        if (evt.key === 'Tab')    { evt.preventDefault(); this.togglePanel(); }
        else if (evt.key === 'Escape' && this.data.open) this.closePanel();
      };
      window.addEventListener('keydown', this._onKeyDown);

      // ── VR Y button ──
      this._onControllerBtn = () => this.togglePanel();
      this.el.sceneEl.addEventListener('ybuttondown', this._onControllerBtn);

      // Build geometry once
      this._buildPanel();

      // Start hidden / visible per initial data
      this.el.setAttribute('scale', this.data.open ? '1 1 1' : '0.001 0.001 0.001');
      this.el.setAttribute('visible', this.data.open);

      // Load manifest
      this.loadTask = window.ModelLibrary.loadManifest()
        .then(inv => window.ModelLibrary.prepareAssets())
        .then(inv => {
          this.inventory     = inv;
          this.selectedModel = window.ModelLibrary.getSelectedModel(inv);
          this._refreshList();
          this._refreshHeader();
        });

      window.addEventListener('physics-sandbox:model-selected', this.handleModelSelected);

      // i18n updates
      this._onI18n = () => { this._refreshHeader(); this._refreshList(); };
      document.addEventListener('i18n:changed', this._onI18n);
      document.addEventListener('i18n:ready',   this._onI18n);
    },

    update: function (oldData) {
      if (oldData.open === this.data.open) return;
      if (this.data.open) {
        this.el.setAttribute('visible', true);
        lerpScale(this.el, 0.05, 1, 220);
        this.el.querySelectorAll('.panel-btn').forEach(c => c.classList.add('clickable'));
      } else {
        lerpScale(this.el, 1, 0.05, 160);
        setTimeout(() => {
          this.el.setAttribute('visible', false);
          this.el.querySelectorAll('.clickable').forEach(c => c.classList.remove('clickable'));
        }, 170);
      }
    },

    // ────────────────────────────────────────────────────────────────────────
    // BUILD PANEL GEOMETRY (once)
    // ────────────────────────────────────────────────────────────────────────
    _buildPanel: function () {
      const el = this.el;

      // ── Outer panel (glass dark card) ──
      const bg = document.createElement('a-plane');
      bg.setAttribute('width',  '1.1');
      bg.setAttribute('height', '1.5');
      bg.setAttribute('material', 'color:#040c14;opacity:0.96;transparent:true;side:double');
      el.appendChild(bg);

      // ── Corner accent marks ──
      const corners = [
        [-0.54,  0.74], [ 0.54,  0.74],
        [-0.54, -0.74], [ 0.54, -0.74]
      ];
      corners.forEach(([cx, cy]) => {
        const c = document.createElement('a-entity');
        c.setAttribute('position', `${cx} ${cy} 0.015`);
        // L-shaped corner made of two thin boxes
        const ha = document.createElement('a-box');
        ha.setAttribute('width',  '0.12'); ha.setAttribute('height', '0.02'); ha.setAttribute('depth','0.015');
        ha.setAttribute('material', 'color:#00ffcc;emissive:#00ffcc;emissiveIntensity:1.2');
        const va = document.createElement('a-box');
        va.setAttribute('width',  '0.02'); va.setAttribute('height','0.12'); va.setAttribute('depth','0.015');
        va.setAttribute('material', 'color:#00ffcc;emissive:#00ffcc;emissiveIntensity:1.2');
        c.appendChild(ha); c.appendChild(va);
        el.appendChild(c);
      });

      // ── Top scan line (full width) ──
      const scanTop = document.createElement('a-box');
      scanTop.setAttribute('position', '0 0.74 0.015');
      scanTop.setAttribute('width', '1.1'); scanTop.setAttribute('height','0.015'); scanTop.setAttribute('depth','0.01');
      scanTop.setAttribute('material','color:#00ffcc;emissive:#00ffcc;emissiveIntensity:1');
      el.appendChild(scanTop);

      // ── Bottom scan line ──
      const scanBot = document.createElement('a-box');
      scanBot.setAttribute('position', '0 -0.74 0.015');
      scanBot.setAttribute('width', '1.1'); scanBot.setAttribute('height','0.015'); scanBot.setAttribute('depth','0.01');
      scanBot.setAttribute('material','color:#00ffcc;emissive:#00ffcc;emissiveIntensity:0.7');
      el.appendChild(scanBot);

      // ── Header area background ──
      const hdrBg = document.createElement('a-plane');
      hdrBg.setAttribute('width','1.1'); hdrBg.setAttribute('height','0.28');
      hdrBg.setAttribute('position','0 0.61 0.008');
      hdrBg.setAttribute('material','color:#000d18;opacity:0.85;transparent:true');
      el.appendChild(hdrBg);

      // ── Title ──
      this.titleEl = document.createElement('a-entity');
      this.titleEl.setAttribute('position', '0 0.68 0.018');
      this.titleEl.setAttribute('text', 'value:◈ MODEL SELECTOR ◈;align:center;width:1.8;color:#00ffcc');
      el.appendChild(this.titleEl);

      // ── Tabs ──
      this.modelTabBtn = makeBtn(0.4, 0.06, '#00ffcc', 'MODELS', '#000', 1.0);
      this.modelTabBtn.setAttribute('position', '-0.25 0.60 0.018');
      this.modelTabBtn.addEventListener('click', () => { this.activeTab = 'models'; this.scrollOffset=0; this._refreshList(); this._refreshHeader(); });
      el.appendChild(this.modelTabBtn);

      this.toolTabBtn = makeBtn(0.4, 0.06, '#0d2530', 'TOOLS', '#aaccff', 1.0);
      this.toolTabBtn.setAttribute('position', '0.25 0.60 0.018');
      this.toolTabBtn.addEventListener('click', () => { this.activeTab = 'tools'; this.scrollOffset=0; this._refreshList(); this._refreshHeader(); });
      el.appendChild(this.toolTabBtn);

      // ── Active model name ──
      this.selectedEl = document.createElement('a-entity');
      this.selectedEl.setAttribute('position', '0 0.53 0.018');
      el.appendChild(this.selectedEl);

      // ── Physics metadata of selected ──
      this.metaEl = document.createElement('a-entity');
      this.metaEl.setAttribute('position', '0 0.49 0.018');
      el.appendChild(this.metaEl);

      // ── Divider line below header ──
      const divider = document.createElement('a-box');
      divider.setAttribute('position', '0 0.47 0.015');
      divider.setAttribute('width','1.0'); divider.setAttribute('height','0.006'); divider.setAttribute('depth','0.01');
      divider.setAttribute('material','color:#00ffcc;emissive:#00ffcc;emissiveIntensity:0.5');
      el.appendChild(divider);

      // ── Scroll UP button ──
      this.scrollUpBtn = makeBtn(0.95, 0.07, '#0d1f28', '▲  SCROLL UP', '#00ffcc', 1.5);
      this.scrollUpBtn.setAttribute('position', '0 0.41 0.018');
      this.scrollUpBtn.addEventListener('click', () => {
        if (this.scrollOffset > 0) { this.scrollOffset--; this._refreshList(); }
      });
      el.appendChild(this.scrollUpBtn);

      // ── List container ──
      this.listRoot = document.createElement('a-entity');
      this.listRoot.setAttribute('position', '0 0 0.018');
      el.appendChild(this.listRoot);

      // ── Scroll DOWN button ──
      this.scrollDownBtn = makeBtn(0.95, 0.07, '#0d1f28', '▼  SCROLL DOWN', '#00ffcc', 1.5);
      this.scrollDownBtn.setAttribute('position', '0 -0.41 0.018');
      this.scrollDownBtn.addEventListener('click', () => {
        const max = Math.max(0, this.inventory.length - this.data.pageSize);
        if (this.scrollOffset < max) { this.scrollOffset++; this._refreshList(); }
      });
      el.appendChild(this.scrollDownBtn);

      // ── Bottom divider ──
      const divBot = document.createElement('a-box');
      divBot.setAttribute('position', '0 -0.48 0.015');
      divBot.setAttribute('width','1.0'); divBot.setAttribute('height','0.006'); divBot.setAttribute('depth','0.01');
      divBot.setAttribute('material','color:#1a3a3a;emissive:#00ffcc;emissiveIntensity:0.2');
      el.appendChild(divBot);

      // ── Pagination indicator ──
      this.pagEl = document.createElement('a-entity');
      this.pagEl.setAttribute('position', '-0.28 -0.55 0.018');
      el.appendChild(this.pagEl);

      // ── Close button ──
      this.closeBtn = makeBtn(0.95, 0.1, '#1a0005', '✕  CLOSE', '#ff4466', 1.5);
      this.closeBtn.setAttribute('position', '0 -0.675 0.018');
      this.closeBtn.addEventListener('click', () => this.closePanel());
      el.appendChild(this.closeBtn);

      // ── Tab hint ──
      const hint = document.createElement('a-entity');
      hint.setAttribute('position', '0 -0.725 0.018');
      hint.setAttribute('text', 'value:[ TAB ] to toggle;align:center;width:1.6;color:#223344');
      el.appendChild(hint);
    },

    // ────────────────────────────────────────────────────────────────────────
    // REFRESH LIST (clear + rebuild rows each render)
    // ────────────────────────────────────────────────────────────────────────
    _refreshList: function () {
      // Clear existing rows
      while (this.listRoot.firstChild) this.listRoot.removeChild(this.listRoot.firstChild);

      const dataList = this.activeTab === 'models' 
         ? this.inventory 
         : (window.ToolManager ? Object.values(window.ToolManager.TOOLS).map(t => ({ id: t, name: t.toUpperCase() + ' TOOL', isTool: true })) : []);

      if (dataList.length === 0) {
        const empty = document.createElement('a-entity');
        empty.setAttribute('text', `value:No ${this.activeTab} found.;align:center;width:2;color:#ffaa44`);
        this.listRoot.appendChild(empty);
        this._refreshHeader();
        return;
      }

      const max = Math.max(0, dataList.length - this.data.pageSize);
      this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, max));

      const visible = dataList.slice(this.scrollOffset, this.scrollOffset + this.data.pageSize);
      const ROW_H   = 0.1;
      const startY  = ((visible.length - 1) / 2) * ROW_H;

      visible.forEach((item, i) => {
        const y = startY - i * ROW_H;
        let isSelected = false;
        if (item.isTool && window.ToolManager) {
           isSelected = window.ToolManager.getEquippedTool() === item.id;
        } else {
           isSelected = this.selectedModel && this.selectedModel.id === item.id;
        }
        const accent = item.color || '#1a2e32';

        const selMat   = `color:${accent};emissive:${accent};emissiveIntensity:0.5;opacity:0.97`;
        const normMat  = `color:#091420;opacity:0.92`;
        const hoverMat = `color:#0f2030;emissive:${accent};emissiveIntensity:0.2;opacity:0.97`;

        // row has geometry directly on it — this is required so that
        // mesh.el === row and A-Frame cursor emits events HERE, not on a child.
        const row = document.createElement('a-entity');
        row.setAttribute('class', this.data.open ? 'clickable panel-btn' : 'panel-btn');
        row.setAttribute('position', `0 ${y.toFixed(3)} 0`);
        row.setAttribute('geometry', `primitive:plane;width:1.0;height:${ROW_H - 0.006}`);
        row.setAttribute('material', isSelected ? selMat : normMat);

        // Left accent bar (decorative, not a hit target)
        const swatch = document.createElement('a-box');
        swatch.setAttribute('position', `-0.47 0 0.012`);
        swatch.setAttribute('width', '0.018');
        swatch.setAttribute('height', `${ROW_H - 0.01}`);
        swatch.setAttribute('depth', '0.008');
        swatch.setAttribute('material', `color:${accent};emissive:${accent};emissiveIntensity:${isSelected ? 2 : 0.8}`);
        row.appendChild(swatch);

        // Model name centered in row
        const nameEl = document.createElement('a-entity');
        nameEl.setAttribute('position', `0 0.018 0.012`);
        nameEl.setAttribute('text', `value:${item.name};align:center;width:0.75;color:${isSelected ? '#ffffff' : '#c8e8f0'};wrapCount:24`);
        row.appendChild(nameEl);

        // Physics info below name
        const metaEl = document.createElement('a-entity');
        metaEl.setAttribute('position', `0 -0.025 0.012`);
        const metaStr = item.isTool ? 'Gamification Tool' : physicsLine(item);
        metaEl.setAttribute('text', `value:${metaStr};align:center;width:0.65;color:${isSelected ? '#ccffee' : '#44667a'};wrapCount:24`);
        row.appendChild(metaEl);

        // Selected indicator
        if (isSelected) {
          const sel = document.createElement('a-entity');
          sel.setAttribute('position', '0.43 0 0.012');
          sel.setAttribute('text', `value:OK;align:center;width:0.2;color:#00ffcc`);
          row.appendChild(sel);
        }

        // Events fire on row (owns the mesh, mesh.el === row)
        row.addEventListener('mouseenter', () => {
          if (!isSelected) {
            row.setAttribute('material', hoverMat);
            swatch.setAttribute('material', `color:${accent};emissive:${accent};emissiveIntensity:1.5`);
          }
        });
        row.addEventListener('mouseleave', () => {
          if (!isSelected) {
            row.setAttribute('material', normMat);
            swatch.setAttribute('material', `color:${accent};emissive:${accent};emissiveIntensity:0.8`);
          }
        });
        row.addEventListener('click', () => {
          if (item.isTool) {
             if (window.ToolManager) window.ToolManager.equipTool(item.id);
          } else {
             this.selectedModel = window.ModelLibrary.setSelectedModelId(item.id, this.inventory);
             window.dispatchEvent(new CustomEvent('physics-sandbox:model-selected', { detail: { model: this.selectedModel } }));
          }
          this._refreshList();
          this._refreshHeader();
        });

        this.listRoot.appendChild(row);
      });

      // Scroll button states
      const canUp   = this.scrollOffset > 0;
      const canDown = this.scrollOffset < max;
      const upColor   = canUp   ? '#0d2530' : '#080f14';
      const downColor = canDown ? '#0d2530' : '#080f14';
      this.scrollUpBtn.setAttribute('material',
        `color:${upColor};emissive:${canUp ? '#00ffcc' : '#000'};emissiveIntensity:${canUp ? 0.15 : 0};opacity:0.95`);
      this.scrollDownBtn.setAttribute('material',
        `color:${downColor};emissive:${canDown ? '#00ffcc' : '#000'};emissiveIntensity:${canDown ? 0.15 : 0};opacity:0.95`);

      this._refreshHeader();
    },

    _refreshHeader: function () {
      // Color tabs
      if (this.activeTab === 'models') {
         this.modelTabBtn.setAttribute('material', 'color:#00ffcc;emissive:#000;emissiveIntensity:0.12;opacity:0.96');
         this.modelTabBtn.setAttribute('text', 'color:#000');
         this.toolTabBtn.setAttribute('material', 'color:#0d2530;emissive:#000;emissiveIntensity:0.12;opacity:0.96');
         this.toolTabBtn.setAttribute('text', 'color:#aaccff');
      } else {
         this.toolTabBtn.setAttribute('material', 'color:#00ffcc;emissive:#000;emissiveIntensity:0.12;opacity:0.96');
         this.toolTabBtn.setAttribute('text', 'color:#000');
         this.modelTabBtn.setAttribute('material', 'color:#0d2530;emissive:#000;emissiveIntensity:0.12;opacity:0.96');
         this.modelTabBtn.setAttribute('text', 'color:#aaccff');
      }

      if (this.activeTab === 'models') {
          const name   = this.selectedModel ? this.selectedModel.name : 'Loading...';
          const accent = this.selectedModel ? (this.selectedModel.color || '#00ffcc') : '#555';

          this.selectedEl.setAttribute('text', `value:Active: ${name};align:center;width:0.9;color:${accent}`);
          const meta = this.selectedModel ? physicsLine(this.selectedModel) : '';
          this.metaEl.setAttribute('text', `value:${meta};align:center;width:0.8;color:#446688`);
      } else {
          const t = window.ToolManager ? window.ToolManager.getEquippedTool() : '';
          this.selectedEl.setAttribute('text', `value:Equipped: ${t.toUpperCase()};align:center;width:0.9;color:#00ffcc`);
          this.metaEl.setAttribute('text', `value:Use this tool in the scene;align:center;width:0.8;color:#446688`);
      }

      const total = this.activeTab === 'models' ? this.inventory.length : (window.ToolManager ? Object.keys(window.ToolManager.TOOLS).length : 0);
      const vis   = Math.min(total, this.data.pageSize);
      const from  = total > 0 ? this.scrollOffset + 1 : 0;
      const to    = Math.min(this.scrollOffset + vis, total);
      this.pagEl.setAttribute('text',
        `value:${from}-${to} of ${total};align:center;width:0.6;color:#334455`);
    },

    // ── Public API ───────────────────────────────────────────────────────────
    openPanel:   function () { this.el.setAttribute('model-selector-panel', 'open', true);  },
    closePanel:  function () { this.el.setAttribute('model-selector-panel', 'open', false); },
    togglePanel: function () { this.el.setAttribute('model-selector-panel', 'open', !this.data.open); },

    remove: function () {
      if (this.loadTask && typeof this.loadTask.catch === 'function') this.loadTask.catch(() => {});
      window.removeEventListener('physics-sandbox:model-selected', this.handleModelSelected);
      window.removeEventListener('keydown', this._onKeyDown);
      document.removeEventListener('i18n:changed', this._onI18n);
      document.removeEventListener('i18n:ready',   this._onI18n);
      if (this.el.sceneEl) this.el.sceneEl.removeEventListener('ybuttondown', this._onControllerBtn);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // selected-model-label  — small floating badge on consoles
  // ──────────────────────────────────────────────────────────────────────────
  AFRAME.registerComponent('selected-model-label', {
    schema: {
      prefix: { type: 'string', default: 'Active:' },
      width:  { type: 'number', default: 2 },
      color:  { type: 'string', default: '#00ffcc' }
    },
    init: function () {
      this._update = () => {
        const sel  = window.ModelLibrary && typeof window.ModelLibrary.getSelectedModelDescriptorFromCache === 'function'
          ? window.ModelLibrary.getSelectedModelDescriptorFromCache()
          : null;
        const name = sel ? sel.name : '—';
        this.el.setAttribute('text',
          `value:${this.data.prefix ? this.data.prefix + ' ' : ''}${name};align:center;width:${this.data.width};color:${this.data.color}`);
      };
      window.addEventListener('physics-sandbox:model-selected', this._update);
      this._update();
    },
    remove: function () {
      window.removeEventListener('physics-sandbox:model-selected', this._update);
    }
  });
})();
