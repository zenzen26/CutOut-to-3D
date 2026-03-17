// ═══════════════════════════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════════════════════════
export const DC   = document.getElementById('drawCanvas');
export const CTX  = DC.getContext('2d');
export const SC   = document.getElementById('stampCursor');
export const SCTX = SC.getContext('2d');

export function sizeCanvas() {
  const w = document.getElementById('cwrap').clientWidth || 900;
  const h = Math.max(440, Math.round(window.innerHeight * 0.52));
  DC.width  = w; DC.height = h;
  DC.style.width  = w + 'px'; DC.style.height = h + 'px';
  SC.width  = w; SC.height = h;
  SC.style.width  = w + 'px'; SC.style.height = h + 'px';
}

SC.style.display = 'block';
DC.style.cursor  = 'none';
window.addEventListener('resize', sizeCanvas);

// Wait for full page load before sizing so cwrap has its final dimensions.
if (document.readyState === 'complete') {
  sizeCanvas();
} else {
  window.addEventListener('load', sizeCanvas, { once: true });
}