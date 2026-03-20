import { DC, CTX, SC, SCTX } from './canvas.js';
import { penColor, penSize, setHasStroke, setMode, setSt, sync3DButtonToCanvas } from './draw.js';

const MAX_STAMPS = 3;
const BASE_STAMP_SIZE = 150;

const stamps = new Array(MAX_STAMPS).fill(null);
let activeStampIndex = -1;
let stampToolActive = false;

function getSlotEl(index) {
  return document.getElementById(`stampSlot${index}`);
}

function getSlotWrapEl(index) {
  return document.getElementById(`stampSlotWrap${index}`);
}

function getSlotClearEl(index) {
  return document.getElementById(`stampSlotClear${index}`);
}

function getActiveStamp() {
  if (activeStampIndex < 0) return null;
  return stamps[activeStampIndex];
}

function shortenName(name) {
  if (!name) return '';
  return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}

function renderStampSlots() {
  stamps.forEach((stamp, index) => {
    const slot = getSlotEl(index);
    const wrap = getSlotWrapEl(index);
    const clear = getSlotClearEl(index);
    if (!slot) return;
    slot.disabled = !stamp;
    slot.classList.toggle('loaded', !!stamp);
    slot.classList.toggle('selected', index === activeStampIndex && !!stamp);
    slot.classList.toggle('tool-on', stampToolActive && index === activeStampIndex && !!stamp);
    if (wrap) wrap.classList.toggle('loaded', !!stamp);
    if (clear) {
      clear.disabled = !stamp;
      clear.title = stamp ? `Remove ${stamp.name}` : `Remove stamp ${index + 1}`;
      clear.setAttribute('aria-label', stamp ? `Remove ${stamp.name}` : `Remove stamp ${index + 1}`);
    }
    slot.textContent = stamp ? shortenName(stamp.name) : String(index + 1);
    slot.title = stamp ? stamp.name : `Stamp ${index + 1}`;
  });
}

function updateStampSizeUI() {
  const wrap = document.getElementById('stampSizeWrap');
  const slider = document.getElementById('stampScale');
  const out = document.getElementById('stampScaleVal');
  const activeStamp = getActiveStamp();
  const visible = !!activeStamp;

  wrap.classList.toggle('on', visible);
  if (!visible) {
    slider.value = '100';
    out.textContent = '100%';
    return;
  }

  slider.value = String(activeStamp.scale);
  out.textContent = `${activeStamp.scale}%`;
}

function rebuildStampMask(stamp) {
  if (!stamp?.img) return;
  const off = document.createElement('canvas');
  off.width = stamp.width;
  off.height = stamp.height;
  const octx = off.getContext('2d');
  octx.clearRect(0, 0, stamp.width, stamp.height);
  octx.drawImage(stamp.img, 0, 0, stamp.width, stamp.height);
  const px = octx.getImageData(0, 0, stamp.width, stamp.height).data;
  stamp.alphaMask = new Uint8Array(stamp.width * stamp.height);
  for (let i = 0; i < stamp.width * stamp.height; i++) {
    stamp.alphaMask[i] = px[i * 4 + 3] > 20 ? 1 : 0;
  }
}

function isBorderPixel(stamp, x, y) {
  return (
    x === 0 || x === stamp.width - 1 || y === 0 || y === stamp.height - 1 ||
    !stamp.alphaMask[y * stamp.width + (x - 1)] || !stamp.alphaMask[y * stamp.width + (x + 1)] ||
    !stamp.alphaMask[(y - 1) * stamp.width + x] || !stamp.alphaMask[(y + 1) * stamp.width + x]
  );
}

function paintStampBorder(ctx, stamp, ox, oy, size) {
  const drawSize = Math.max(1, size | 0);
  const offset = Math.floor(drawSize / 2);
  for (let y = 0; y < stamp.height; y++) {
    for (let x = 0; x < stamp.width; x++) {
      if (!stamp.alphaMask[y * stamp.width + x]) continue;
      if (!isBorderPixel(stamp, x, y)) continue;
      ctx.fillRect(ox + x - offset, oy + y - offset, drawSize, drawSize);
    }
  }
}

function applyStampScale(scale) {
  const stamp = getActiveStamp();
  if (!stamp) return;
  stamp.scale = scale;
  stamp.width = Math.max(1, Math.round(stamp.baseW * scale / 100));
  stamp.height = Math.max(1, Math.round(stamp.baseH * scale / 100));
  rebuildStampMask(stamp);
  updateStampSizeUI();
}

function getUploadSlotIndex() {
  const emptyIndex = stamps.findIndex(stamp => !stamp);
  if (emptyIndex !== -1) return emptyIndex;
  if (activeStampIndex !== -1) return activeStampIndex;
  return 0;
}

