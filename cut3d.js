// ═══════════════════════════════════════════════════════════════════
// CUT3D — flood-fill cut, Three.js 3D view, GLB export
// ═══════════════════════════════════════════════════════════════════
import { DC, CTX } from './canvas.js';
import { setSt, setHasCut } from './draw.js';
import { clearStamp }       from './stamp.js';

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

  const positions = [];
  const uvs = [];
  const indices = [];
  let idx = 0;

  for (let py = 0; py < sh - step; py += step) {
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
      if (!hit) continue;

      const bx = (px / sw) * scW - scW / 2;
      const by = -(py / sh) * scH + scH / 2;
      const u0 = (x0 + px) / MW;
      const v0 = 1 - (y0 + py) / MH;
      const u1 = (x0 + px + step) / MW;
      const v1 = 1 - (y0 + py + step) / MH;

      positions.push(
        bx, by, 0,
        bx + cw, by, 0,
        bx + cw, by - ch, 0,
        bx, by - ch, 0
      );
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(idx, idx + 2, idx + 1, idx, idx + 3, idx + 2);
      idx += 4;
    }
  }

  return { positions, uvs, indices, scW, scH };
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

function reverseTriangleIndices(indices) {
  const reversed = [];
  for (let i = 0; i < indices.length; i += 3) {
    reversed.push(indices[i], indices[i + 2], indices[i + 1]);
  }
  return reversed;
}

function buildCutoutGroup(outside, MW, MH, img, opts = {}) {
  const { forExport = false } = opts;
  const { positions, uvs, indices, scW, scH } = buildGeometryData(outside, MW, MH);
  const backIndices = reverseTriangleIndices(indices);

  const geoFront = new THREE.BufferGeometry();
  geoFront.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geoFront.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geoFront.setIndex(indices);
  geoFront.computeVertexNormals();

  const geoBack = new THREE.BufferGeometry();
  geoBack.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geoBack.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geoBack.setIndex(backIndices);
  geoBack.computeVertexNormals();

  const { frontCanvas, backCanvas } = buildTextureCanvases(outside, MW, MH, img);

  const texFront = new THREE.CanvasTexture(frontCanvas);
  texFront.premultiplyAlpha = false;
  const texBack = new THREE.CanvasTexture(backCanvas);
  texBack.premultiplyAlpha = false;

  let frontMat;
  let backMat;
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
  } else {
    frontMat = new THREE.MeshLambertMaterial({
      map: texFront,
      side: THREE.FrontSide,
      transparent: true,
      alphaTest: 0.5
    });
    backMat = new THREE.MeshLambertMaterial({
      map: texBack,
      side: THREE.BackSide,
      transparent: true,
      alphaTest: 0.5
    });
  }

  const frontMesh = new THREE.Mesh(geoFront, frontMat);
  const backMesh = new THREE.Mesh(forExport ? geoBack : geoFront.clone(), backMat);
  const grp = new THREE.Group();
  grp.name = 'cutout';
  frontMesh.name = 'cutout_front';
  backMesh.name = 'cutout_back';
  grp.add(frontMesh, backMesh);

  return {
    grp,
    scW,
    scH,
    resources: [geoFront, geoBack, texFront, texBack, frontMat, backMat]
  };
}

function disposeResources(resources) {
  for (const r of resources) {
    if (r && typeof r.dispose === 'function') r.dispose();
  }
}

// ── Three.js 3D View ───────────────────────────────────────────────
let renderer3 = null, afId = null, _geo = null;

export function destroy3D() {
  if (afId)     { cancelAnimationFrame(afId); afId = null; }
  if (renderer3) { renderer3.dispose(); renderer3 = null; }
  _geo = null;
}

export function init3D() {
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

  // ── Geometry + textures + materials ──
  const outside = DC._outside, MW = DC._W, MH = DC._H, img = DC._texImg;
  const { grp, scW, scH } = buildCutoutGroup(outside, MW, MH, img);
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

// ── GLB Export ─────────────────────────────────────────────────────
document.getElementById('btnGLB').addEventListener('click', exportGLB);

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
