// CUT3D texture helpers

const sideTextureOverlay = new Image();
let sideTextureOverlayReady = false;
const sideTextureReadyListeners = new Set();

const SIDE_TEXTURE_MULTIPLY_ALPHA = 1.8;
const SIDE_TEXTURE_SOFT_LIGHT_ALPHA = 0.5;
const FACE_EDGE_DILATION_PX = 2;

sideTextureOverlay.src = './cardboard-texture.jpg';
sideTextureOverlay.addEventListener('load', () => {
  sideTextureOverlayReady = true;
  for (const listener of sideTextureReadyListeners) listener();
});

export function onSideTextureOverlayReady(listener) {
  sideTextureReadyListeners.add(listener);
  if (sideTextureOverlayReady) listener();
  return () => sideTextureReadyListeners.delete(listener);
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

export function buildTextureCanvases(outside, MW, MH, img) {
  const frontCanvas = buildFrontTextureCanvas(img, MW, MH);
  const backCanvas = buildBackTextureCanvas(frontCanvas, outside, MW, MH);
  dilateOpaqueEdges(frontCanvas, FACE_EDGE_DILATION_PX);
  dilateOpaqueEdges(backCanvas, FACE_EDGE_DILATION_PX);
  return { frontCanvas, backCanvas };
}

function dilateOpaqueEdges(canvas, passes) {
  if (!passes) return;

  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let src = new Uint8ClampedArray(img.data);
  const w = canvas.width;
  const h = canvas.height;

  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8ClampedArray(src);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] > 0) continue;

        let found = -1;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1) && found === -1; ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
            if (nx === x && ny === y) continue;
            const ni = (ny * w + nx) * 4;
            if (src[ni + 3] > 0) {
              found = ni;
              break;
            }
          }
        }

        if (found === -1) continue;
        next[i] = src[found];
        next[i + 1] = src[found + 1];
        next[i + 2] = src[found + 2];
        next[i + 3] = src[found + 3];
      }
    }
    src = next;
  }

  img.data.set(src);
  ctx.putImageData(img, 0, 0);
}

export function buildCardboardSideTexture() {
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

  ctx.fillStyle = '#d1a779';
  ctx.fillRect(0, 0, w, liner);
  ctx.fillRect(0, h - liner, w, liner);
  ctx.fillStyle = fluteColor;
  ctx.fillRect(0, 0, w, 4);
  ctx.fillRect(0, liner - 4, w, 4);
  ctx.fillRect(0, h - liner, w, 4);
  ctx.fillRect(0, h - 4, w, 4);

  ctx.fillStyle = '#2e2117';
  ctx.fillRect(0, liner, w, h - liner * 2);

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
