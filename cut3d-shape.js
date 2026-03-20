// CUT3D shape and geometry helpers

export function runCut(raw, W, H) {
  const stroke = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (raw[i * 4 + 3] > 30) stroke[i] = 1;
  }

  const outside = new Uint8Array(W * H);
  const Q = [];

  function seed(x, y) {
    const i = y * W + x;
    if (!stroke[i] && !outside[i]) {
      outside[i] = 1;
      Q.push(i);
    }
  }

  for (let x = 0; x < W; x++) {
    seed(x, 0);
    seed(x, H - 1);
  }
  for (let y = 1; y < H - 1; y++) {
    seed(0, y);
    seed(W - 1, y);
  }

  let qi = 0;
  while (qi < Q.length) {
    const i = Q[qi++];
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0 && !outside[i - 1] && !stroke[i - 1]) {
      outside[i - 1] = 1;
      Q.push(i - 1);
    }
    if (x < W - 1 && !outside[i + 1] && !stroke[i + 1]) {
      outside[i + 1] = 1;
      Q.push(i + 1);
    }
    if (y > 0 && !outside[i - W] && !stroke[i - W]) {
      outside[i - W] = 1;
      Q.push(i - W);
    }
    if (y < H - 1 && !outside[i + W] && !stroke[i + W]) {
      outside[i + W] = 1;
      Q.push(i + W);
    }
  }

  const disp = new Uint8ClampedArray(W * H * 4);
  const tex3d = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = i * 4;

      if (stroke[i]) {
        disp[p] = raw[p];
        disp[p + 1] = raw[p + 1];
        disp[p + 2] = raw[p + 2];
        disp[p + 3] = raw[p + 3];

        tex3d[p] = raw[p];
        tex3d[p + 1] = raw[p + 1];
        tex3d[p + 2] = raw[p + 2];
        tex3d[p + 3] = 255;
      } else if (outside[i]) {
        const c = ((x >> 4) + (y >> 4)) & 1;
        disp[p] = c ? 212 : 192;
        disp[p + 1] = c ? 205 : 186;
        disp[p + 2] = c ? 192 : 174;
        disp[p + 3] = 255;

        tex3d[p] = 0;
        tex3d[p + 1] = 0;
        tex3d[p + 2] = 0;
        tex3d[p + 3] = 0;
      } else if (x % 26 === 0 || y % 26 === 0) {
        disp[p] = 90;
        disp[p + 1] = 130;
        disp[p + 2] = 195;
        disp[p + 3] = 44;

        tex3d[p] = 90;
        tex3d[p + 1] = 130;
        tex3d[p + 2] = 195;
        tex3d[p + 3] = 255;
      } else {
        disp[p] = 250;
        disp[p + 1] = 248;
        disp[p + 2] = 242;
        disp[p + 3] = 255;

        tex3d[p] = 250;
        tex3d[p + 1] = 248;
        tex3d[p + 2] = 242;
        tex3d[p + 3] = 255;
      }
    }
  }

  return { stroke, outside, disp, tex3d };
}

function computeBounds(outside, w, h) {
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;

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

export function buildGeometryData(outside, MW, MH) {
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

export function buildPlaneGeometry(cells, cellW, cellH, z, reverse = false) {
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

export function buildSideGeometry(cells, cellW, cellH, halfDepth) {
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
