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
      vi.push(idx, idx+2, idx+1, idx, idx+3, idx+2);
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
  const frontMat = new THREE.MeshLambertMaterial({ map: tex,     side: THREE.FrontSide, transparent: true, alphaTest: 0.5 });
  const backMat  = new THREE.MeshLambertMaterial({ map: texBack, side: THREE.BackSide,  transparent: true, alphaTest: 0.5 });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, frontMat));
  grp.add(new THREE.Mesh(geo.clone(), backMat));

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
        indices.push(idx, idx+2, idx+1, idx, idx+3, idx+2);
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

    function pad4(ab)   { const p = (4 - ab.byteLength % 4) % 4; if (!p) return ab; const o = new Uint8Array(ab.byteLength + p); o.set(new Uint8Array(ab)); return o.buffer; }
    function pad4raw(b) { const p = (4 - b.byteLength  % 4) % 4; if (!p) return b.buffer; const o = new Uint8Array(b.byteLength  + p); o.set(b); return o.buffer; }

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
      textures:  [{ source: 0, sampler: 0 }],
      images:    [{ bufferView: 3, mimeType: 'image/png' }],
      samplers:  [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
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
