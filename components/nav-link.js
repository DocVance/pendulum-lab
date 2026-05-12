/**
 * nav-link component — simple A-Frame navigation link
 *
 * Replaces A-Frame's built-in `link` component which creates an unreliable
 * VR portal effect. This component simply navigates the browser on click.
 *
 * Usage:
 *   <a-entity nav-link="href: ../hub.html" class="clickable"></a-entity>
 */

AFRAME.registerComponent('nav-link', {
  schema: {
    href: { type: 'string', default: '' }
  },

  init: function () {
    var self = this;
    this.el.addEventListener('click', function () {
      if (self.data.href) {
        window.location.href = self.data.href;
      }
    });
  }
});
