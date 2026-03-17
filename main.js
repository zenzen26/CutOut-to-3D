// ═══════════════════════════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════════════════════════
const DC   = document.getElementById('drawCanvas');
const CTX  = DC.getContext('2d');
const SC   = document.getElementById('stampCursor');
const SCTX = SC.getContext('2d');

function sizeCanvas() {
  const w = document.getElementById('cwrap').clientWidth || 900;
  const h = Math.max(440, Math.round(window.innerHeight * 0.52));
  DC.width  = w; DC.height = h;
  DC.style.width  = w + 'px'; DC.style.height = h + 'px';
  SC.width  = w; SC.height = h;
  SC.style.width  = w + 'px'; SC.style.height = h + 'px';
}
sizeCanvas();
window.addEventListener('resize', sizeCanvas);

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
let inking      = false;
let penColor    = '#c0392b';
let penSize     = 4;
let hasStroke   = false;
let hasCut      = false;
let stabLevel   = 4;   // 0 = off, 1–16 = smoothing window
let stabPoints  = [];  // recent pointer positions for averaging
let lastDrawPt  = null;
let eraserMode  = false;
let eraserSize  = 16;

// stamp state
let svgImg      = null;
let svgName     = '';
let stampMode   = false;
let stampW      = 140;
let stampH      = 140;

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function dpos(e) {
  const r = DC.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (DC.width  / r.width),
    y: (e.clientY - r.top)  * (DC.height / r.height)
  };
}

function setSt(state, msg) {
  document.getElementById('sdot').className = 'sdot' + (state ? ' ' + state : '');
  document.getElementById('smsg').textContent = msg;
  const map = { '': 0, 'draw': 0, 'cut': 1, 'd3': 2, 'stamp': 0 };
  const active = map[state] ?? 0;
  ['p1','p2','p3'].forEach((id, i) =>
    document.getElementById(id).classList.toggle('on', i <= active && state !== '')
  );
  if (state === '' || state === 'draw' || state === 'stamp')
    document.getElementById('p1').classList.add('on');
}

// ═══════════════════════════════════════════════════════════════════
// STABILISER — weighted moving average on pointer path
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════════════════════════
function istart(e) {
  if (stampMode) { doStamp(dpos(e)); return; }
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
  if (!inking) return;
  const p = getSmoothedPoint(raw);
  CTX.lineTo(p.x, p.y); CTX.stroke();
  CTX.beginPath(); CTX.moveTo(p.x, p.y);
  lastDrawPt = p;
  if (!eraserMode && !hasStroke) {
    hasStroke = true;
    document.getElementById('btnCut').disabled = false;
    setSt('draw', 'Close your shape then click Cut Out ✂');
  }
}

function iend() {
  inking = false;
  stabPoints = [];
  lastDrawPt = null;
  CTX.globalCompositeOperation = 'source-over';
  if (!eraserMode) clearStampCursor();
}

DC.addEventListener('mousedown',  istart);
DC.addEventListener('mousemove',  imove);
DC.addEventListener('mouseup',    iend);
DC.addEventListener('mouseleave', () => { iend(); clearStampCursor(); });
DC.addEventListener('touchstart', e => { e.preventDefault(); istart(e.touches[0]); }, { passive: false });
DC.addEventListener('touchmove',  e => { e.preventDefault(); imove(e.touches[0]);  }, { passive: false });
DC.addEventListener('touchend',   iend);

// ═══════════════════════════════════════════════════════════════════
// TOOLBAR CONTROLS
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// UNIFIED MODE SWITCHER  (pen | eraser | stamp — only one at a time)
// ═══════════════════════════════════════════════════════════════════
// 'pen' | 'eraser' | 'stamp'
let activeMode = 'pen';

