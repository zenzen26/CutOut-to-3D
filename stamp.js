// ═══════════════════════════════════════════════════════════════════
// STAMP — SVG upload, alpha mask, cursor preview, stamp-to-canvas
// ═══════════════════════════════════════════════════════════════════
import { DC, CTX, SC, SCTX } from './canvas.js';
import { penColor, penSize, setHasStroke, setStampMode, setSvgName, setStampW, setStampH } from './draw.js';
import { setMode, setSt } from './draw.js';

// ── Stamp state ────────────────────────────────────────────────────
let svgImg      = null;
let svgAlphaMask = null;

// stampW / stampH are owned in draw.js (so draw.js can read them);
// we import references via getters below and keep local shadows for
// internal pixel loops — updated whenever a new SVG loads.
let _stampW = 140;
let _stampH = 140;

// ── File upload ────────────────────────────────────────────────────
document.getElementById('btnSVG').addEventListener('click', () => {
  document.getElementById('svgFileIn').click();
});

document.getElementById('svgFileIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  setSvgName(f.name);
  const reader = new FileReader();
  reader.onload = ev => {
    const svgText = ev.target.result;

    // Parse native SVG dimensions / viewBox for correct aspect ratio
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl  = svgDoc.querySelector('svg');
    let nw = 0, nh = 0;
    if (svgEl) {
      nw = parseFloat(svgEl.getAttribute('width'))  || 0;
      nh = parseFloat(svgEl.getAttribute('height')) || 0;
      if (!nw || !nh) {
        const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/);
        if (vb.length >= 4) { nw = parseFloat(vb[2]); nh = parseFloat(vb[3]); }
      }
    }
    if (!nw || !nh) { nw = 100; nh = 100; }
    const ar = nw / nh;
    if (ar >= 1) { _stampW = 150; _stampH = Math.round(150 / ar); }
    else         { _stampH = 150; _stampW = Math.round(150 * ar); }
    setStampW(_stampW);
    setStampH(_stampH);

    // Rasterise SVG into offscreen canvas to build the alpha mask
    const blob   = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url    = URL.createObjectURL(blob);
    const tmpImg = new Image();
    tmpImg.onload = () => {
      const off  = document.createElement('canvas');
      off.width  = _stampW; off.height = _stampH;
      const octx = off.getContext('2d');
      octx.drawImage(tmpImg, 0, 0, _stampW, _stampH);
      URL.revokeObjectURL(url);

      // Build alpha mask
      const px = octx.getImageData(0, 0, _stampW, _stampH).data;
      svgAlphaMask = new Uint8Array(_stampW * _stampH);
      for (let i = 0; i < _stampW * _stampH; i++)
        svgAlphaMask[i] = px[i * 4 + 3] > 20 ? 1 : 0;
      svgImg = tmpImg;

      setMode('stamp');
      e.target.value = '';
    };
    tmpImg.onerror = () => alert('Could not load SVG. Ensure it is a valid .svg file.');
    tmpImg.src = url;
  };
  reader.readAsText(f);
});

document.getElementById('stampClear').addEventListener('click', clearStamp);

export function clearStamp() {
  svgImg = null; svgAlphaMask = null;
  setSvgName('');
  document.getElementById('stampBadge').classList.remove('on');
  setMode('pen');
}

// ── Cursor preview ─────────────────────────────────────────────────
export function drawStampCursor(p) {
  SCTX.clearRect(0, 0, SC.width, SC.height);
  if (!svgAlphaMask) return;
  const ox = Math.round(p.x) - Math.floor(_stampW / 2);
  const oy = Math.round(p.y) - Math.floor(_stampH / 2);

  // Ghost fill at low opacity
  SCTX.save();
  SCTX.globalAlpha = 0.35;
  SCTX.fillStyle   = penColor;
  for (let y = 0; y < _stampH; y++)
    for (let x = 0; x < _stampW; x++)
      if (svgAlphaMask[y * _stampW + x]) SCTX.fillRect(ox + x, oy + y, 1, 1);
  SCTX.restore();

  // Outline border pixels at full opacity
  SCTX.save();
  SCTX.fillStyle   = penColor;
  SCTX.globalAlpha = 0.85;
  for (let y = 0; y < _stampH; y++) {
    for (let x = 0; x < _stampW; x++) {
      if (!svgAlphaMask[y * _stampW + x]) continue;
      if (
        x === 0 || x === _stampW - 1 || y === 0 || y === _stampH - 1 ||
        !svgAlphaMask[y * _stampW + (x - 1)] || !svgAlphaMask[y * _stampW + (x + 1)] ||
        !svgAlphaMask[(y - 1) * _stampW + x] || !svgAlphaMask[(y + 1) * _stampW + x]
      ) {
        SCTX.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  SCTX.restore();
}

export function clearStampCursor() {
  SCTX.clearRect(0, 0, SC.width, SC.height);
}

// ── Stamp to canvas ────────────────────────────────────────────────
export function doStamp(p) {
  if (!svgAlphaMask) return;
  const ox   = Math.round(p.x) - Math.floor(_stampW / 2);
  const oy   = Math.round(p.y) - Math.floor(_stampH / 2);
  const half = Math.max(1, Math.ceil(penSize / 2));

  CTX.save();
  CTX.fillStyle = penColor;
  for (let y = 0; y < _stampH; y++) {
    for (let x = 0; x < _stampW; x++) {
      if (!svgAlphaMask[y * _stampW + x]) continue;
      const isBorder = (
        x === 0 || x === _stampW - 1 || y === 0 || y === _stampH - 1 ||
        !svgAlphaMask[y * _stampW + (x - 1)] || !svgAlphaMask[y * _stampW + (x + 1)] ||
        !svgAlphaMask[(y - 1) * _stampW + x] || !svgAlphaMask[(y + 1) * _stampW + x]
      );
      if (isBorder) {
        CTX.beginPath();
        CTX.arc(ox + x, oy + y, half, 0, Math.PI * 2);
        CTX.fill();
      }
    }
  }
  CTX.restore();

  drawStampCursor(p);

  setHasStroke(true);
  document.getElementById('btn3d').disabled = false;
  setSt('stamp', 'Stamped! Click again to add more, or click ⬡ 3D');
  document.getElementById('caption').textContent = 'stamped 🍪';
}
