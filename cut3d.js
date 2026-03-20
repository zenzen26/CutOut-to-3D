// ═══════════════════════════════════════════════════════════════════
// CUT3D — flood-fill cut, Three.js 3D view, GLB export
// ═══════════════════════════════════════════════════════════════════
import { DC, CTX } from './canvas.js';
import { setSt, setHasCut } from './draw.js';
import { clearStamp }       from './stamp.js';

const sideTextureOverlay = new Image();
let sideTextureOverlayReady = false;
const SIDE_TEXTURE_MULTIPLY_ALPHA = 1.8;
const SIDE_TEXTURE_SOFT_LIGHT_ALPHA = 0.5;
sideTextureOverlay.src = './cardboard-texture.jpg';
sideTextureOverlay.addEventListener('load', () => {
  sideTextureOverlayReady = true;
  const v3d = document.getElementById('v3d');
  if (v3d && v3d.classList.contains('on') && DC._outside) {
    requestAnimationFrame(() => requestAnimationFrame(init3D));
  }
});

// ── Cut Out ────────────────────────────────────────────────────────
export function doCut() {
  const W = DC.width, H = DC.height;
  DC._rawDrawing = CTX.getImageData(0, 0, W, H);
  const raw = DC._rawDrawing.data;

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

  setHasCut(true);
  document.getElementById('btnEdit').style.display = '';

  // clearStamp if stamp was active (imported from stamp.js — no circular issue
  // because stamp.js does not import doCut)
  // stamp state is checked via DC flags; clearStamp is safe to call always
}

function computeBounds(outside, w, h) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!outside[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error('No cut geometry found.');
  return { x0, x1, y0, y1 };
}

function buildGeometryData(outside, MW, MH) {
  const { x0, x1, y0, y1 } = computeBounds(outside, MW, MH);
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;
  const asp = sw / sh;
  const scH = 2.6;
  const scW = scH * asp;
  const step = Math.max(1, Math.floor(Math.min(sw, sh) / 140));
  const cw = scW / (sw / step);
  const ch = scH / (sh / step);

  const cells = [];
  let gy = 0;

  for (let py = 0; py < sh - step; py += step) {
    let gx = 0;
    for (let px = 0; px < sw - step; px += step) {
      let hit = false;
      scan:
      for (let dy = 0; dy <= step; dy++) {
        for (let dx = 0; dx <= step; dx++) {
          const sx = x0 + px + dx;
          const sy = y0 + py + dy;
          if (sx < MW && sy < MH && !outside[sy * MW + sx]) {
            hit = true;
            break scan;
          }
        }
      }
      if (hit) {
        const bx = (px / sw) * scW - scW / 2;
        const by = -(py / sh) * scH + scH / 2;
        const u0 = (x0 + px) / MW;
        const v0 = 1 - (y0 + py) / MH;
        const u1 = (x0 + px + step) / MW;
        const v1 = 1 - (y0 + py + step) / MH;
        cells.push({ gx, gy, bx, by, u0, v0, u1, v1 });
      }
      gx++;
    }
    gy++;
  }

  return { cells, scW, scH, cw, ch };
}

function buildFrontTextureCanvas(img, MW, MH) {
  const front = document.createElement('canvas');
  front.width = MW;
  front.height = MH;
  front.getContext('2d').putImageData(new ImageData(img, MW, MH), 0, 0);
  return front;
}