function setMode(mode) {
  // ── tear down current mode ──
  eraserMode = false;
  stampMode  = false;
  document.getElementById('btnEraser').classList.remove('on');
  clearStampCursor();
  SC.style.display = 'none';
  DC.style.cursor  = 'crosshair';
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
    // pen — status depends on canvas state
    if (hasCut) setSt('cut', 'Back to drawing.');
    else if (hasStroke) setSt('draw', 'Close your shape then click Cut Out ✂');
    else setSt('', 'Draw a closed outline, or upload an SVG stamp — then click Cut Out ✂');
  }
}

// Colour dots → switch to pen
document.querySelectorAll('.cdot').forEach(d => {
  d.addEventListener('click', () => {
    document.querySelectorAll('.cdot').forEach(x => x.classList.remove('on'));
    d.classList.add('on');
    penColor = d.dataset.c;
    setMode('pen');
  });
});

// Eraser button toggles between eraser and pen
document.getElementById('btnEraser').addEventListener('click', () => {
  setMode(activeMode === 'eraser' ? 'pen' : 'eraser');
});

// Circular preview cursor for eraser
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

document.getElementById('btnClear').addEventListener('click', () => {
  CTX.clearRect(0, 0, DC.width, DC.height);
  hasStroke = hasCut = false;
  document.getElementById('btnCut').disabled = true;
  document.getElementById('btn3d').disabled  = true;
  setSt('', 'Draw a closed outline, or upload an SVG stamp — then click Cut Out ✂');
  document.getElementById('caption').textContent = 'untitled clipping';
  DC._outside = null;
});

// ═══════════════════════════════════════════════════════════════════
// SVG STAMP
// ═══════════════════════════════════════════════════════════════════
let svgAlphaMask = null; // rasterised alpha mask of SVG at stampW × stampH

document.getElementById('btnSVG').addEventListener('click', () => {
  document.getElementById('svgFileIn').click();
});

document.getElementById('svgFileIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  svgName = f.name;
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
    if (ar >= 1) { stampW = 150; stampH = Math.round(150 / ar); }
    else         { stampH = 150; stampW = Math.round(150 * ar); }

    // Rasterise SVG into offscreen canvas to build the alpha mask
    const blob   = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url    = URL.createObjectURL(blob);
    const tmpImg = new Image();
    tmpImg.onload = () => {
      const off  = document.createElement('canvas');
      off.width  = stampW; off.height = stampH;
      const octx = off.getContext('2d');
      octx.drawImage(tmpImg, 0, 0, stampW, stampH);
      URL.revokeObjectURL(url);

      // Build alpha mask
      const px = octx.getImageData(0, 0, stampW, stampH).data;
      svgAlphaMask = new Uint8Array(stampW * stampH);
      for (let i = 0; i < stampW * stampH; i++)
        svgAlphaMask[i] = px[i * 4 + 3] > 20 ? 1 : 0;
      svgImg = tmpImg;

      // Enter stamp mode (also deactivates eraser / pen cursor)
      setMode('stamp');
      e.target.value = '';
    };
    tmpImg.onerror = () => alert('Could not load SVG. Ensure it is a valid .svg file.');
    tmpImg.src = url;
  };
  reader.readAsText(f);
});

document.getElementById('stampClear').addEventListener('click', clearStamp);

function clearStamp() {
  svgImg = null; svgAlphaMask = null; svgName = '';
  document.getElementById('stampBadge').classList.remove('on');
  setMode('pen');
}

