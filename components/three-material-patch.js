/**
 * three-material-patch.js
 *
 * Prevents THREE.js r147 from crashing on certain GLTF materials.
 *
 * Root cause:
 *   The GLTF loader in THREE r147 can produce material instances
 *   (MeshBasicMaterial, MeshPhysicalMaterial, etc.) whose internal
 *   properties cause `refreshMaterialUniforms` to access undefined
 *   shader uniforms, crashing the render loop.
 *
 * Fix:
 *   1. Patch GLTFLoader to rebuild ALL materials as fresh, clean
 *      instances immediately after parsing any .glb/.gltf file.
 *   2. Patch A-Frame's gltf-model component with the same rebuild.
 *   3. Wrap renderer.render() to catch and recover from any crash
 *      by performing an emergency full-scene material rebuild.
 *
 * This MUST load AFTER aframe.min.js but BEFORE any models load.
 */

(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('[material-patch] THREE not found, skipping.');
    return;
  }

  var SAFE_MAP_KEYS = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'alphaMap', 'envMap', 'lightMap', 'bumpMap',
    'displacementMap'
  ];

  /**
   * Create a brand-new, clean material from an existing one.
   * This eliminates any corrupt internal state from the GLTF loader.
   */
  function rebuildMaterial(mat) {
    if (!mat) return mat;

    // For MeshPhysicalMaterial or MeshStandardMaterial with PBR extensions,
    // downgrade to plain MeshStandardMaterial
    if (mat.isMeshPhysicalMaterial || mat.isMeshStandardMaterial) {
      var std = new THREE.MeshStandardMaterial();
      std.name = mat.name || '';
      if (mat.color) std.color.copy(mat.color);
      std.roughness = mat.roughness != null ? mat.roughness : 1;
      std.metalness = mat.metalness != null ? mat.metalness : 0;
      std.side = mat.side;
      std.transparent = mat.transparent;
      std.opacity = mat.opacity != null ? mat.opacity : 1;
      std.alphaTest = mat.alphaTest || 0;
      if (mat.emissive) std.emissive.copy(mat.emissive);
      std.emissiveIntensity = mat.emissiveIntensity != null ? mat.emissiveIntensity : 1;
      SAFE_MAP_KEYS.forEach(function (key) {
        if (mat[key] && mat[key].image) std[key] = mat[key];
      });
      if (mat.normalScale) std.normalScale.copy(mat.normalScale);
      std.needsUpdate = true;
      return std;
    }

    // For MeshBasicMaterial — rebuild as a FRESH MeshBasicMaterial
    // The GLTF loader's MeshBasicMaterial can carry internal defines/flags
    // that produce broken shader programs in r147.
    if (mat.isMeshBasicMaterial) {
      var basic = new THREE.MeshBasicMaterial();
      basic.name = mat.name || '';
      if (mat.color) basic.color.copy(mat.color);
      basic.side = mat.side;
      basic.transparent = mat.transparent;
      basic.opacity = mat.opacity != null ? mat.opacity : 1;
      basic.alphaTest = mat.alphaTest || 0;
      basic.wireframe = mat.wireframe || false;
      // Copy only texture maps with valid image data
      if (mat.map && mat.map.image) {
        basic.map = mat.map;
      }
      if (mat.aoMap && mat.aoMap.image) basic.aoMap = mat.aoMap;
      if (mat.alphaMap && mat.alphaMap.image) basic.alphaMap = mat.alphaMap;
      if (mat.envMap && mat.envMap.image) basic.envMap = mat.envMap;
      if (mat.lightMap && mat.lightMap.image) basic.lightMap = mat.lightMap;
      basic.needsUpdate = true;
      return basic;
    }

    // Any other material type: force a shader recompile
    mat.needsUpdate = true;
    return mat;
  }

  /**
   * Traverse a scene graph and rebuild all mesh materials.
   */
  function rebuildAllMaterials(root) {
    if (!root) return;
    var count = 0;
    root.traverse(function (node) {
      if (!node.isMesh) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map(function (m) {
          count++;
          return rebuildMaterial(m);
        });
      } else if (node.material) {
        node.material = rebuildMaterial(node.material);
        count++;
      }
    });
    if (count > 0) {
      console.log('[material-patch] Rebuilt ' + count + ' materials.');
    }
  }

  // ── Layer 1: Patch GLTFLoader ──
  if (THREE.GLTFLoader) {
    var originalParse = THREE.GLTFLoader.prototype.parse;
    THREE.GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
      var wrappedOnLoad = function (gltf) {
        if (gltf && gltf.scene) {
          rebuildAllMaterials(gltf.scene);
        }
        if (onLoad) onLoad(gltf);
      };
      return originalParse.call(this, data, path, wrappedOnLoad, onError);
    };
    console.log('[material-patch] Patched GLTFLoader.parse.');
  }

  // ── Layer 2: Patch A-Frame gltf-model component ──
  if (typeof AFRAME !== 'undefined') {
    function patchGltfComponent() {
      var gltfProto = AFRAME.components['gltf-model'];
      if (!gltfProto) {
        setTimeout(patchGltfComponent, 100);
        return;
      }
      var originalUpdate = gltfProto.Component.prototype.update;
      gltfProto.Component.prototype.update = function () {
        originalUpdate.apply(this, arguments);
        var self = this;
        if (!self._materialPatchHooked) {
          self._materialPatchHooked = true;
          self.el.addEventListener('model-loaded', function () {
            var mesh = self.el.getObject3D('mesh');
            if (mesh) rebuildAllMaterials(mesh);
          });
        }
      };
      console.log('[material-patch] Patched gltf-model component.');
    }
    patchGltfComponent();
  }

  // ── Layer 3: Renderer safety net ──
  if (typeof AFRAME !== 'undefined') {
    function patchSceneRender() {
      var sceneEl = document.querySelector('a-scene');
      if (!sceneEl || !sceneEl.renderer) {
        setTimeout(patchSceneRender, 200);
        return;
      }

      var renderer = sceneEl.renderer;
      var originalRender = renderer.render.bind(renderer);
      var crashCount = 0;

      renderer.render = function (scene, camera) {
        try {
          originalRender(scene, camera);
          // If we've recovered from a crash, reset counter
          if (crashCount > 0) {
            console.log('[material-patch] Render recovered after ' + crashCount + ' failed frames.');
            crashCount = 0;
          }
        } catch (e) {
          crashCount++;

          if (crashCount === 1) {
            console.error('[material-patch] Render crash:', e.message);
            console.warn('[material-patch] Emergency: rebuilding ALL scene materials...');
          }

          // Emergency rebuild: replace EVERY material in the entire scene
          if (scene) {
            rebuildAllMaterials(scene);

            // Also nuke the renderer's internal program cache to force
            // full shader recompilation
            if (renderer.info && renderer.info.programs) {
              // THREE r147 exposes the program list, iterate and destroy
              var programs = renderer.info.programs;
              if (Array.isArray(programs)) {
                for (var i = programs.length - 1; i >= 0; i--) {
                  try {
                    programs[i].destroy();
                  } catch (ignored) {}
                }
                programs.length = 0;
              }
            }

            // Force dispose internal WebGL resource cache
            if (renderer.properties) {
              try { renderer.properties.dispose(); } catch (ignored) {}
            }
          }

          // Try rendering again with clean materials
          try {
            originalRender(scene, camera);
          } catch (e2) {
            // Still failing — skip frame silently, but don't spam logs
            if (crashCount <= 3) {
              console.warn('[material-patch] Render still failing after rebuild, skipping frame.');
            }
          }
        }
      };

      console.log('[material-patch] Wrapped renderer with safety net.');
    }
    patchSceneRender();
  }

  // Export for manual use
  window._threeMaterialPatch = {
    rebuildMaterial: rebuildMaterial,
    rebuildAllMaterials: rebuildAllMaterials
  };

  console.log('[material-patch] Material safety patch loaded.');
})();
