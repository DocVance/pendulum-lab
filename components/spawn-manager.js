/**
 * spawn-manager.js
 * Tracks spawned objects, enforces a limit, and handles spawning logic/collisions.
 */
AFRAME.registerComponent('spawn-manager', {
  schema: {
    modelUrl: { type: 'string', default: '' },
    maxObjects: { type: 'number', default: 20 },
    spawnOffset: { type: 'vec3', default: {x: 0, y: 1.0, z: -3} }
  },

  init: function () {
    this.spawnedObjects = [];
    this.freedPool = []; // Object Pooling array cache
    this.currentModel = null;
    this.currentModelUrl = '';
    if (this.data.modelUrl) {
      this.loadModel(this.data.modelUrl);
    }

    // Flush pool on scene teardown to prevent stale DOM references
    this._onTeardown = () => {
      this.freedPool.forEach(el => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      this.freedPool = [];
      this.spawnedObjects = [];
    };
    window.addEventListener('scene-teardown', this._onTeardown);
  },

  remove: function() {
    window.removeEventListener('scene-teardown', this._onTeardown);
  },

  repoolObject: function (el) {
    if (!el || !el.parentNode) return;
    
    // Sleep physics body
    if (el.components['ammo-body'] && el.components['ammo-body'].body && window.Ammo) {
      el.components['ammo-body'].body.setActivationState(5); // DISABLE_SIMULATION
    }
    
    el.setAttribute('visible', 'false');
    el.setAttribute('position', '0 -1000 0'); // Bury it safely out of sight
    el.classList.remove('clickable', 'grabbable');
    this.freedPool.push(el);
  },

  showStatusMessage: function (message, color) {
    const st = document.getElementById('selection-text');
    if (!st) return;

    const oldText = st.getAttribute('text') || { value: '', align: 'center', width: 1.5, color: 'white' };
    st.setAttribute('text', `value: ${message}; align: ${oldText.align || 'center'}; width: ${oldText.width || 1.5}; color: ${color || '#ff5252'}`);
    setTimeout(() => {
      st.setAttribute('text', oldText);
    }, 1800);
  },

  loadModel: function (model) {
    if (window.ModelLibrary && typeof window.ModelLibrary.getModelDescriptor === 'function') {
      this.currentModel = window.ModelLibrary.getModelDescriptor(model);
      this.currentModelUrl = this.currentModel ? this.currentModel.source : '';
    } else {
      this.currentModel = null;
      this.currentModelUrl = model || '';
    }
  },

  getSpawnPosition: function () {
    if (window.ModelSpawner && typeof window.ModelSpawner.combineVec3 === 'function') {
      return window.ModelSpawner.combineVec3(
        this.data.spawnOffset,
        this.currentModel ? this.currentModel.spawnOffset : null
      ) || this.data.spawnOffset;
    }

    return this.data.spawnOffset;
  },

  checkSpawnAreaClear: function() {
    // A simple heuristic using distance. 
    // We check if any spawned object is currently within 0.8 meters of the center drop zone.
    const minDistanceSq = 0.8 * 0.8;
    const spawn = this.getSpawnPosition();
    const spawnPos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    
    for (let i = 0; i < this.spawnedObjects.length; i++) {
       const obj = this.spawnedObjects[i];
       if (!obj || !obj.object3D) continue;
       
       const pos = obj.object3D.position;
       const dSq = pos.distanceToSquared(spawnPos);
       if (dSq < minDistanceSq) {
          return false;
       }
    }
    return true;
  },

  spawnObject: function () {
    if (!this.currentModelUrl && window.ModelLibrary && typeof window.ModelLibrary.getSelectedModelDescriptorFromCache === 'function') {
      const selectedModel = window.ModelLibrary.getSelectedModelDescriptorFromCache();
      if (selectedModel) {
        this.loadModel(selectedModel);
      }
    }

    if (!this.currentModelUrl || !this.currentModel) {
      console.warn("No model URL set to spawn.");
      return;
    }

    if (window.ModelLibrary && typeof window.ModelLibrary.canLoadAssets === 'function' && !window.ModelLibrary.canLoadAssets()) {
      if (typeof window.ModelLibrary.warnFileProtocol === 'function') {
        window.ModelLibrary.warnFileProtocol();
      }
      this.showStatusMessage('Use a local server to load models.', '#ffb74d');
      return;
    }

    if (!this.checkSpawnAreaClear()) {
      console.warn("Target area blocked!");
      this.showStatusMessage('Target Blocked!', '#ff5252');
      return;
    }

    // Limit check
    if (this.spawnedObjects.length >= this.data.maxObjects) {
      const oldest = this.spawnedObjects.shift();
      this.repoolObject(oldest);
    }

    const spawnOptions = {
          sceneEl: this.el.sceneEl,
          model: this.currentModel,
          position: this.getSpawnPosition(),
          dynamicBody: true,
          enableDragger: true,
          onModelError: (entity) => {
            const uiText = document.getElementById('selection-text');
            if (uiText) {
              const err = window.I18n ? window.I18n.t('common.loadError') : 'Load Error: File missing';
              uiText.setAttribute('text', { value: err, color: '#f44336' });
              setTimeout(() => {
                if (window.ModelLibrary) {
                   const curr = window.ModelLibrary.getSelectedModelDescriptorFromCache();
                   const currStr = window.I18n ? window.I18n.t('hub.activeModelName', { name: curr ? curr.name : '' }) : `Active: ${curr ? curr.name : ''}`;
                   uiText.setAttribute('text', { value: currStr, color: 'white' });
                }
              }, 3000);
            }
          }
    };

    let el = null;
    if (this.freedPool.length > 0 && window.ModelSpawner && typeof window.ModelSpawner.recycleModel === 'function') {
      const pooledEl = this.freedPool.pop();
      el = window.ModelSpawner.recycleModel(pooledEl, spawnOptions);
    } else if (window.ModelSpawner && typeof window.ModelSpawner.instantiateModel === 'function') {
      el = window.ModelSpawner.instantiateModel(spawnOptions);
    }

    if (el) {
      this.spawnedObjects.push(el);
      // Notify audio and other listeners
      window.dispatchEvent(new CustomEvent('physics-sandbox:object-spawned', { detail: { entity: el } }));
    }
  },

  resetAllObjects: function () {
    this.spawnedObjects.forEach((el) => {
      this.repoolObject(el);
    });
    this.spawnedObjects = [];
    // Notify audio and other listeners
    window.dispatchEvent(new CustomEvent('physics-sandbox:objects-reset'));
    console.log("All objects pulled to inactive pool.");
  }
});
