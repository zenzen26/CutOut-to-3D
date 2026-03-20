// ═══════════════════════════════════════════════════════════════════
// APP — entry point: imports all modules, wires 3D panel buttons
// ═══════════════════════════════════════════════════════════════════
import './canvas.js';
import './draw.js';
import './stamp.js';
import { doCut, init3D, destroy3D } from './cut3d.js';
import { setSt, setHasCut }         from './draw.js';
import { DC, CTX }                  from './canvas.js';

// ── 3D button ──────────────────────────────────────────────────────
function setDrawActionsVisible(v) {
  const ids = ['btnUndo', 'btnClearAll'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = v ? '' : 'hidden';
  });
}

document.getElementById('btn3d').addEventListener('click', () => {
  doCut();
  document.getElementById('btn3d').disabled = true;
  document.getElementById('v3d').classList.add('on');
  setDrawActionsVisible(false);
  setSt('d3', '3D — drag to rotate · scroll to zoom · right-drag to pan');
  document.getElementById('caption').textContent = '3D float ✦';
  requestAnimationFrame(() => requestAnimationFrame(init3D));
});

// ── Boot ───────────────────────────────────────────────────────────
setSt('', 'Draw a closed outline, or upload an SVG stamp - then click 3D');