function getStampBaseSize(svgText) {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = svgDoc.querySelector('svg');
  let nw = 0;
  let nh = 0;

  if (svgEl) {
    nw = parseFloat(svgEl.getAttribute('width')) || 0;
    nh = parseFloat(svgEl.getAttribute('height')) || 0;
    if (!nw || !nh) {
      const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/);
      if (vb.length >= 4) {
        nw = parseFloat(vb[2]);
        nh = parseFloat(vb[3]);
      }
    }
  }

  if (!nw || !nh) {
    nw = 100;
    nh = 100;
  }

  const ar = nw / nh;
  if (ar >= 1) {
    return { baseW: BASE_STAMP_SIZE, baseH: Math.round(BASE_STAMP_SIZE / ar) };
  }
  return { baseH: BASE_STAMP_SIZE, baseW: Math.round(BASE_STAMP_SIZE * ar) };
}

function activateStamp(index) {
  if (!stamps[index]) return;
  activeStampIndex = index;
  renderStampSlots();
  updateStampSizeUI();
  setMode('stamp');
}

function getNextLoadedStampIndex(preferredIndex) {
  if (preferredIndex >= 0 && stamps[preferredIndex]) return preferredIndex;
  for (let i = 0; i < MAX_STAMPS; i++) {
    if (stamps[i]) return i;
  }
  return -1;
}

function clearStamp(index) {
  if (!stamps[index]) return;
  const wasActive = index === activeStampIndex;
  stamps[index] = null;

  if (wasActive) {
    activeStampIndex = getNextLoadedStampIndex(index + 1);
  }

  if (activeStampIndex >= MAX_STAMPS || activeStampIndex < 0 || !stamps[activeStampIndex]) {
    activeStampIndex = getNextLoadedStampIndex(0);
  }

  renderStampSlots();
  updateStampSizeUI();

  if (activeStampIndex === -1) {
    stampToolActive = false;
    clearStampCursor();
    setMode('pen');
    return;
  }

  if (wasActive && stampToolActive) {
    setMode('stamp');
  }
}

export function hasActiveStamp() {
  return !!getActiveStamp();
}

export function hasAnyStamps() {
  return stamps.some(Boolean);
}

export function getActiveStampName() {
  return getActiveStamp()?.name || 'stamp';
}

export function setStampToolActive(active) {
  stampToolActive = active;
  renderStampSlots();
}

document.getElementById('btnSVG').addEventListener('click', () => {
  document.getElementById('svgFileIn').click();
});

document.getElementById('svgFileIn').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;

  const slotIndex = getUploadSlotIndex();
  const reader = new FileReader();
  reader.onload = ev => {
    const svgText = ev.target.result;
    const { baseW, baseH } = getStampBaseSize(svgText);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const stamp = {
        name: f.name,
        img,
        alphaMask: null,
        baseW,
        baseH,
        width: baseW,
        height: baseH,
        scale: 100
      };
      rebuildStampMask(stamp);
      stamps[slotIndex] = stamp;
      activeStampIndex = slotIndex;
      renderStampSlots();
      updateStampSizeUI();
      setMode('stamp');
      e.target.value = '';
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Could not load SVG. Ensure it is a valid .svg file.');
    };

    img.src = url;
  };
  reader.readAsText(f);
});

document.getElementById('stampScale').addEventListener('input', e => {
  applyStampScale(+e.target.value);
});

for (let i = 0; i < MAX_STAMPS; i++) {
  getSlotEl(i).addEventListener('click', () => activateStamp(i));
  getSlotClearEl(i).addEventListener('click', e => {
    e.stopPropagation();
    clearStamp(i);
  });
}

export function drawStampCursor(p) {
  SCTX.clearRect(0, 0, SC.width, SC.height);
  const stamp = getActiveStamp();
  if (!stamp?.alphaMask) return;

  const ox = Math.round(p.x) - Math.floor(stamp.width / 2);
  const oy = Math.round(p.y) - Math.floor(stamp.height / 2);

  SCTX.save();
  SCTX.globalAlpha = 0.35;
  SCTX.fillStyle = penColor;
  for (let y = 0; y < stamp.height; y++) {
    for (let x = 0; x < stamp.width; x++) {
      if (stamp.alphaMask[y * stamp.width + x]) {
        SCTX.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  SCTX.restore();

  SCTX.save();
  SCTX.fillStyle = penColor;
  SCTX.globalAlpha = 0.85;
  paintStampBorder(SCTX, stamp, ox, oy, Math.max(1, Math.round(penSize)));
  SCTX.restore();
}

export function clearStampCursor() {
  SCTX.clearRect(0, 0, SC.width, SC.height);
}

export function doStamp(p) {
  const stamp = getActiveStamp();
  if (!stamp?.alphaMask) return;

  const ox = Math.round(p.x) - Math.floor(stamp.width / 2);
  const oy = Math.round(p.y) - Math.floor(stamp.height / 2);
  CTX.save();
  CTX.fillStyle = penColor;
  paintStampBorder(CTX, stamp, ox, oy, Math.max(1, Math.round(penSize)));
  CTX.restore();

  drawStampCursor(p);
  setHasStroke(sync3DButtonToCanvas());
  setSt('stamp', `Stamped ${stamp.name}. Click again to add more, or click 3D`);
  document.getElementById('caption').textContent = 'stamped';
}

renderStampSlots();
updateStampSizeUI();
