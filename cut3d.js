// CUT3D runtime: cut, preview, export

import { DC, CTX } from './canvas.js';
import { setHasCut } from './draw.js';
import {
  runCut,
  buildGeometryData,
  buildPlaneGeometry,
  buildSideGeometry
} from './cut3d-shape.js';
import {
  buildTextureCanvases,
  buildCardboardSideTexture,
  onSideTextureOverlayReady
} from './cut3d-texture.js';

onSideTextureOverlayReady(() => {
  const v3d = document.getElementById('v3d');
  if (v3d && v3d.classList.contains('on') && DC._outside) {
    requestAnimationFrame(() => requestAnimationFrame(init3D));
  }
});

export function doCut() {
  const W = DC.width;
  const H = DC.height;
  DC._rawDrawing = CTX.getImageData(0, 0, W, H);

  const { stroke, outside, disp, tex3d } = runCut(DC._rawDrawing.data, W, H);

  CTX.putImageData(new ImageData(disp, W, H), 0, 0);
  DC._outside = outside;
  DC._stroke = stroke;
  DC._W = W;
  DC._H = H;
  DC._dispImg = disp;
  DC._texImg = tex3d;

  setHasCut(true);
  document.getElementById('btnEdit').style.display = '';
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

let renderer3 = null;
let afId = null;
let _geo = null;
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
  if (afId) {
    cancelAnimationFrame(afId);
    afId = null;
  }

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

  if (renderer3) {
    renderer3.dispose();
    renderer3 = null;
  }

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
  const rect = stack.getBoundingClientRect();
  const W3 = Math.round(rect.width) || 860;
  const H3 = Math.round(rect.height) || 440;
  const tcan = document.getElementById('tc');
  previewCanvas = tcan;
  tcan.width = W3;
  tcan.height = H3;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1510);

  scene.add(new THREE.AmbientLight(0xfff5e0, 0.55));
  const kl = new THREE.DirectionalLight(0xfffaf0, 1.1);
  kl.position.set(4, 6, 6);
  scene.add(kl);
  const rl = new THREE.DirectionalLight(0x8090c0, 0.3);
  rl.position.set(-5, -3, -5);
  scene.add(rl);
  const fl = new THREE.DirectionalLight(0xffe8c0, 0.2);
  fl.position.set(0, -4, 3);
  scene.add(fl);

  const cam = new THREE.PerspectiveCamera(42, W3 / H3, 0.01, 200);
  cam.position.set(0, 0, 4.5);

  renderer3 = new THREE.WebGLRenderer({ canvas: tcan, antialias: true, alpha: false });
  renderer3.setSize(W3, H3);
  renderer3.setPixelRatio(Math.min(devicePixelRatio, 2));

  const outside = DC._outside;
  const MW = DC._W;
  const MH = DC._H;
  const img = DC._texImg;
  const { grp, scW, scH, resources } = buildCutoutGroup(outside, MW, MH, img);
  previewResources = resources;
  _geo = grp.children[0].geometry;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(scW * 1.5, scH * 1.5),
    new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.15, depthWrite: false })
  );
  shadow.position.set(0.12, -0.16, -1.2);
  scene.add(shadow, grp);

  let drag = false;
  let rdrag = false;
  let lx = 0;
  let ly = 0;
  let rotX = 0.15;
  let rotY = 0.3;
  let zoom = 4.5;
  let panX = 0;
  let panY = 0;

  downHandler3 = e => {
    drag = true;
    rdrag = e.button === 2;
    lx = e.clientX;
    ly = e.clientY;
    e.preventDefault();
  };
  contextMenuHandler3 = e => e.preventDefault();
  moveHandler3 = e => {
    if (!drag) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    if (rdrag) {
      panX += dx * 0.004;
      panY -= dy * 0.004;
    } else {
      rotY += dx * 0.007;
      rotX += dy * 0.007;
    }
  };
  upHandler3 = () => {
    drag = false;
  };
  wheelHandler3 = e => {
    zoom += e.deltaY * 0.003;
    zoom = Math.max(1.2, Math.min(12, zoom));
    e.preventDefault();
  };

  tcan.addEventListener('mousedown', downHandler3);
  tcan.addEventListener('contextmenu', contextMenuHandler3);
  window.addEventListener('mousemove', moveHandler3);
  window.addEventListener('mouseup', upHandler3);
  tcan.addEventListener('wheel', wheelHandler3, { passive: false });

  let ltd = 0;
  touchStartHandler3 = e => {
    if (e.touches.length === 1) {
      drag = true;
      lx = e.touches[0].clientX;
      ly = e.touches[0].clientY;
    } else {
      ltd = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
    e.preventDefault();
  };
  touchMoveHandler3 = e => {
    if (e.touches.length === 1 && drag) {
      const dx = e.touches[0].clientX - lx;
      const dy = e.touches[0].clientY - ly;
      lx = e.touches[0].clientX;
      ly = e.touches[0].clientY;
      rotY += dx * 0.008;
      rotX += dy * 0.008;
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      zoom -= (d - ltd) * 0.012;
      zoom = Math.max(1.2, Math.min(12, zoom));
      ltd = d;
    }
    e.preventDefault();
  };
  touchEndHandler3 = () => {
    drag = false;
  };

  tcan.addEventListener('touchstart', touchStartHandler3, { passive: false });
  tcan.addEventListener('touchmove', touchMoveHandler3, { passive: false });
  tcan.addEventListener('touchend', touchEndHandler3);

  (function loop() {
    if (!renderer3) return;
    afId = requestAnimationFrame(loop);
    grp.rotation.x = rotX;
    grp.rotation.y = rotY;
    shadow.rotation.y = rotY * 0.15;
    cam.position.set(panX, panY, zoom);
    cam.lookAt(panX, panY, 0);
    renderer3.render(scene, cam);
  })();
}

document.getElementById('btnGLB').addEventListener('click', exportGLB);

updateDepthLabel();
document.getElementById('depth3d').addEventListener('input', () => {
  updateDepthLabel();
  if (!document.getElementById('v3d').classList.contains('on')) return;
  if (!DC._outside) return;
  requestAnimationFrame(() => requestAnimationFrame(init3D));
});

export function exportGLB() {
  if (!DC._outside) {
    alert('Cut out a shape first.');
    return;
  }
  if (!THREE.GLTFExporter) {
    alert('GLTFExporter is not loaded.');
    return;
  }

  const btn = document.getElementById('btnGLB');
  btn.textContent = '⏳ Exporting…';
  btn.disabled = true;

  const done = ok => {
    btn.textContent = ok ? '✓ Exported!' : '⬇ Export GLB';
    setTimeout(() => {
      btn.textContent = '⬇ Export GLB';
      btn.disabled = false;
    }, ok ? 2000 : 0);
  };

  try {
    const outside = DC._outside;
    const MW = DC._W;
    const MH = DC._H;
    const img = DC._texImg;
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
