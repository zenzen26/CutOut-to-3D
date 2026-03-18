// ═══════════════════════════════════════════════════════════════════
// DRAW — state, helpers, stabiliser, drawing, cursors, toolbar
// ═══════════════════════════════════════════════════════════════════
import { DC, CTX, SC, SCTX } from './canvas.js';
import { doStamp }            from './stamp.js';
import { drawStampCursor, clearStampCursor, clearStamp } from './stamp.js';
import { destroy3D }          from './cut3d.js';

// ── State ──────────────────────────────────────────────────────────
export let inking     = false;
export let penColor   = '#c0392b';
export let penSize    = 4;
export let hasStroke  = false;
export let hasCut     = false;
export let stabLevel  = 4;
export let stabPoints = [];
export let lastDrawPt = null;
export let eraserMode = false;
export let eraserSize = 16;

// ── Undo stack (up to 10 strokes) ─────────────────────────────────
const MAX_UNDO = 10;
const undoStack = [];

function pushUndo() {
  const snap = CTX.getImageData(0, 0, DC.width, DC.height);
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  updateUndoBtn();
}

function updateUndoBtn() {
  const btn = document.getElementById('btnUndo');
  if (btn) btn.disabled = undoStack.length === 0;
}

export function undoStroke() {
  if (!undoStack.length) return;
  const snap = undoStack.pop();
  CTX.putImageData(snap, 0, 0);
  // update hasStroke by checking if any pixel is drawn
  const d = CTX.getImageData(0, 0, DC.width, DC.height).data;
  hasStroke = false;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { hasStroke = true; break; } }
  if (!hasStroke) {
    document.getElementById('btn3d').disabled = true;
    setSt('', 'Draw a closed outline, or upload an SVG stamp — then click ⬡ 3D');
    document.getElementById('caption').textContent = 'untitled clipping';
  } else {
    setSt('draw', 'Looking good — click ⬡ 3D when ready!');
  }
  updateUndoBtn();
}

// stamp state (owned here so draw.js can check stampMode in istart/imove)
export let stampMode  = false;
export let svgName    = '';
export let stampW     = 140;
export let stampH     = 140;

export function setHasStroke(v)  { hasStroke  = v; }
export function setHasCut(v)     { hasCut     = v; }
export function setStampMode(v)  { stampMode  = v; }
export function setSvgName(v)    { svgName    = v; }
export function setStampW(v)     { stampW     = v; }
export function setStampH(v)     { stampH     = v; }

// ── Helpers ────────────────────────────────────────────────────────
export function dpos(e) {
  const r = DC.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (DC.width  / r.width),
    y: (e.clientY - r.top)  * (DC.height / r.height)
  };
}

export function setSt(state, msg) {
  document.getElementById('sdot').className = 'sdot' + (state ? ' ' + state : '');
  document.getElementById('smsg').textContent = msg;
  const is3d = state === 'd3';
  document.getElementById('p1').classList.toggle('on', !is3d && state !== '');
  document.getElementById('p3').classList.toggle('on', is3d);
  if (state === '' || state === 'draw' || state === 'stamp')
    document.getElementById('p1').classList.add('on');
}

// ── Stabiliser ─────────────────────────────────────────────────────
function getSmoothedPoint(raw) {
  if (stabLevel === 0) return raw;
  stabPoints.push(raw);
  if (stabPoints.length > stabLevel + 1) stabPoints.shift();
  let wx = 0, wy = 0, wt = 0;
  stabPoints.forEach((p, i) => {
    const w = i + 1;
    wx += p.x * w; wy += p.y * w; wt += w;
  });
  return { x: wx / wt, y: wy / wt };
}

// ── Drawing event handlers ─────────────────────────────────────────
function istart(e) {
  if (stampMode) { pushUndo(); doStamp(dpos(e)); return; }
  pushUndo();
  inking = true;
  stabPoints = [];
  const p = dpos(e);
  lastDrawPt = p;
  CTX.beginPath(); CTX.moveTo(p.x, p.y);
  if (eraserMode) {
    CTX.globalCompositeOperation = 'destination-out';
    CTX.strokeStyle = 'rgba(0,0,0,1)';
    CTX.lineWidth   = eraserSize;
  } else {
    CTX.globalCompositeOperation = 'source-over';
    CTX.strokeStyle = penColor;
    CTX.lineWidth   = penSize;
  }
  CTX.lineCap = 'round'; CTX.lineJoin = 'round';
}

function imove(e) {
  const raw = dpos(e);
  if (stampMode) { drawStampCursor(raw); return; }
  if (eraserMode && !inking) { drawEraserCursor(raw); return; }
  if (eraserMode && inking)  { drawEraserCursor(raw); }
  if (!eraserMode) drawPenCursor(raw);
  if (!inking) return;
  const p = getSmoothedPoint(raw);
  CTX.lineTo(p.x, p.y); CTX.stroke();
  CTX.beginPath(); CTX.moveTo(p.x, p.y);
  lastDrawPt = p;
  if (!eraserMode && !hasStroke) {
    hasStroke = true;
    document.getElementById('btn3d').disabled = false;
    setSt('draw', 'Looking good — click ⬡ 3D when ready!');
  }
}

function iend() {
  inking = false;
  stabPoints = [];
  lastDrawPt = null;
  CTX.globalCompositeOperation = 'source-over';
}

