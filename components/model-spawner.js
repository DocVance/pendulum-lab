(function () {
  const DEFAULT_DYNAMIC_BODY = {
    shape: 'box',
    mass: 5,
    linearDamping: 0.1,
    angularDamping: 0.3
  };

  function toVec3Object(value) {
    if (value == null || value === '') return null;

    if (typeof value === 'string') {
      const parts = value.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        return { x: parts[0], y: parts[1], z: parts[2] };
      }
      return null;
    }

    if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
      return { x: value[0], y: value[1], z: value[2] };
    }

    if (typeof value === 'object' && value.x != null && value.y != null && value.z != null) {
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return { x, y, z };
      }
    }

    return null;
  }

  function toVec3String(value) {
    const vec = toVec3Object(value);
    return vec ? `${vec.x} ${vec.y} ${vec.z}` : '';
  }

  function combineVec3(baseValue, offsetValue) {
    const base = toVec3Object(baseValue) || { x: 0, y: 0, z: 0 };
    const offset = toVec3Object(offsetValue);

    if (!offset) {
      return baseValue == null ? null : base;
    }

    return {
      x: base.x + offset.x,
      y: base.y + offset.y,
      z: base.z + offset.z
    };
  }

  function getDescriptor(modelLike) {
    if (!window.ModelLibrary || typeof window.ModelLibrary.getModelDescriptor !== 'function') {
      return null;
    }

    return window.ModelLibrary.getModelDescriptor(modelLike);
  }

  function buildDynamicBodyConfig(dynamicBody, descriptor) {
    if (!dynamicBody) return null;

    // Respect physicsMode from manifest
    if (descriptor && descriptor.physicsMode === 'static') return null;
    if (descriptor && descriptor.physicsMode === 'kinematic') {
      return { body: 'type: kinematic; mass: 0', shape: 'type: box' };
    }

    const options = (typeof dynamicBody === 'object' && dynamicBody !== null) ? Object.assign({}, dynamicBody) : {};
    const config = Object.assign({}, DEFAULT_DYNAMIC_BODY, options);

    if (descriptor) {
      if (descriptor.colliderShape) {
        config.shape = descriptor.colliderShape;
      }
      if (descriptor.mass != null && typeof options.mass === 'undefined') {
        config.mass = descriptor.mass;
      }
    }

    return {
      body: `type: dynamic; mass: ${config.mass}; linearDamping: ${config.linearDamping}; angularDamping: ${config.angularDamping}`,
      shape: `type: ${config.shape}`
    };
  }

  function trimList(list, max) {
    if (!Array.isArray(list) || !max || list.length < max) return null;

    const removed = list.shift();
    if (removed && removed.parentNode) {
      removed.parentNode.removeChild(removed);
    }

    return removed;
  }

  function removeEntities(list) {
    if (!Array.isArray(list)) return;

    while (list.length > 0) {
      const el = list.pop();
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }

  // ── Material sanitiser ────────────────────────────────────────────
  // A-Frame 1.4.2 bundles THREE r147 whose MeshPhysicalMaterial shader
  // may lack uniforms for newer PBR extensions (specular, clearcoat…).
  // The GLTF loader still creates MeshPhysicalMaterial instances, so
  // refreshMaterialUniforms crashes trying to read a missing uniform.
  //
  // Fix:
  //  1. Downgrade MeshPhysicalMaterial → MeshStandardMaterial
  //  2. Null out any map whose texture has no valid image data

  const STANDARD_MAP_KEYS = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'alphaMap', 'envMap', 'lightMap', 'bumpMap',
    'displacementMap'
  ];

  function sanitizeMaterials(root) {
    if (!root) return;
    // Delegate to the global three-material-patch if available
    if (window._threeMaterialPatch && typeof window._threeMaterialPatch.rebuildAllMaterials === 'function') {
      window._threeMaterialPatch.rebuildAllMaterials(root);
      return;
    }
    // Fallback: force needsUpdate on all materials
    root.traverse(function (node) {
      if (!node.isMesh) return;
      var mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach(function (mat) {
        if (mat) mat.needsUpdate = true;
      });
    });
  }

  function instantiateModel(options) {
    const descriptor = getDescriptor(
      options.model || options.descriptor || options.modelUrl || options.source
    );
    const sceneEl = options.sceneEl || (options.parentEl && options.parentEl.sceneEl) || document.querySelector('a-scene');
    const parentEl = options.parentEl || sceneEl;

    if (!sceneEl || !parentEl || !descriptor) {
      return null;
    }

    // For user-added models, resolve blob URL from IndexedDB if not already cached
    if (descriptor.addedBy === 'user' && !descriptor.source) {
      if (window.ModelLibrary && typeof window.ModelLibrary.loadUserModelBlob === 'function') {
        const el = document.createElement(options.tagName || 'a-entity');
        parentEl.appendChild(el);
        window.ModelLibrary.loadUserModelBlob(descriptor.id).then(function (blobUrl) {
          if (!blobUrl) {
            console.warn('[model-spawner] Could not load user model blob for:', descriptor.id);
            if (el.parentNode) el.parentNode.removeChild(el);
            return;
          }
          descriptor.source = blobUrl;
          _finishSpawn(el, descriptor, options, sceneEl, parentEl);
        });
        return el;
      }
      return null;
    }

    if (!descriptor.source) {
      return null;
    }

    if (window.ModelLibrary && typeof window.ModelLibrary.canLoadAssets === 'function' && !window.ModelLibrary.canLoadAssets()) {
      if (typeof window.ModelLibrary.warnFileProtocol === 'function') {
        window.ModelLibrary.warnFileProtocol();
      }
      if (typeof options.onModelError === 'function') {
        options.onModelError(null, descriptor, new Error('Model loading unavailable over file://'));
      }
      return null;
    }

    const el = document.createElement(options.tagName || 'a-entity');
    _finishSpawn(el, descriptor, options, sceneEl, parentEl);
    return el;
  }

  function recycleModel(el, options) {
    const descriptor = getDescriptor(
      options.model || options.descriptor || options.modelUrl || options.source
    );
    if (!descriptor) return null;

    const currentModel = el.getAttribute('gltf-model');
    if (currentModel === descriptor.source) {
      // Exact same model recycled. No need to trigger a fresh model-loaded event.
      el.setAttribute('visible', 'true');
      const className = options.className === undefined ? 'grabbable clickable' : options.className;
      if (className) {
        el.setAttribute('class', className);
      }

      // Wake up physics
      if (el.components['ammo-body'] && el.components['ammo-body'].body && window.Ammo) {
        el.components['ammo-body'].body.setActivationState(1); // ACTIVE_TAG
      }

      // Reposition
      const combinedPosition = combineVec3(options.position, options.applyModelSpawnOffset === false ? null : descriptor.spawnOffset);
      if (combinedPosition) {
        const posStr = toVec3String(combinedPosition);
        el.setAttribute('position', posStr);
        el.setAttribute('data-reset-position', posStr);
        
        // Update Ammo Transform so physics doesn't fling the object from its old position
        if (el.components['ammo-body'] && el.components['ammo-body'].body && window.Ammo) {
          const worldPos = new window.THREE.Vector3(combinedPosition.x, combinedPosition.y, combinedPosition.z);
          const transform = el.components['ammo-body'].body.getWorldTransform();
          const origin = transform.getOrigin();
          origin.setValue(worldPos.x, worldPos.y, worldPos.z);
          el.components['ammo-body'].body.setWorldTransform(transform);
          const zero = new window.Ammo.btVector3(0, 0, 0);
          el.components['ammo-body'].body.setLinearVelocity(zero);
          el.components['ammo-body'].body.setAngularVelocity(zero);
          window.Ammo.destroy(zero);
        }
      }

      // Visual pop-in effect
      const flash = document.createElement('a-sphere');
      flash.setAttribute('radius', '0.2');
      flash.setAttribute('material', 'color: #00ffcc; emissive: #00ffcc; emissiveIntensity: 2; transparent: true; opacity: 0.8');
      const pos = el.object3D.position;
      flash.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
      flash.setAttribute('animation__scale', 'property: scale; to: 4 4 4; dur: 350; easing: easeOutQuad');
      flash.setAttribute('animation__fade',  'property: material.opacity; to: 0; dur: 350; easing: easeOutQuad');
      if (el.sceneEl) {
        el.sceneEl.appendChild(flash);
        setTimeout(() => {
          if (flash.parentNode) flash.parentNode.removeChild(flash);
        }, 350);
      }

      window.dispatchEvent(new CustomEvent('physics-sandbox:model-spawn-completed', {
        detail: { el, descriptor }
      }));

      return el;
    } else {
      // Overwriting model
      el.setAttribute('visible', 'true');
      _finishSpawn(el, descriptor, options, el.sceneEl, el.parentNode);
      return el;
    }
  }

  function _finishSpawn(el, descriptor, options, sceneEl, parentEl) {
    const combinedPosition = combineVec3(
      options.position,
      options.applyModelSpawnOffset === false ? null : descriptor.spawnOffset
    );
    const rotation = options.rotation !== undefined ? options.rotation : descriptor.rotation;
    const scale = options.scale !== undefined ? options.scale : descriptor.scale;
    const className = options.className === undefined ? 'grabbable clickable' : options.className;
    const dynamicBodyValue = buildDynamicBodyConfig(options.dynamicBody, descriptor);


    // CRITICAL FIX: Attach listener BEFORE setAttribute('gltf-model')! 
    // A-Frame's internal caching evaluates synchronously during setAttribute if the model is cached.
    // If we attach it later, the event will have already fired and the sanitizer will be skipped forever.
    el.addEventListener('model-loaded', function onModelLoaded(event) {
      el.removeEventListener('model-loaded', onModelLoaded);

      // Sanitize materials FIRST — some GLB models have broken texture
      // references that crash THREE.js r147's refreshMaterialUniforms.
      const mesh = el.getObject3D('mesh');
      sanitizeMaterials(mesh);

      if (dynamicBodyValue && typeof options.onBodyLoaded === 'function') {
        el.addEventListener('body-loaded', function onBodyLoaded(bodyEvent) {
          el.removeEventListener('body-loaded', onBodyLoaded);
          options.onBodyLoaded(el, descriptor, bodyEvent);
        });
      }

      if (dynamicBodyValue) {
        el.setAttribute('ammo-body', dynamicBodyValue.body);
        el.setAttribute('ammo-shape', dynamicBodyValue.shape);
      }
      if (options.enableDragger) {
        el.setAttribute('object-dragger', '');
        el.setAttribute('object-physics-adapter', '');
      }
      if (options.autoPlayAnimations !== false) {
        if (mesh && mesh.animations && mesh.animations.length > 0) {
          el.setAttribute('animation-mixer', '');
        }
      }

      // Add visual pop-in effect (detached from the rigid body)
      const flash = document.createElement('a-sphere');
      flash.setAttribute('radius', '0.2');
      flash.setAttribute('material', 'color: #00ffcc; emissive: #00ffcc; emissiveIntensity: 2; transparent: true; opacity: 0.8');
      
      const pos = el.object3D.position;
      flash.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
      flash.setAttribute('animation__scale', 'property: scale; to: 4 4 4; dur: 350; easing: easeOutQuad');
      flash.setAttribute('animation__fade',  'property: material.opacity; to: 0; dur: 350; easing: easeOutQuad');
      
      if (el.sceneEl) {
        el.sceneEl.appendChild(flash);
        setTimeout(() => {
          if (flash.parentNode) flash.parentNode.removeChild(flash);
        }, 350);
      }

      if (typeof options.onModelLoaded === 'function') {
        options.onModelLoaded(el, descriptor, event);
      }
      if (!dynamicBodyValue && typeof options.onBodyLoaded === 'function') {
        options.onBodyLoaded(el, descriptor, null);
      }

      // Dispatch global completed event
      window.dispatchEvent(new CustomEvent('physics-sandbox:model-spawn-completed', {
        detail: { el, descriptor }
      }));
    });

    el.setAttribute('gltf-model', descriptor.source);

    if (combinedPosition) {
      const positionString = toVec3String(combinedPosition);
      el.setAttribute('position', positionString);
      el.setAttribute('data-reset-position', positionString);
    }
    if (rotation) {
      el.setAttribute('rotation', toVec3String(rotation) || rotation);
    }
    if (scale) {
      el.setAttribute('scale', toVec3String(scale) || scale);
    }
    if (className) {
      el.setAttribute('class', className);
    }

    if (options.attributes && typeof options.attributes === 'object') {
      Object.keys(options.attributes).forEach(name => {
        el.setAttribute(name, options.attributes[name]);
      });
    }

    if (typeof options.beforeAppend === 'function') {
      options.beforeAppend(el, descriptor);
    }

    if (typeof options.onModelError === 'function') {
      el.addEventListener('model-error', function onModelError(event) {
        el.removeEventListener('model-error', onModelError);
        options.onModelError(el, descriptor, event);
        window.dispatchEvent(new CustomEvent('physics-sandbox:model-spawn-error', {
          detail: { el, descriptor, error: event }
        }));
      });
    }

    parentEl.appendChild(el);

    if (typeof options.onAppended === 'function') {
      options.onAppended(el, descriptor);
    }

    // Dispatch global started event
    window.dispatchEvent(new CustomEvent('physics-sandbox:model-spawn-started', {
      detail: { el, descriptor }
    }));

    return el;
  }

  function getSelectedDescriptor() {
    if (!window.ModelLibrary || typeof window.ModelLibrary.getSelectedModelDescriptorFromCache !== 'function') {
      return null;
    }

    return window.ModelLibrary.getSelectedModelDescriptorFromCache();
  }

  window.ModelSpawner = {
    combineVec3,
    toVec3String,
    buildDynamicBodyConfig,
    trimList,
    removeEntities,
    instantiateModel,
    recycleModel,
    sanitizeMaterials,
    getSelectedDescriptor
  };

  // ── Centralized Spawn UI Feedback ──────────────────────────────
  window.addEventListener('physics-sandbox:model-spawn-started', function () {
    ['btn-spawn', 'btn-release', 'btn-launch', 'btn-attach-bob'].forEach(id => {
       const btn = document.getElementById(id);
       if (!btn) return;
       
       const textAttr = btn.getAttribute('text');
       if (!textAttr) return;
       
       if (!btn.dataset.origText) {
         btn.dataset.origText = textAttr.value;
       }
       if (!btn.dataset.origColor) {
         btn.dataset.origColor = textAttr.color || 'white';
       }
       
       const loadingStr = window.I18n ? window.I18n.t('common.loading').toUpperCase() : 'LOADING...';
      const newAttr = Object.assign({}, textAttr, { value: loadingStr, color: '#ffb300' });
       // A-Frame text update string form
       btn.setAttribute('text', `value: ${newAttr.value}; align: ${newAttr.align}; width: ${newAttr.width}; color: ${newAttr.color}`);
    });
  });

  window.addEventListener('physics-sandbox:model-spawn-completed', function () {
    ['btn-spawn', 'btn-release', 'btn-launch', 'btn-attach-bob'].forEach(id => {
       const btn = document.getElementById(id);
       if (!btn || !btn.dataset.origText) return;
       
       const textAttr = btn.getAttribute('text');
       
       // Success flash
       const okStr = window.I18n ? window.I18n.t('common.spawnOk', {defaultValue: 'SPAWN OK!'}) : 'SPAWN OK!';
      btn.setAttribute('text', `value: ${okStr}; align: ${textAttr.align}; width: ${textAttr.width}; color: #4CAF50`);
       
       // Revert after 1 second
       setTimeout(() => {
         if (btn.parentNode) {
           btn.setAttribute('text', `value: ${btn.dataset.origText}; align: ${textAttr.align}; width: ${textAttr.width}; color: ${btn.dataset.origColor}`);
         }
       }, 1000);
    });
  });

  window.addEventListener('physics-sandbox:model-spawn-error', function () {
    ['btn-spawn', 'btn-release', 'btn-launch', 'btn-attach-bob'].forEach(id => {
       const btn = document.getElementById(id);
       if (!btn || !btn.dataset.origText) return;
       
       const textAttr = btn.getAttribute('text');
       
       // Error flash
       const errStr = window.I18n ? window.I18n.t('common.spawnError', {defaultValue: 'ERROR'}) : 'ERROR';
      btn.setAttribute('text', `value: ${errStr}; align: ${textAttr.align}; width: ${textAttr.width}; color: #F44336`);
       
       setTimeout(() => {
         if (btn.parentNode) {
           btn.setAttribute('text', `value: ${btn.dataset.origText}; align: ${textAttr.align}; width: ${textAttr.width}; color: ${btn.dataset.origColor}`);
         }
       }, 1500);
    });
  });

})();
