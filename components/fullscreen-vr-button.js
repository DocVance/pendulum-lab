/**
 * fullscreen-vr-button.js
 *
 * Overrides A-Frame's built-in VR enter button to be context-aware:
 *   - If a VR headset is connected → enters immersive VR (default behavior)
 *   - If no VR headset → enters fullscreen mode instead
 *
 * This restores the "click the goggles icon to go fullscreen on desktop"
 * behavior that existed in older A-Frame versions using the WebVR API.
 *
 * Usage: Include this script after aframe.min.js. No other setup needed.
 */

(function () {
  'use strict';

  function patchVRButton() {
    var sceneEl = document.querySelector('a-scene');
    if (!sceneEl) {
      setTimeout(patchVRButton, 200);
      return;
    }

    // Wait for the scene to fully initialize so the VR button exists
    function onSceneReady() {
      var vrButton = sceneEl.querySelector('.a-enter-vr-button') ||
                     document.querySelector('.a-enter-vr-button');
      if (!vrButton) {
        // A-Frame creates the button slightly after scene init
        setTimeout(onSceneReady, 300);
        return;
      }

      // Check if WebXR immersive VR is supported
      var hasVR = false;
      if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
          hasVR = supported;
          if (!supported) {
            // No headset: change the button tooltip
            vrButton.title = 'Enter Fullscreen';
          }
        }).catch(function () {
          hasVR = false;
          vrButton.title = 'Enter Fullscreen';
        });
      } else {
        vrButton.title = 'Enter Fullscreen';
      }

      // Intercept clicks on the VR button
      vrButton.addEventListener('click', function (evt) {
        if (hasVR) {
          // Let A-Frame handle VR entry normally
          return;
        }

        // No VR headset: enter/exit browser fullscreen instead
        evt.stopPropagation();
        evt.preventDefault();

        var canvas = sceneEl.canvas || document.querySelector('.a-canvas');
        var target = canvas || document.documentElement;

        if (document.fullscreenElement) {
          document.exitFullscreen().catch(function () {});
        } else {
          target.requestFullscreen().catch(function (err) {
            console.warn('[fullscreen] requestFullscreen failed:', err.message);
          });
        }
      }, true); // useCapture = true to intercept before A-Frame's handler

      console.log('[fullscreen-vr-button] Patched VR button for dual fullscreen/VR behavior.');
    }

    if (sceneEl.hasLoaded) {
      onSceneReady();
    } else {
      sceneEl.addEventListener('loaded', onSceneReady);
    }
  }

  // Start patching once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchVRButton);
  } else {
    patchVRButton();
  }
})();