// Ghost preview of stamp outline on the cursor overlay canvas
function drawStampCursor(p) {
  SCTX.clearRect(0, 0, SC.width, SC.height);
  if (!svgAlphaMask) return;
  const ox = Math.round(p.x) - Math.floor(stampW / 2);
  const oy = Math.round(p.y) - Math.floor(stampH / 2);

  // Ghost fill at low opacity
  SCTX.save();
  SCTX.globalAlpha = 0.35;
  SCTX.fillStyle   = penColor;
  for (let y = 0; y < stampH; y++) {
    for (let x = 0; x < stampW; x++) {
      if (svgAlphaMask[y * stampW + x]) SCTX.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  SCTX.restore();

  // Outline border pixels at full opacity
  SCTX.save();
  SCTX.fillStyle   = penColor;
  SCTX.globalAlpha = 0.85;
  for (let y = 0; y < stampH; y++) {
    for (let x = 0; x < stampW; x++) {
      if (!svgAlphaMask[y * stampW + x]) continue;
      if (
        x === 0 || x === stampW - 1 || y === 0 || y === stampH - 1 ||
        !svgAlphaMask[y * stampW + (x - 1)] || !svgAlphaMask[y * stampW + (x + 1)] ||
        !svgAlphaMask[(y - 1) * stampW + x] || !svgAlphaMask[(y + 1) * stampW + x]
      ) {
        SCTX.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  SCTX.restore();
}

function clearStampCursor() {
  SCTX.clearRect(0, 0, SC.width, SC.height);
}

// Stamp the SVG outline (border pixels only) onto the draw canvas in pen colour
function doStamp(p) {
  if (!svgAlphaMask) return;
  const ox   = Math.round(p.x) - Math.floor(stampW / 2);
  const oy   = Math.round(p.y) - Math.floor(stampH / 2);
  const half = Math.max(1, Math.ceil(penSize / 2));

  CTX.save();
  CTX.fillStyle = penColor;
  for (let y = 0; y < stampH; y++) {
    for (let x = 0; x < stampW; x++) {
      if (!svgAlphaMask[y * stampW + x]) continue;
      const isBorder = (
        x === 0 || x === stampW - 1 || y === 0 || y === stampH - 1 ||
        !svgAlphaMask[y * stampW + (x - 1)] || !svgAlphaMask[y * stampW + (x + 1)] ||
        !svgAlphaMask[(y - 1) * stampW + x] || !svgAlphaMask[(y + 1) * stampW + x]
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

  hasStroke = true;
  document.getElementById('btnCut').disabled = false;
  setSt('stamp', 'Stamped! Click again to add more, or click Cut Out ✂');
  document.getElementById('caption').textContent = 'stamped 🍪';
}

// ═══════════════════════════════════════════════════════════════════
// CUT OUT
// ═══════════════════════════════════════════════════════════════════
document.getElementById('btnCut').addEventListener('click', doCut);

function doCut() {
  const W   = DC.width, H = DC.height;
  const raw = CTX.getImageData(0, 0, W, H).data;

  // 1. Mark stroke pixels
  const stroke = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (raw[i * 4 + 3] > 30) stroke[i] = 1;

  // 2. Flood-fill outside from all edges
  const outside = new Uint8Array(W * H);
  const Q = [];
  function seed(x, y) {
    const i = y * W + x;
    if (!stroke[i] && !outside[i]) { outside[i] = 1; Q.push(i); }
  }
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { seed(0, y); seed(W - 1, y); }
  let qi = 0;
  while (qi < Q.length) {
    const i = Q[qi++];
    const x = i % W, y = (i / W) | 0;
    if (x > 0   && !outside[i - 1] && !stroke[i - 1]) { outside[i - 1] = 1; Q.push(i - 1); }
    if (x < W-1 && !outside[i + 1] && !stroke[i + 1]) { outside[i + 1] = 1; Q.push(i + 1); }
    if (y > 0   && !outside[i - W] && !stroke[i - W]) { outside[i - W] = 1; Q.push(i - W); }
    if (y < H-1 && !outside[i + W] && !stroke[i + W]) { outside[i + W] = 1; Q.push(i + W); }
  }

  // 3. Canvas display (checkerboard outside, graph paper inside)
  const disp = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      if (stroke[i]) {
        disp[p] = raw[p]; disp[p+1] = raw[p+1]; disp[p+2] = raw[p+2]; disp[p+3] = raw[p+3];
      } else if (outside[i]) {
        const c = ((x >> 4) + (y >> 4)) & 1;
        disp[p] = c ? 212 : 192; disp[p+1] = c ? 205 : 186; disp[p+2] = c ? 192 : 174; disp[p+3] = 255;
      } else {
        if (x % 26 === 0 || y % 26 === 0) {
          disp[p] = 90; disp[p+1] = 130; disp[p+2] = 195; disp[p+3] = 44;
        } else {
          disp[p] = 250; disp[p+1] = 248; disp[p+2] = 242; disp[p+3] = 255;
        }
      }
    }
  }
  CTX.putImageData(new ImageData(disp, W, H), 0, 0);

  // 4. 3D texture: outside = alpha 0
  const tex3d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      if (outside[i]) {
        tex3d[p] = 0; tex3d[p+1] = 0; tex3d[p+2] = 0; tex3d[p+3] = 0;
      } else if (stroke[i]) {
        tex3d[p] = raw[p]; tex3d[p+1] = raw[p+1]; tex3d[p+2] = raw[p+2]; tex3d[p+3] = 255;
      } else {
        if (x % 26 === 0 || y % 26 === 0) {
          tex3d[p] = 90; tex3d[p+1] = 130; tex3d[p+2] = 195; tex3d[p+3] = 255;
        } else {
          tex3d[p] = 250; tex3d[p+1] = 248; tex3d[p+2] = 242; tex3d[p+3] = 255;
        }
      }
    }
  }

  DC._outside = outside; DC._stroke = stroke;
  DC._W = W; DC._H = H; DC._dispImg = disp; DC._texImg = tex3d;

  hasCut = true;
  document.getElementById('btn3d').disabled = false;
  setSt('cut', '✂ Clean cut! Click View 3D to see your cutout in 3D space.');
  document.getElementById('caption').textContent = 'cut & ready ✂';

  if (stampMode) clearStamp();
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 3D
// ═══════════════════════════════════════════════════════════════════
let renderer3 = null, afId = null, _geo = null;

document.getElementById('btn3d').addEventListener('click', () => {
  document.getElementById('v3d').classList.add('on');
  setSt('d3', '3D — drag to rotate · scroll to zoom · right-drag to pan');
  document.getElementById('caption').textContent = '3D float ✦';
  requestAnimationFrame(() => requestAnimationFrame(init3D));
});

document.getElementById('btnBack').addEventListener('click', () => {
  document.getElementById('v3d').classList.remove('on');
  destroy3D();
  setSt('cut', 'Back to canvas.');
  document.getElementById('caption').textContent = 'cut & ready ✂';
});

function destroy3D() {
  if (afId) { cancelAnimationFrame(afId); afId = null; }
  if (renderer3) { renderer3.dispose(); renderer3 = null; }
  _geo = null;
}

function init3D() {
  destroy3D();
  const stack = document.getElementById('vstack');
  const rect  = stack.getBoundingClientRect();
  const W3    = Math.round(rect.width)  || 860;
  const H3    = Math.round(rect.height) || 440;
  const tcan  = document.getElementById('tc');
  tcan.width = W3; tcan.height = H3;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1510);

  scene.add(new THREE.AmbientLight(0xfff5e0, 0.55));
  const kl = new THREE.DirectionalLight(0xfffaf0, 1.1); kl.position.set(4, 6, 6); scene.add(kl);
  const rl = new THREE.DirectionalLight(0x8090c0, 0.3); rl.position.set(-5, -3, -5); scene.add(rl);
  const fl = new THREE.DirectionalLight(0xffe8c0, 0.2); fl.position.set(0, -4, 3); scene.add(fl);

  const cam = new THREE.PerspectiveCamera(42, W3 / H3, 0.01, 200);
  cam.position.set(0, 0, 4.5);

  renderer3 = new THREE.WebGLRenderer({ canvas: tcan, antialias: true, alpha: false });
  renderer3.setSize(W3, H3);
  renderer3.setPixelRatio(Math.min(devicePixelRatio, 2));

  // ── Geometry ──
  const outside = DC._outside, MW = DC._W, MH = DC._H, img = DC._texImg;
  let x0 = MW, x1 = 0, y0 = MH, y1 = 0;
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++)
      if (!outside[y * MW + x]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1, asp = sw / sh;
  const scH = 2.6, scW = scH * asp;
  const step = Math.max(1, Math.floor(Math.min(sw, sh) / 140));
  const cw = scW / (sw / step), ch = scH / (sh / step);
  const vp = [], vu = [], vi = [];
  let idx = 0;
  for (let py = 0; py < sh - step; py += step) {
    for (let px = 0; px < sw - step; px += step) {
      let hit = false;
      done:
      for (let dy = 0; dy <= step; dy++) {
        for (let dx = 0; dx <= step; dx++) {
          const sx = x0 + px + dx, sy = y0 + py + dy;
          if (sx < MW && sy < MH && !outside[sy * MW + sx]) { hit = true; break done; }
        }
      }
      if (!hit) continue;
      const bx = (px / sw) * scW - scW / 2, by = -(py / sh) * scH + scH / 2;
      const u0 = (x0 + px) / MW, v0 = 1 - (y0 + py) / MH;
      const u1 = (x0 + px + step) / MW, v1 = 1 - (y0 + py + step) / MH;
      vp.push(bx, by, 0, bx + cw, by, 0, bx + cw, by - ch, 0, bx, by - ch, 0);
      vu.push(u0, v0, u1, v0, u1, v1, u0, v1);
      vi.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
      idx += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(vu, 2));
  geo.setIndex(vi);
  geo.computeVertexNormals();
  _geo = geo;

  // ── Front texture ──
  const tc2 = document.createElement('canvas');
  tc2.width = MW; tc2.height = MH;
  tc2.getContext('2d').putImageData(new ImageData(img, MW, MH), 0, 0);
  const tex = new THREE.CanvasTexture(tc2);
  tex.premultiplyAlpha = false;

  // ── Back texture: graph paper + mirrored bleed-through ──
  const bc  = document.createElement('canvas');
  bc.width  = MW; bc.height = MH;
  const bx2 = bc.getContext('2d');
  bx2.fillStyle = '#faf8f2'; bx2.fillRect(0, 0, MW, MH);
  bx2.strokeStyle = 'rgba(90,130,195,0.18)'; bx2.lineWidth = 1;
  for (let gx = 0; gx < MW; gx += 26) { bx2.beginPath(); bx2.moveTo(gx, 0); bx2.lineTo(gx, MH); bx2.stroke(); }
  for (let gy = 0; gy < MH; gy += 26) { bx2.beginPath(); bx2.moveTo(0, gy); bx2.lineTo(MW, gy); bx2.stroke(); }
  bx2.save(); bx2.globalAlpha = 0.18; bx2.drawImage(tc2, 0, 0); bx2.restore();
  const bRaw = bx2.getImageData(0, 0, MW, MH);
  const bd   = bRaw.data;
  for (let i = 0; i < MW * MH; i++) if (outside[i]) bd[i * 4 + 3] = 0;
  bx2.putImageData(bRaw, 0, 0);
  const texBack = new THREE.CanvasTexture(bc);
  texBack.premultiplyAlpha = false;

  // ── Materials & Meshes ──
  const frontMat = new THREE.MeshLambertMaterial({ map: tex,     side: THREE.FrontSide, transparent: false, alphaTest: 0.5 });
  const backMat  = new THREE.MeshLambertMaterial({ map: texBack, side: THREE.FrontSide, transparent: false, alphaTest: 0.5 });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, frontMat));
  const bm = new THREE.Mesh(geo.clone(), backMat);
  bm.scale.z = -1; bm.position.z = -0.014;
  grp.add(bm);

  // shadow plane
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(scW * 1.5, scH * 1.5),
    new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .15, depthWrite: false })
  );
  shadow.position.set(0.12, -0.16, -1.2);
  scene.add(shadow, grp);

  // ── Orbit controls ──
  let drag = false, rdrag = false, lx = 0, ly = 0;
  let rotX = 0.15, rotY = 0.3, zoom = 4.5, panX = 0, panY = 0;

  tcan.addEventListener('mousedown', e => {
    drag = true; rdrag = e.button === 2;
    lx = e.clientX; ly = e.clientY;
    e.preventDefault();
  });
  tcan.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (rdrag) { panX += dx * .004; panY -= dy * .004; }
    else       { rotY += dx * .007; rotX += dy * .007; }
  });
  window.addEventListener('mouseup', () => drag = false);
  tcan.addEventListener('wheel', e => {
    zoom += e.deltaY * .003;
    zoom  = Math.max(1.2, Math.min(12, zoom));
    e.preventDefault();
  }, { passive: false });

  let ltd = 0;
  tcan.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { drag = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
    else ltd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    e.preventDefault();
  }, { passive: false });
  tcan.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && drag) {
      const dx = e.touches[0].clientX - lx, dy = e.touches[0].clientY - ly;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY;
      rotY += dx * .008; rotX += dy * .008;
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoom -= (d - ltd) * .012;
      zoom  = Math.max(1.2, Math.min(12, zoom));
      ltd = d;
    }
    e.preventDefault();
  }, { passive: false });
  tcan.addEventListener('touchend', () => drag = false);

  (function loop() {
    if (!renderer3) return;
    afId = requestAnimationFrame(loop);
    grp.rotation.x = rotX; grp.rotation.y = rotY;
    shadow.rotation.y = rotY * .15;
    cam.position.set(panX, panY, zoom); cam.lookAt(panX, panY, 0);
    renderer3.render(scene, cam);
  })();
}