DC.addEventListener('mousedown',  istart);
DC.addEventListener('mousemove',  imove);
DC.addEventListener('mouseup',    iend);
DC.addEventListener('mouseleave', () => { iend(); clearStampCursor(); });
DC.addEventListener('touchstart', e => { e.preventDefault(); istart(e.touches[0]); }, { passive: false });
DC.addEventListener('touchmove',  e => { e.preventDefault(); imove(e.touches[0]);  }, { passive: false });
DC.addEventListener('touchend',   iend);

// ── Cursor renderers ───────────────────────────────────────────────
function drawEraserCursor(p) {
  SCTX.clearRect(0, 0, SC.width, SC.height);
  const r = eraserSize / 2;
  SCTX.save();
  SCTX.beginPath();
  SCTX.arc(p.x, p.y, r, 0, Math.PI * 2);
  SCTX.strokeStyle = 'rgba(80,80,80,0.7)';
  SCTX.lineWidth   = 1.5;
  SCTX.setLineDash([3, 3]);
  SCTX.stroke();
  SCTX.restore();
}

function drawPenCursor(p) {
  SCTX.clearRect(0, 0, SC.width, SC.height);
  const r = Math.max(1, penSize / 2);
  SCTX.save();
  SCTX.beginPath();
  SCTX.arc(p.x, p.y, r, 0, Math.PI * 2);
  SCTX.fillStyle = penColor;
  SCTX.globalAlpha = 0.85;
  SCTX.fill();
  SCTX.globalAlpha = 0.5;
  SCTX.beginPath();
  SCTX.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
  SCTX.strokeStyle = 'rgba(0,0,0,0.4)';
  SCTX.lineWidth = 1;
  SCTX.setLineDash([]);
  SCTX.stroke();
  SCTX.restore();
}

// ── Mode switcher ──────────────────────────────────────────────────
let activeMode = 'pen';

export function setMode(mode) {
  eraserMode = false;
  stampMode  = false;
  document.getElementById('btnEraser').classList.remove('on');
  clearStampCursor();
  SC.style.display = 'block';
  DC.style.cursor  = 'none';
  CTX.globalCompositeOperation = 'source-over';

  activeMode = mode;

  if (mode === 'eraser') {
    eraserMode = true;
    document.getElementById('btnEraser').classList.add('on');
    SC.style.display = 'block';
    DC.style.cursor  = 'none';
    setSt('draw', 'Eraser active — drag to erase. Click Eraser again to switch back to pen.');

  } else if (mode === 'stamp') {
    stampMode = true;
    SC.style.display = 'block';
    DC.style.cursor  = 'none';
    document.getElementById('stampBadge').classList.add('on');
    document.getElementById('stampName').textContent = svgName;
    setSt('stamp', 'Move over canvas to preview · click to stamp outline in pen colour');
    document.getElementById('caption').textContent = 'stamp mode 🍪';

  } else {
    SC.style.display = 'block';
    DC.style.cursor  = 'none';
    if (hasCut) setSt('draw', 'Back to drawing.');
    else if (hasStroke) setSt('draw', 'Looking good — click ⬡ 3D when ready!');
    else setSt('', 'Draw a closed outline, or upload an SVG stamp — then click ⬡ 3D');
  }
}

// ── Toolbar event listeners ────────────────────────────────────────
document.querySelectorAll('.cdot').forEach(d => {
  d.addEventListener('click', () => {
    document.querySelectorAll('.cdot').forEach(x => x.classList.remove('on'));
    d.classList.add('on');
    penColor = d.dataset.c;
    setMode('pen');
  });
});

document.getElementById('btnEraser').addEventListener('click', () => {
  setMode(activeMode === 'eraser' ? 'pen' : 'eraser');
});

document.getElementById('esz').addEventListener('input', e => {
  eraserSize = +e.target.value;
  const d = document.getElementById('ezdot');
  const vis = Math.min(eraserSize, 24);
  d.style.width  = vis + 'px';
  d.style.height = vis + 'px';
});

document.getElementById('bsz').addEventListener('input', e => {
  penSize = +e.target.value;
  document.getElementById('szdot').style.cssText = `width:${penSize}px;height:${penSize}px`;
});

document.getElementById('stabSlider').addEventListener('input', e => {
  stabLevel = +e.target.value;
  document.getElementById('stabVal').textContent = stabLevel === 0 ? 'off' : stabLevel;
});

document.getElementById('btnClearAll').addEventListener('click', () => {
  CTX.clearRect(0, 0, DC.width, DC.height);
  hasStroke = hasCut = false;
  DC._rawDrawing = null; DC._outside = null;
  undoStack.length = 0;
  updateUndoBtn();
  document.getElementById('btn3d').disabled        = true;
  document.getElementById('btnEdit').style.display = 'none';
  setSt('', 'Draw a closed outline, or upload an SVG stamp — then click ⬡ 3D');
  document.getElementById('caption').textContent = 'untitled clipping';
});

document.getElementById('btnUndo').addEventListener('click', undoStroke);

document.getElementById('btnEdit').addEventListener('click', () => {
  document.getElementById('v3d').classList.remove('on');
  destroy3D();
  if (DC._rawDrawing) CTX.putImageData(DC._rawDrawing, 0, 0);
  hasCut = false;
  document.getElementById('btn3d').disabled        = false;
  document.getElementById('btnEdit').style.display = 'none';
  ['btnUndo', 'btnClearAll'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = '';
  });
  setSt('draw', 'Back to drawing — click ⬡ 3D when ready!');
  document.getElementById('caption').textContent = 'editing ✏';
});