function buildBackTextureCanvas(frontCanvas, outside, MW, MH) {
  const back = document.createElement('canvas');
  back.width = MW;
  back.height = MH;
  const bx2 = back.getContext('2d');

  bx2.fillStyle = '#faf8f2';
  bx2.fillRect(0, 0, MW, MH);
  bx2.strokeStyle = 'rgba(90,130,195,0.18)';
  bx2.lineWidth = 1;
  for (let gx = 0; gx < MW; gx += 26) {
    bx2.beginPath();
    bx2.moveTo(gx, 0);
    bx2.lineTo(gx, MH);
    bx2.stroke();
  }
  for (let gy = 0; gy < MH; gy += 26) {
    bx2.beginPath();
    bx2.moveTo(0, gy);
    bx2.lineTo(MW, gy);
    bx2.stroke();
  }

  bx2.save();
  bx2.globalAlpha = 0.18;
  bx2.drawImage(frontCanvas, 0, 0);
  bx2.restore();

  const bRaw = bx2.getImageData(0, 0, MW, MH);
  const bd = bRaw.data;
  for (let i = 0; i < MW * MH; i++) {
    if (outside[i]) bd[i * 4 + 3] = 0;
  }
  bx2.putImageData(bRaw, 0, 0);
  return back;
}

function buildTextureCanvases(outside, MW, MH, img) {
  const frontCanvas = buildFrontTextureCanvas(img, MW, MH);
  const backCanvas = buildBackTextureCanvas(frontCanvas, outside, MW, MH);
  return { frontCanvas, backCanvas };
}

function getDepthValue() {
  const input = document.getElementById('depth3d');
  return input ? +input.value : 0;
}

function updateDepthLabel() {
  const input = document.getElementById('depth3d');
  const out = document.getElementById('depth3dVal');
  if (!input || !out) return;
  out.textContent = String(+input.value);
}

