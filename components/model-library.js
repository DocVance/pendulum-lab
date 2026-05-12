(function () {
  const STORAGE_KEY = 'physics-sandbox:selected-model-id';
  const USER_MODELS_KEY = 'physics-sandbox:user-models';
  const DB_NAME = 'physics-sandbox-models';
  const DB_STORE = 'glb-files';
  const MANIFEST_PATH = 'assets/models/models-manifest.json';
  const DEFAULT_COLORS = ['#607D8B', '#FFC107', '#E91E63', '#4CAF50', '#2196F3', '#9C27B0', '#FF5722'];
  const fallbackInventory = [
    { id: 'box', name: 'Khronos Box', file: 'test-object.glb', color: '#607D8B' },
    { id: 'duck', name: 'Rubber Duck', file: 'duck.glb', color: '#FFC107' },
    { id: 'duck2', name: 'Rubber Duck 2', file: 'duck2.glb', color: '#FF9800' },
    { id: 'boombox', name: 'BoomBox', file: 'boombox.glb', color: '#E91E63' },
    { id: 'shiba', name: 'Shiba', file: 'shiba.glb', color: '#000000' },
    { id: 'drvance', name: 'Dr. Vance', file: 'drvance.glb', color: '#0626a0' }
  ];

  const listeners = new Set();
  let manifestPromise = null;
  let cachedInventory = null;
  let fileProtocolWarningShown = false;
  const userBlobUrls = {};  // cache: model id -> blob URL

  // ── IndexedDB helpers (for user-added models) ───────────────────
  function openUserModelDB() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function loadUserModelBlob(id) {
    if (userBlobUrls[id]) return Promise.resolve(userBlobUrls[id]);
    return openUserModelDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = function () {
          if (req.result && req.result.blob) {
            const url = URL.createObjectURL(req.result.blob);
            userBlobUrls[id] = url;
            resolve(url);
          } else {
            resolve(null);
          }
        };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function getUserModels() {
    try {
      const stored = localStorage.getItem(USER_MODELS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function normalizeVec3String(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value) && value.length === 3) {
      return `${value[0]} ${value[1]} ${value[2]}`;
    }
    if (typeof value === 'object' && value.x != null && value.y != null && value.z != null) {
      return `${value.x} ${value.y} ${value.z}`;
    }
    return '';
  }

  function getProjectRootUrl() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const base = path.indexOf('/scenes/') >= 0 ? '../' : './';
    return new URL(base, window.location.href);
  }

  function isFileProtocol() {
    return window.location.protocol === 'file:';
  }

  function warnFileProtocol() {
    if (fileProtocolWarningShown) return;
    fileProtocolWarningShown = true;
    console.warn('Physics Sandbox is running via file://. Manifest and model loading are disabled by browser security policy. Use a local HTTP server such as http://localhost instead.');
  }

  function resolveProjectPath(relativePath) {
    return new URL(relativePath, getProjectRootUrl()).toString();
  }

  function readSelectedModelId() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function writeSelectedModelId(modelId) {
    try {
      if (modelId) {
        window.localStorage.setItem(STORAGE_KEY, modelId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage can fail in privacy-restricted contexts; ignore safely.
    }
  }

  function normalizeInventory(rawInventory) {
    if (!Array.isArray(rawInventory)) return [];

    return rawInventory
      .filter(item => item && item.id && item.file)
      .map((item, index) => ({
        id: item.id,
        name: item.name || item.id,
        file: item.file,
        color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        thumbnail: item.thumbnail || '',
        scale: item.scale || null,
        rotation: item.rotation || null,
        spawnOffset: item.spawnOffset || null,
        mass: item.mass != null ? item.mass : null,
        volume: item.volume != null ? item.volume : null,
        density: item.density != null ? item.density : null,
        colliderShape: item.colliderShape || null,
        physicsMode: item.physicsMode || 'dynamic',
        centerOfMass: item.centerOfMass || null,
        attachPoint: item.attachPoint || null,
        tags: item.tags || [],
        isAnimated: Boolean(item.isAnimated),
        category: item.category || '',
        description: item.description || '',
        author: item.author || '',
        license: item.license || '',
        addedBy: item.addedBy || 'manifest'
      }));
  }

  async function loadManifest() {
    if (cachedInventory) return cachedInventory;

    if (isFileProtocol()) {
      warnFileProtocol();
      cachedInventory = normalizeInventory(fallbackInventory);
      return cachedInventory;
    }

    if (!manifestPromise) {
      manifestPromise = fetch(resolveProjectPath(MANIFEST_PATH))
        .then(resp => {
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          return resp.json();
        })
        .then(data => {
          // Merge user-added models from localStorage
          const userModels = getUserModels();
          const combined = data.concat(userModels);
          return normalizeInventory(combined);
        })
        .catch(err => {
          console.warn('Manifest fetch failed, using fallback inventory:', err);
          return normalizeInventory(fallbackInventory);
        });
    }

    cachedInventory = await manifestPromise;
    return cachedInventory;
  }

  function getAssetId(modelId) {
    const id = typeof modelId === 'object' && modelId ? modelId.id : modelId;
    return id ? `model-${id}` : '';
  }

  function getModelRef(model) {
    if (!model) return '';
    if (model.assetRef) return model.assetRef;

    const assetId = getAssetId(model);
    return assetId ? `#${assetId}` : '';
  }

  function getModelSource(model) {
    if (!model) return '';
    if (typeof model === 'string') return resolveModelSource(model);
    if (model.source) return model.source;
    // User-added models are stored in IndexedDB; their source is resolved lazily
    if (model.addedBy === 'user' && userBlobUrls[model.id]) {
      return userBlobUrls[model.id];
    }
    return model.file ? resolveProjectPath(`assets/models/${model.file}`) : '';
  }

  function resolveModelSource(source) {
    if (!source) return '';
    if (source.charAt(0) !== '#') return source;

    const assetEl = document.querySelector(source);
    if (!assetEl) return source;

    return assetEl.getAttribute('src') || source;
  }

  function getCachedInventory() {
    return Array.isArray(cachedInventory) ? cachedInventory.slice() : [];
  }

  function getSelectedModelFromCache() {
    if (!cachedInventory || cachedInventory.length === 0) return null;
    return getSelectedModel(cachedInventory);
  }

  function createLooseDescriptor(sourceLike) {
    const source = resolveModelSource(sourceLike);
    return source ? {
      id: '',
      name: 'Selected Model',
      file: '',
      color: DEFAULT_COLORS[0],
      scale: '',
      rotation: '',
      spawnOffset: '',
      mass: null,
      colliderShape: null,
      tags: [],
      isAnimated: false,
      assetId: '',
      assetRef: typeof sourceLike === 'string' && sourceLike.charAt(0) === '#' ? sourceLike : '',
      source
    } : null;
  }

  function createModelDescriptor(model) {
    if (!model) return null;

    const source = getModelSource(model);
    const assetId = getAssetId(model);
    const assetRef = assetId ? `#${assetId}` : '';

    return Object.assign({}, model, {
      assetId,
      assetRef,
      source,
      scale: normalizeVec3String(model.scale),
      rotation: normalizeVec3String(model.rotation),
      spawnOffset: normalizeVec3String(model.spawnOffset)
    });
  }

  function getModelDescriptor(modelLike, inventory) {
    if (!modelLike) return null;

    if (modelLike.assetId && modelLike.assetRef && modelLike.source) {
      return createModelDescriptor(modelLike);
    }

    if (modelLike.id && modelLike.file) {
      return createModelDescriptor(modelLike);
    }

    const list = Array.isArray(inventory) && inventory.length > 0
      ? inventory
      : cachedInventory || [];

    if (typeof modelLike === 'string') {
      const matchedByRef = modelLike.charAt(0) === '#'
        ? list.find(item => getModelRef(item) === modelLike)
        : null;

      if (matchedByRef) {
        return createModelDescriptor(matchedByRef);
      }

      const resolved = resolveModelSource(modelLike);
      const matchedBySource = list.find(item => getModelSource(item) === resolved || item.file === modelLike);
      return matchedBySource ? createModelDescriptor(matchedBySource) : createLooseDescriptor(modelLike);
    }

    return createLooseDescriptor(getModelSource(modelLike));
  }

  function getSelectedModelDescriptor(inventory) {
    return getModelDescriptor(getSelectedModel(inventory), inventory);
  }

  function getSelectedModelDescriptorFromCache() {
    return getModelDescriptor(getSelectedModelFromCache());
  }

  async function prepareAssets(assetsEl) {
    const inventory = await loadManifest();
    return inventory;
  }

  function getSelectedModel(inventory) {
    if (!Array.isArray(inventory) || inventory.length === 0) return null;

    const requestedId = readSelectedModelId();
    const selected = inventory.find(item => item.id === requestedId) || inventory[0];

    if (selected && selected.id !== requestedId) {
      writeSelectedModelId(selected.id);
    }

    return selected;
  }

  function emitSelection(model) {
    listeners.forEach(listener => {
      try {
        listener(model);
      } catch (err) {
        console.warn('Selected-model listener failed:', err);
      }
    });

    window.dispatchEvent(new CustomEvent('physics-sandbox:model-selected', {
      detail: { model: model || null }
    }));
  }

  function setSelectedModelId(modelId, inventory) {
    const list = Array.isArray(inventory) && inventory.length > 0
      ? inventory
      : cachedInventory || [];

    const selected = list.length > 0
      ? (list.find(item => item.id === modelId) || list[0])
      : null;

    writeSelectedModelId(selected ? selected.id : modelId);
    emitSelection(selected);
    return selected;
  }

  async function selectModel(modelId) {
    const inventory = await loadManifest();
    return setSelectedModelId(modelId, inventory);
  }

  function onSelectionChange(listener) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  window.ModelLibrary = {
    loadManifest,
    prepareAssets,
    resolveProjectPath,
    getCachedInventory,
    getSelectedModelId: readSelectedModelId,
    getSelectedModel,
    getSelectedModelFromCache,
    getSelectedModelDescriptor,
    getSelectedModelDescriptorFromCache,
    setSelectedModelId,
    selectModel,
    onSelectionChange,
    normalizeInventory,
    isFileProtocol,
    canLoadAssets: function () { return !isFileProtocol(); },
    warnFileProtocol,
    getAssetId,
    getModelDescriptor,
    getModelRef,
    getModelSource,
    resolveModelSource,
    loadUserModelBlob,
    refreshInventory: function () {
      cachedInventory = null;
      manifestPromise = null;
      return loadManifest();
    }
  };

  if (window.AFRAME) {
    AFRAME.registerComponent('selected-model-label', {
      schema: {
        prefix: { type: 'string', default: 'Selected:' },
        emptyValue: { type: 'string', default: 'Loading models...' },
        width: { type: 'number', default: 1.6 },
        color: { type: 'string', default: '#FFFFFF' },
        align: { type: 'string', default: 'center' }
      },

      init: function () {
        this.unsubscribe = onSelectionChange(model => {
          this.currentModel = model;
          this.renderLabel(model);
        });

        this.currentModel = null;
        this.renderLabel(null);

        loadManifest().then(inventory => {
          this.currentModel = getSelectedModel(inventory);
          this.renderLabel(this.currentModel);
        });

        this._onI18n = () => {
          this.renderLabel(this.currentModel);
        };
        document.addEventListener('i18n:changed', this._onI18n);
        document.addEventListener('i18n:ready', this._onI18n);
      },

      renderLabel: function (model) {
        let value = '';
        if (model) {
          if (window.I18n) {
            value = window.I18n.t('hub.activeModelName', { name: model.name });
          } else {
            value = `${this.data.prefix} ${model.name}`;
          }
        } else {
          value = window.I18n ? window.I18n.t('common.loading') : this.data.emptyValue;
        }

        this.el.setAttribute('text', `value: ${value}; align: ${this.data.align}; width: ${this.data.width}; color: ${this.data.color}`);
      },

      remove: function () {
        if (this.unsubscribe) {
          this.unsubscribe();
        }
        document.removeEventListener('i18n:changed', this._onI18n);
        document.removeEventListener('i18n:ready', this._onI18n);
      }
    });
  }
})();
