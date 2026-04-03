import { snapToGrid, isPointNear, mmToCanvas, canvasToMm } from './canvas-utils.js';

export class OrthoSpline {
  constructor(canvas, onClose) {
    this.canvas = canvas;
    this.onClose = onClose;
    this.points = []; // mm coords
    this.active = false;
    this.cursorMm = null;
    this.lastTapTime = 0;

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
  }

  start() {
    this.active = true;
    this.points = [];
    this.cursorMm = null;
  }

  stop() {
    this.active = false;
    this.cursorMm = null;
  }

  reset() {
    this.points = [];
    this.cursorMm = null;
    this.lastTapTime = 0;
  }

  _getTransform() {
    // These are set externally by plan.js
    return { scale: this.scale || 0.5, offsetX: this.offsetX || 0, offsetY: this.offsetY || 0 };
  }

  _clientToMm(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (this.canvas.width / rect.width);
    const py = (clientY - rect.top) * (this.canvas.height / rect.height);
    const t = this._getTransform();
    const mmX = canvasToMm(px, t.scale, t.offsetX);
    const mmY = canvasToMm(py, t.scale, t.offsetY);
    return { x: snapToGrid(mmX), y: snapToGrid(mmY) };
  }

  _handlePointerDown(e, clientX, clientY) {
    if (!this.active) return;

    const mm = this._clientToMm(clientX, clientY);

    // Detect double-tap / close on first point click
    const now = Date.now();
    const doubleTap = (now - this.lastTapTime) < 300;
    this.lastTapTime = now;

    if (this.points.length >= 4) {
      // Close on double-tap
      if (doubleTap) {
        this._closePath();
        return;
      }
      // Close if tapping near first point
      const t = this._getTransform();
      const firstPx = {
        x: mmToCanvas(this.points[0].x, t.scale, t.offsetX),
        y: mmToCanvas(this.points[0].y, t.scale, t.offsetY),
      };
      const rect = this.canvas.getBoundingClientRect();
      const tapPx = {
        x: (clientX - rect.left) * (this.canvas.width / rect.width),
        y: (clientY - rect.top) * (this.canvas.height / rect.height),
      };
      if (isPointNear(tapPx, firstPx, 20)) {
        this._closePath();
        return;
      }
    }

    // Enforce ortho from last point
    let snappedMm = mm;
    if (this.points.length > 0) {
      snappedMm = this._enforceOrtho(this.points[this.points.length - 1], mm);
    }

    this.points.push(snappedMm);
  }

  _handlePointerMove(clientX, clientY) {
    if (!this.active) return;
    const mm = this._clientToMm(clientX, clientY);
    if (this.points.length > 0) {
      this.cursorMm = this._enforceOrtho(this.points[this.points.length - 1], mm);
    } else {
      this.cursorMm = mm;
    }
  }

  _enforceOrtho(lastPoint, newPoint) {
    const dx = Math.abs(newPoint.x - lastPoint.x);
    const dy = Math.abs(newPoint.y - lastPoint.y);
    if (dx >= dy) {
      // horizontal
      return { x: newPoint.x, y: lastPoint.y };
    } else {
      // vertical
      return { x: lastPoint.x, y: newPoint.y };
    }
  }

  _closePath() {
    if (this.points.length < 3) return;
    const closed = [...this.points];
    this.reset();
    if (typeof this.onClose === 'function') {
      this.onClose(closed);
    }
  }

  drawPreview(ctx, transform) {
    if (!this.active || this.points.length === 0) return;
    const { scale, offsetX, offsetY } = transform;

    const toCanvas = (mm) => ({
      x: mmToCanvas(mm.x, scale, offsetX),
      y: mmToCanvas(mm.y, scale, offsetY),
    });

    ctx.save();

    // Draw placed points path
    ctx.beginPath();
    const first = toCanvas(this.points[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < this.points.length; i++) {
      const pt = toCanvas(this.points[i]);
      ctx.lineTo(pt.x, pt.y);
    }

    // Rubber band line to cursor
    if (this.cursorMm) {
      const cur = toCanvas(this.cursorMm);
      ctx.lineTo(cur.x, cur.y);
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw point dots
    ctx.fillStyle = '#3b82f6';
    for (const p of this.points) {
      const cp = toCanvas(p);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight first point (close target)
    if (this.points.length >= 3) {
      const fp = toCanvas(this.points[0]);
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Cursor snap indicator
    if (this.cursorMm) {
      const cp = toCanvas(this.cursorMm);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(59,130,246,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}