function buildPlaneGeometry(cells, cellW, cellH, z, reverse = false) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let idx = 0;

  for (const cell of cells) {
    const { bx, by, u0, v0, u1, v1 } = cell;
    positions.push(
      bx, by, z,
      bx + cellW, by, z,
      bx + cellW, by - cellH, z,
      bx, by - cellH, z
    );
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    if (reverse) {
      indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
    } else {
      indices.push(idx, idx + 2, idx + 1, idx, idx + 3, idx + 2);
    }
    idx += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildCardboardSideTexture() {
  const w = 320;
  const h = 120;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#7a4d2b';
  ctx.fillRect(0, 0, w, h);

  const liner = 8;
  const innerTop = liner;
  const innerBottom = h - liner;
  const fluteThickness = 15;
  const mid = h / 2;
  const amp = (innerBottom - innerTop - fluteThickness) / 2;
  const period = 65;
  const fluteColor = '#d1a779';

  // Front/back liner edges.
  ctx.fillStyle = '#d1a779';
  ctx.fillRect(0, 0, w, liner);
  ctx.fillRect(0, h - liner, w, liner);
  ctx.fillStyle = fluteColor;
  ctx.fillRect(0, 0, w, 4);
  ctx.fillRect(0, liner - 4, w, 4);
  ctx.fillRect(0, h - liner, w, 4);
  ctx.fillRect(0, h - 4, w, 4);

  // Dark cavity tone behind the flute.
  ctx.fillStyle = '#2e2117';
  ctx.fillRect(0, liner, w, h - liner * 2);

  // Subtle kraft fibres.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(74, 43, 21, 0.22)';
  for (let y = 8; y < h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Corrugated medium: a single solid ribbon whose outer edge touches the liners.
  const halfFlute = fluteThickness / 2;
  const topPath = [];
  const bottomPath = [];
  for (let x = -period; x <= w + period; x += 1) {
    const y = mid + Math.sin((x / period) * Math.PI * 2) * amp;
    topPath.push([x, y - halfFlute]);
    bottomPath.push([x, y + halfFlute]);
  }

  ctx.fillStyle = fluteColor;
  ctx.beginPath();
  ctx.moveTo(topPath[0][0], topPath[0][1]);
  for (const p of topPath) ctx.lineTo(p[0], p[1]);
  for (let i = bottomPath.length - 1; i >= 0; i--) ctx.lineTo(bottomPath[i][0], bottomPath[i][1]);
  ctx.closePath();
  ctx.fill();

  if (sideTextureOverlayReady) {
    const pattern = ctx.createPattern(sideTextureOverlay, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = SIDE_TEXTURE_MULTIPLY_ALPHA;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = SIDE_TEXTURE_SOFT_LIGHT_ALPHA;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return c;
}

function addSideQuad(positions, uvs, indices, verts, uvRect, idx) {
  positions.push(
    verts[0][0], verts[0][1], verts[0][2],
    verts[1][0], verts[1][1], verts[1][2],
    verts[2][0], verts[2][1], verts[2][2],
    verts[3][0], verts[3][1], verts[3][2]
  );
  uvs.push(
    uvRect[0], uvRect[1],
    uvRect[2], uvRect[1],
    uvRect[2], uvRect[3],
    uvRect[0], uvRect[3]
  );
  indices.push(idx, idx + 2, idx + 1, idx, idx + 3, idx + 2);
}

function buildSideGeometry(cells, cellW, cellH, halfDepth) {
  if (halfDepth <= 0) return null;

  const occupied = new Set(cells.map(cell => `${cell.gx},${cell.gy}`));
  const positions = [];
  const uvs = [];
  const indices = [];
  let idx = 0;
  const pitch = Math.max(Math.max(cellW, cellH) * 18, 0.75);

  for (const cell of cells) {
    const { gx, gy, bx, by } = cell;
    const x0 = bx;
    const x1 = bx + cellW;
    const y0 = by;
    const y1 = by - cellH;
    const zf = halfDepth;
    const zb = -halfDepth;

    if (!occupied.has(`${gx},${gy - 1}`)) {
      const u0 = x0 / pitch;
      const u1 = x1 / pitch;
      addSideQuad(positions, uvs, indices, [
        [x0, y0, zf],
        [x1, y0, zf],
        [x1, y0, zb],
        [x0, y0, zb]
      ], [u0, 0, u1, 1], idx);
      idx += 4;
    }
    if (!occupied.has(`${gx + 1},${gy}`)) {
      const u0 = (-y0) / pitch;
      const u1 = (-y1) / pitch;
      addSideQuad(positions, uvs, indices, [
        [x1, y0, zf],
        [x1, y1, zf],
        [x1, y1, zb],
        [x1, y0, zb]
      ], [u0, 0, u1, 1], idx);
      idx += 4;
    }
    if (!occupied.has(`${gx},${gy + 1}`)) {
      const u0 = x1 / pitch;
      const u1 = x0 / pitch;
      addSideQuad(positions, uvs, indices, [
        [x1, y1, zf],
        [x0, y1, zf],
        [x0, y1, zb],
        [x1, y1, zb]
      ], [u0, 0, u1, 1], idx);
      idx += 4;
    }
    if (!occupied.has(`${gx - 1},${gy}`)) {
      const u0 = (-y1) / pitch;
      const u1 = (-y0) / pitch;
      addSideQuad(positions, uvs, indices, [
        [x0, y1, zf],
        [x0, y0, zf],
        [x0, y0, zb],
        [x0, y1, zb]
      ], [u0, 0, u1, 1], idx);
      idx += 4;
    }
  }

  if (!positions.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildCutoutGroup(outside, MW, MH, img, opts = {}) {
  const { forExport = false } = opts;
  const { cells, scW, scH, cw, ch } = buildGeometryData(outside, MW, MH);
  const depthValue = getDepthValue();
  const halfDepth = (scH * depthValue) / 200;

  const geoFront = buildPlaneGeometry(cells, cw, ch, halfDepth, false);
  const geoBack = buildPlaneGeometry(cells, cw, ch, -halfDepth, true);
  const geoSides = buildSideGeometry(cells, cw, ch, halfDepth);

  const { frontCanvas, backCanvas } = buildTextureCanvases(outside, MW, MH, img);

  const texFront = new THREE.CanvasTexture(frontCanvas);
  texFront.premultiplyAlpha = false;
  const texBack = new THREE.CanvasTexture(backCanvas);
  texBack.premultiplyAlpha = false;
  const texSide = new THREE.CanvasTexture(buildCardboardSideTexture());
  texSide.wrapS = THREE.RepeatWrapping;
  texSide.wrapT = THREE.ClampToEdgeWrapping;
  texSide.magFilter = THREE.LinearFilter;
  texSide.minFilter = THREE.LinearFilter;
  texSide.premultiplyAlpha = false;

  let frontMat;
  let backMat;
  let sideMat;
  if (forExport) {
    frontMat = new THREE.MeshStandardMaterial({
      map: texFront,
      side: THREE.FrontSide,
      alphaTest: 0.5,
      roughness: 0.9,
      metalness: 0
    });
    backMat = new THREE.MeshStandardMaterial({
      map: texBack,
      side: THREE.FrontSide,
      alphaTest: 0.5,
      roughness: 0.95,
      metalness: 0
    });
    sideMat = new THREE.MeshStandardMaterial({
      map: texSide,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0
    });
  } else {
    frontMat = new THREE.MeshLambertMaterial({
      map: texFront,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: 0.5
    });
    backMat = new THREE.MeshLambertMaterial({
      map: texBack,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: 0.5
    });
    sideMat = new THREE.MeshLambertMaterial({
      map: texSide,
      side: THREE.DoubleSide
    });
  }

  const frontMesh = new THREE.Mesh(geoFront, frontMat);
  const backMesh = new THREE.Mesh(geoBack, backMat);
  const grp = new THREE.Group();
  grp.name = 'cutout';
  frontMesh.name = 'cutout_front';
  backMesh.name = 'cutout_back';
  grp.add(frontMesh, backMesh);
  if (geoSides) {
    const sideMesh = new THREE.Mesh(geoSides, sideMat);
    sideMesh.name = 'cutout_sides';
    grp.add(sideMesh);
  }

  return {
    grp,
    scW,
    scH,
    resources: [geoFront, geoBack, geoSides, texFront, texBack, texSide, frontMat, backMat, sideMat]
  };
}

function disposeResources(resources) {
  for (const r of resources) {
    if (r && typeof r.dispose === 'function') r.dispose();
  }
}

// ── Three.js 3D View ───────────────────────────────────────────────
let renderer3 = null, afId = null, _geo = null;
let previewResources = [];
let previewCanvas = null;
let moveHandler3 = null;
let upHandler3 = null;
let wheelHandler3 = null;
let downHandler3 = null;
let contextMenuHandler3 = null;
let touchStartHandler3 = null;
let touchMoveHandler3 = null;
let touchEndHandler3 = null;

export function destroy3D() {
  if (afId)     { cancelAnimationFrame(afId); afId = null; }
  if (previewCanvas) {
    if (downHandler3) previewCanvas.removeEventListener('mousedown', downHandler3);
    if (contextMenuHandler3) previewCanvas.removeEventListener('contextmenu', contextMenuHandler3);
    if (wheelHandler3) previewCanvas.removeEventListener('wheel', wheelHandler3);
    if (touchStartHandler3) previewCanvas.removeEventListener('touchstart', touchStartHandler3);
    if (touchMoveHandler3) previewCanvas.removeEventListener('touchmove', touchMoveHandler3);
    if (touchEndHandler3) previewCanvas.removeEventListener('touchend', touchEndHandler3);
  }
  if (moveHandler3) window.removeEventListener('mousemove', moveHandler3);
  if (upHandler3) window.removeEventListener('mouseup', upHandler3);
  if (renderer3) { renderer3.dispose(); renderer3 = null; }
  disposeResources(previewResources);
  previewResources = [];
  previewCanvas = null;
  moveHandler3 = null;
  upHandler3 = null;
  wheelHandler3 = null;
  downHandler3 = null;
  contextMenuHandler3 = null;
  touchStartHandler3 = null;
  touchMoveHandler3 = null;
  touchEndHandler3 = null;
  _geo = null;
}

export function init3D() {
  destroy3D();
  const stack = document.getElementById('vstack');
  const rect  = stack.getBoundingClientRect();
  const W3    = Math.round(rect.width)  || 860;
  const H3    = Math.round(rect.height) || 440;
  const tcan  = document.getElementById('tc');
  previewCanvas = tcan;
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

  // ── Geometry + textures + materials ──
  const outside = DC._outside, MW = DC._W, MH = DC._H, img = DC._texImg;
  const { grp, scW, scH, resources } = buildCutoutGroup(outside, MW, MH, img);
  previewResources = resources;
  _geo = grp.children[0].geometry;

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

  downHandler3 = e => {
    drag = true; rdrag = e.button === 2;
    lx = e.clientX; ly = e.clientY;
    e.preventDefault();
  };
  contextMenuHandler3 = e => e.preventDefault();
  moveHandler3 = e => {
    if (!drag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (rdrag) { panX += dx * .004; panY -= dy * .004; }
    else       { rotY += dx * .007; rotX += dy * .007; }
  };
  upHandler3 = () => { drag = false; };
  wheelHandler3 = e => {
    zoom += e.deltaY * .003;
    zoom  = Math.max(1.2, Math.min(12, zoom));
    e.preventDefault();
  };
  tcan.addEventListener('mousedown', downHandler3);
  tcan.addEventListener('contextmenu', contextMenuHandler3);
  window.addEventListener('mousemove', moveHandler3);
  window.addEventListener('mouseup', upHandler3);
  tcan.addEventListener('wheel', wheelHandler3, { passive: false });

  let ltd = 0;
  touchStartHandler3 = e => {
    if (e.touches.length === 1) { drag = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
    else ltd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    e.preventDefault();
  };
  touchMoveHandler3 = e => {
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
  };
  touchEndHandler3 = () => { drag = false; };
  tcan.addEventListener('touchstart', touchStartHandler3, { passive: false });
  tcan.addEventListener('touchmove', touchMoveHandler3, { passive: false });
  tcan.addEventListener('touchend', touchEndHandler3);

  (function loop() {
    if (!renderer3) return;
    afId = requestAnimationFrame(loop);
    grp.rotation.x = rotX; grp.rotation.y = rotY;
    shadow.rotation.y = rotY * .15;
    cam.position.set(panX, panY, zoom); cam.lookAt(panX, panY, 0);
    renderer3.render(scene, cam);
  })();
}

// ── GLB Export ─────────────────────────────────────────────────────
document.getElementById('btnGLB').addEventListener('click', exportGLB);

updateDepthLabel();
document.getElementById('depth3d').addEventListener('input', () => {
  updateDepthLabel();
  if (!document.getElementById('v3d').classList.contains('on')) return;
  if (!DC._outside) return;
  requestAnimationFrame(() => requestAnimationFrame(init3D));
});

export function exportGLB() {
  if (!DC._outside) { alert('Cut out a shape first.'); return; }
  if (!THREE.GLTFExporter) { alert('GLTFExporter is not loaded.'); return; }
  const btn = document.getElementById('btnGLB');
  btn.textContent = '⏳ Exporting…'; btn.disabled = true;
  const done = ok => {
    btn.textContent = ok ? '✓ Exported!' : '⬇ Export GLB';
    setTimeout(() => { btn.textContent = '⬇ Export GLB'; btn.disabled = false; }, ok ? 2000 : 0);
  };
  try {
    const outside = DC._outside, MW = DC._W, MH = DC._H, img = DC._texImg;
    const { grp, resources } = buildCutoutGroup(outside, MW, MH, img, { forExport: true });
    const exporter = new THREE.GLTFExporter();

    exporter.parse(
      grp,
      result => {
        try {
          if (!(result instanceof ArrayBuffer)) {
            throw new Error('GLTFExporter did not return GLB binary output.');
          }
          const blob = new Blob([result], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'cutout.glb';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          done(true);
        } catch (err) {
          console.error(err);
          alert('Export failed: ' + (err?.message || err));
          done(false);
        } finally {
          disposeResources(resources);
        }
      },
      { binary: true, onlyVisible: true, truncateDrawRange: false }
    );
  } catch (err) {
    console.error(err);
    alert('Export failed: ' + err.message);
    done(false);
  }
}
