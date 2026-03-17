# ✂ Cut Out → 3D

A browser-based tool to draw or stamp shapes, cut them out, and view them as 3D paper cutouts — with GLB export.

**Live site:** https://zenzen26.github.io/CutOut-to-3D/

---

## Features

- ✏️ **Draw** freehand with colour & size controls, stroke stabiliser
- 🍪 **SVG Stamp** — upload any `.svg` and click to stamp its outline
- ✂ **Cut Out** — flood-fill algorithm isolates your shape
- ⬡ **3D View** — Three.js renderer, drag to rotate, pinch to zoom
- ⬇ **Export GLB** — download your cutout as a `.glb` 3D file

---

## File Structure

```
cut-out-to-3D/
├── index.html   ← HTML structure only
├── style.css    ← All styles + responsive breakpoints
├── main.js      ← All JavaScript logic
└── README.md
```