// ═══════════════════════════════════════════════════════════════════
// GLB EXPORT
// ═══════════════════════════════════════════════════════════════════
document.getElementById('btnGLB').addEventListener('click', exportGLB);

function exportGLB() {
  if (!DC._outside) { alert('Cut out a shape first.'); return; }
  const btn = document.getElementById('btnGLB');
  btn.textContent = '⏳ Exporting…'; btn.disabled = true;
  try {
    const outside = DC._outside, MW = DC._W, MH = DC._H, img = DC._texImg;
    let x0 = MW, x1 = 0, y0 = MH, y1 = 0;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++)
        if (!outside[y * MW + x]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1, asp = sw / sh;
    const scH = 2.6, scW = scH * asp;
    const step = Math.max(1, Math.floor(Math.min(sw, sh) / 140));
    const cw = scW / (sw / step), ch = scH / (sh / step);
    const positions = [], uvs = [], indices = [];
    let idx = 0;
    for (let py = 0; py < sh - step; py += step) {
      for (let px = 0; px < sw - step; px += step) {
        let hit = false;
        done2:
        for (let dy = 0; dy <= step; dy++) {
          for (let dx2 = 0; dx2 <= step; dx2++) {
            const sx = x0 + px + dx2, sy = y0 + py + dy;
            if (sx < MW && sy < MH && !outside[sy * MW + sx]) { hit = true; break done2; }
          }
        }
        if (!hit) continue;
        const bx = (px / sw) * scW - scW / 2, by = -(py / sh) * scH + scH / 2;
        const u0 = (x0 + px) / MW, v0 = 1 - (y0 + py) / MH;
        const u1 = (x0 + px + step) / MW, v1 = 1 - (y0 + py + step) / MH;
        positions.push(bx, by, 0, bx + cw, by, 0, bx + cw, by - ch, 0, bx, by - ch, 0);
        uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
        indices.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
        idx += 4;
      }
    }
    const posArr = new Float32Array(positions);
    const uvArr  = new Float32Array(uvs);
    const idxArr = new Uint32Array(indices);
    const tc3    = document.createElement('canvas');
    tc3.width = MW; tc3.height = MH;
    tc3.getContext('2d').putImageData(new ImageData(img, MW, MH), 0, 0);
    const pngB64  = tc3.toDataURL('image/png').split(',')[1];
    const pngBytes = base64ToBytes(pngB64);

    function pad4(ab)    { const p = (4 - ab.byteLength % 4) % 4; if (!p) return ab; const o = new Uint8Array(ab.byteLength + p); o.set(new Uint8Array(ab)); return o.buffer; }
    function pad4raw(b)  { const p = (4 - b.byteLength  % 4) % 4; if (!p) return b.buffer; const o = new Uint8Array(b.byteLength  + p); o.set(b); return o.buffer; }

    const posBuf = pad4(posArr.buffer), uvBuf = pad4(uvArr.buffer);
    const idxBuf = pad4(idxArr.buffer), pngBuf = pad4raw(pngBytes);
    let off = 0;
    const posOff = off; off += posBuf.byteLength;
    const uvOff  = off; off += uvBuf.byteLength;
    const idxOff = off; off += idxBuf.byteLength;
    const pngOff = off; off += pngBuf.byteLength;
    const totalBin = off;

    let minX = Infinity, minY = Infinity, minZ = 0, maxX = -Infinity, maxY = -Infinity, maxZ = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i]   < minX) minX = positions[i];   if (positions[i]   > maxX) maxX = positions[i];
      if (positions[i+1] < minY) minY = positions[i+1]; if (positions[i+1] > maxY) maxY = positions[i+1];
    }

    const gltf = {
      asset: { version: '2.0', generator: 'Cut Out Studio' },
      scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'cutout' }],
      meshes: [{ name: 'cutout', primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
      materials: [{ name: 'paper', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true, alphaMode: 'MASK', alphaCutoff: 0.5 }],
      textures: [{ source: 0, sampler: 0 }],
      images:   [{ bufferView: 3, mimeType: 'image/png' }],
      samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        { bufferView: 1, componentType: 5126, count: uvs.length / 2,       type: 'VEC2' },
        { bufferView: 2, componentType: 5125, count: indices.length,        type: 'SCALAR' }
      ],
      bufferViews: [
        { buffer: 0, byteOffset: posOff, byteLength: posArr.byteLength, target: 34962 },
        { buffer: 0, byteOffset: uvOff,  byteLength: uvArr.byteLength,  target: 34962 },
        { buffer: 0, byteOffset: idxOff, byteLength: idxArr.byteLength, target: 34963 },
        { buffer: 0, byteOffset: pngOff, byteLength: pngBytes.byteLength }
      ],
      buffers: [{ byteLength: totalBin }]
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPad   = (4 - jsonBytes.length % 4) % 4;
    const jsonLen   = jsonBytes.length + jsonPad;
    const totalLen  = 12 + 8 + jsonLen + 8 + totalBin;
    const glb = new ArrayBuffer(totalLen);
    const dv  = new DataView(glb);
    let o = 0;
    dv.setUint32(o, 0x46546C67, true); o += 4;
    dv.setUint32(o, 2,          true); o += 4;
    dv.setUint32(o, totalLen,   true); o += 4;
    dv.setUint32(o, jsonLen,    true); o += 4;
    dv.setUint32(o, 0x4E4F534A, true); o += 4;
    jsonBytes.forEach(b => dv.setUint8(o++, b));
    for (let i = 0; i < jsonPad; i++) dv.setUint8(o++, 0x20);
    dv.setUint32(o, totalBin,   true); o += 4;
    dv.setUint32(o, 0x004E4942, true); o += 4;
    const binOut = new Uint8Array(glb, o);
    binOut.set(new Uint8Array(posBuf), posOff);
    binOut.set(new Uint8Array(uvBuf),  uvOff);
    binOut.set(new Uint8Array(idxBuf), idxOff);
    binOut.set(new Uint8Array(pngBuf), pngOff);

    const blob = new Blob([glb], { type: 'model/gltf-binary' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'cutout.glb'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    btn.textContent = '✓ Exported!';
    setTimeout(() => { btn.textContent = '⬇ Export GLB'; btn.disabled = false; }, 2000);
  } catch (err) {
    console.error(err);
    alert('Export failed: ' + err.message);
    btn.textContent = '⬇ Export GLB'; btn.disabled = false;
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const b   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

// ── Boot ──
setSt('', '');