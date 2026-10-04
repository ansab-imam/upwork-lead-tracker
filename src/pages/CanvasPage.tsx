import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, X, Download, ZoomIn, ZoomOut, Maximize2,
  MousePointer2, Hand, Pen, Minus, ArrowRight, Square, Circle, Diamond,
  Type, StickyNote, Copy, Clipboard, CopyPlus, Group, Ungroup,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  BringToFront, SendToBack, Grid3x3, Undo2, Redo2, Palette, Magnet, ImagePlus,
  SquareRoundCorner, RectangleHorizontal, Cylinder, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Spline, List
} from 'lucide-react';
import { supabase } from '../utils/supabase';

// ── Types ────────────────────────────────────────────────────────────────────
type Tool =
  | 'select' | 'pan' | 'pen' | 'line' | 'arrow'
  | 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'parallelogram' | 'cylinder'
  | 'text' | 'sticky';

type ShapeType =
  | 'path' | 'line' | 'arrow' | 'rect' | 'roundRect' | 'ellipse' | 'diamond'
  | 'parallelogram' | 'cylinder' | 'text' | 'sticky' | 'image';

interface Point { x: number; y: number; }

interface CanvasShape {
  id: string;
  type: ShapeType;
  // freehand / line / arrow
  points?: Point[];
  // box-model shapes: x,y = top-left, width/height = size
  x?: number; y?: number;
  width?: number; height?: number;
  // styling
  color: string;          // stroke / text color
  fill?: string;          // fill color ('none' = transparent)
  lineWidth: number;
  fontSize?: number;
  text?: string;          // label text (shapes) or content (text/sticky)
  src?: string;           // image data URL (image shapes)
  // text styling
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  // line styling
  dash?: boolean;         // dashed stroke
  elbow?: boolean;        // right-angle (elbow) connector for line/arrow
  // grouping
  groupId?: string | null;
}

interface CanvasBoard {
  id: string;
  name: string;
  shapes: CanvasShape[];
  created_at: string;
  updated_at: string;
}

const uid = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Geometry helpers ───────────────────────────────────────────────────────────
interface Box { x: number; y: number; w: number; h: number; }

// Axis-aligned bounding box of a shape in WORLD coords
function shapeBounds(s: CanvasShape): Box {
  if (s.points && s.points.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: s.x ?? 0, y: s.y ?? 0, w: s.width ?? 0, h: s.height ?? 0 };
}

function boundsOfMany(shapes: CanvasShape[]): Box | null {
  if (!shapes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const b = shapeBounds(s);
    if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w; if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function pointInBox(p: Point, b: Box, pad = 0): boolean {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

// Hit test a single shape at a world point
function hitShape(s: CanvasShape, p: Point, scale: number): boolean {
  const tol = 8 / scale;
  if (s.type === 'path' || s.type === 'line' || s.type === 'arrow') {
    const pts = s.points ?? [];
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(p, pts[i], pts[i + 1]) < tol + s.lineWidth / 2) return true;
    }
    return false;
  }
  const b = shapeBounds(s);
  if (s.type === 'ellipse') {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const rx = b.w / 2 + tol, ry = b.h / 2 + tol;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (p.x - cx) / rx, dy = (p.y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  // rect, diamond, text, sticky -> bounding box hit (generous)
  return pointInBox(p, b, tol);
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Cache of decoded images keyed by their data URL, so we don't reload each frame.
const imageCache = new Map<string, HTMLImageElement>();
function getImage(src: string, onLoad: () => void): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (img) return img.complete ? img : null;
  img = new Image();
  img.onload = onLoad;
  img.src = src;
  imageCache.set(src, img);
  return img.complete ? img : null;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, s: CanvasShape, ox: number, oy: number, scale: number, onImgLoad?: () => void) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(1, s.lineWidth * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.dash) ctx.setLineDash([8 * scale, 6 * scale]);
  const tx = (v: number) => v * scale + ox;
  const ty = (v: number) => v * scale + oy;
  const b = shapeBounds(s);
  const hasFill = s.fill && s.fill !== 'none';
  const r = 12 * scale; // corner radius for roundRect

  if (s.type === 'path' && s.points && s.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(tx(s.points[0].x), ty(s.points[0].y));
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(tx(s.points[i].x), ty(s.points[i].y));
    ctx.stroke();
  } else if ((s.type === 'line' || s.type === 'arrow') && s.points && s.points.length === 2) {
    const [a, c] = s.points;
    ctx.beginPath();
    ctx.moveTo(tx(a.x), ty(a.y));
    let tipAng: number;
    if (s.elbow) {
      // right-angle connector: horizontal then vertical
      const midX = c.x;
      ctx.lineTo(tx(midX), ty(a.y));
      ctx.lineTo(tx(c.x), ty(c.y));
      tipAng = c.y >= a.y ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ctx.lineTo(tx(c.x), ty(c.y));
      tipAng = Math.atan2(c.y - a.y, c.x - a.x);
    }
    ctx.stroke();
    if (s.type === 'arrow') {
      const head = 12 * scale;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx(c.x), ty(c.y));
      ctx.lineTo(tx(c.x) - head * Math.cos(tipAng - Math.PI / 6), ty(c.y) - head * Math.sin(tipAng - Math.PI / 6));
      ctx.moveTo(tx(c.x), ty(c.y));
      ctx.lineTo(tx(c.x) - head * Math.cos(tipAng + Math.PI / 6), ty(c.y) - head * Math.sin(tipAng + Math.PI / 6));
      ctx.stroke();
    }
  } else if (s.type === 'rect') {
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fillRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale); }
    ctx.strokeRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale);
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'roundRect') {
    roundRectPath(ctx, tx(b.x), ty(b.y), b.w * scale, b.h * scale, r);
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'parallelogram') {
    const sk = Math.min(b.w * 0.25, 40) * scale;
    ctx.beginPath();
    ctx.moveTo(tx(b.x) + sk, ty(b.y));
    ctx.lineTo(tx(b.x + b.w), ty(b.y));
    ctx.lineTo(tx(b.x + b.w) - sk, ty(b.y + b.h));
    ctx.lineTo(tx(b.x), ty(b.y + b.h));
    ctx.closePath();
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'cylinder') {
    const x = tx(b.x), y = ty(b.y), w = b.w * scale, h = b.h * scale;
    const ry = Math.min(h * 0.14, 18 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y + ry);
    ctx.lineTo(x, y + h - ry);
    ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + w, y + ry);
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(tx(b.x + b.w / 2), ty(b.y + b.h / 2), Math.abs(b.w / 2) * scale, Math.abs(b.h / 2) * scale, 0, 0, Math.PI * 2);
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'diamond') {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.beginPath();
    ctx.moveTo(tx(cx), ty(b.y));
    ctx.lineTo(tx(b.x + b.w), ty(cy));
    ctx.lineTo(tx(cx), ty(b.y + b.h));
    ctx.lineTo(tx(b.x), ty(cy));
    ctx.closePath();
    if (hasFill) { ctx.fillStyle = s.fill!; ctx.fill(); }
    ctx.stroke();
    drawLabel(ctx, s, b, tx, ty, scale);
  } else if (s.type === 'sticky') {
    ctx.fillStyle = s.fill && s.fill !== 'none' ? s.fill : '#fef08a';
    ctx.fillRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.strokeRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale);
    drawLabel(ctx, s, b, tx, ty, scale, 'left', 10);
  } else if (s.type === 'text') {
    const fs = (s.fontSize ?? 16) * scale;
    ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : ''}${fs}px Inter, sans-serif`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'top';
    const al = s.align ?? 'left';
    ctx.textAlign = al;
    const maxW = (b.w || 400) * scale;
    const anchorX = al === 'center' ? tx(b.x) + maxW / 2 : al === 'right' ? tx(b.x) + maxW : tx(b.x);
    wrapText(ctx, s.text ?? '', anchorX, ty(b.y), maxW, fs * 1.3, s.underline);
  } else if (s.type === 'image' && s.src) {
    const img = getImage(s.src, onImgLoad ?? (() => {}));
    if (img) {
      ctx.drawImage(img, tx(b.x), ty(b.y), b.w * scale, b.h * scale);
    } else {
      // placeholder while the image decodes
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(tx(b.x), ty(b.y), b.w * scale, b.h * scale);
    }
  }
  ctx.restore();
}

// Draw a centered (or positioned) multi-line label inside a shape's box
function drawLabel(
  ctx: CanvasRenderingContext2D, s: CanvasShape, b: Box,
  tx: (v: number) => number, ty: (v: number) => number, scale: number,
  align: 'center' | 'left' = 'center', padPx = 0
) {
  if (!s.text) return;
  const fs = (s.fontSize ?? 15) * scale;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : ''}${fs}px Inter, sans-serif`;
  ctx.fillStyle = s.type === 'sticky' ? '#334155' : s.color;
  ctx.textBaseline = 'middle';
  const al = s.align ?? align;
  ctx.textAlign = al;
  const lines = s.text.split('\n');
  const lineH = fs * 1.25;
  const startY = ty(b.y + b.h / 2) - (lines.length - 1) * lineH / 2;
  const x = al === 'center' ? tx(b.x + b.w / 2) : al === 'right' ? tx(b.x + b.w) - padPx : tx(b.x) + padPx;
  const yBase = align === 'center' ? startY : ty(b.y) + fs / 2 + padPx;
  lines.forEach((ln, i) => {
    const yy = yBase + i * lineH;
    ctx.fillText(ln, x, yy);
    if (s.underline) {
      const w = ctx.measureText(ln).width;
      const ux = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.lineWidth = Math.max(1, fs * 0.06);
      ctx.beginPath(); ctx.moveTo(ux, yy + fs * 0.45); ctx.lineTo(ux + w, yy + fs * 0.45); ctx.stroke();
    }
  });
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, underline?: boolean) {
  const al = ctx.textAlign;
  let yy = y; // running vertical position — advances one lineH per rendered line
  const drawUnderline = (ln: string, lineY: number, startX: number) => {
    if (!underline) return;
    const w = ctx.measureText(ln).width;
    const ux = al === 'center' ? startX - w / 2 : al === 'right' ? startX - w : startX;
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.lineWidth = Math.max(1, lineH * 0.05);
    ctx.beginPath(); ctx.moveTo(ux, lineY + lineH * 0.95); ctx.lineTo(ux + w, lineY + lineH * 0.95); ctx.stroke();
  };
  text.split('\n').forEach(para => {
    // Detect a bullet prefix ("- ", "* ", or "• ") so wrapped lines indent under the text
    const bulletMatch = para.match(/^(\s*)([-*•])\s+(.*)$/);
    const isBullet = !!bulletMatch;
    const bulletIndent = ctx.measureText('•  ').width;
    const bodyText = isBullet ? bulletMatch![3] : para;
    const bodyMaxW = isBullet ? maxW - bulletIndent : maxW;

    const words = bodyText.split(' ');
    let line = '';
    let first = true;
    const flush = (ln: string) => {
      // For bullets, first line shows "• ", wrapped continuation lines indent
      if (isBullet) {
        const bx = (al === 'right') ? x - bodyMaxW : x; // left edge of the text block
        if (first) { ctx.fillText('•', bx, yy); }
        ctx.fillText(ln, bx + bulletIndent, yy);
        drawUnderline(ln, yy, bx + bulletIndent);
      } else {
        ctx.fillText(ln, x, yy);
        drawUnderline(ln, yy, x);
      }
      yy += lineH;
      first = false;
    };
    if (words.length === 0 || (words.length === 1 && words[0] === '')) {
      yy += lineH; // blank line
      return;
    }
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > bodyMaxW && line) { flush(line); line = w; }
      else line = test;
    }
    flush(line);
  });
}

function redraw(
  canvas: HTMLCanvasElement, shapes: CanvasShape[],
  ox: number, oy: number, scale: number, showGrid: boolean,
  selectedIds: Set<string>, marquee: Box | null, guides: { v: number[]; h: number[] },
  onImgLoad?: () => void
) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = '#eef2f6';
    ctx.lineWidth = 1;
    const g = 24 * scale;
    if (g > 6) {
      const sx = ((ox % g) + g) % g;
      const sy = ((oy % g) + g) % g;
      for (let x = sx; x < canvas.width; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
      for (let y = sy; y < canvas.height; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    }
    ctx.restore();
  }

  shapes.forEach(s => drawShape(ctx, s, ox, oy, scale, onImgLoad));

  // Selection overlays
  const tx = (v: number) => v * scale + ox;
  const ty = (v: number) => v * scale + oy;
  const sel = shapes.filter(s => selectedIds.has(s.id));
  if (sel.length) {
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const s of sel) {
      const b = shapeBounds(s);
      ctx.strokeRect(tx(b.x) - 3, ty(b.y) - 3, b.w * scale + 6, b.h * scale + 6);
    }
    ctx.setLineDash([]);
    // Single line/arrow: draw endpoint handles instead of a box
    const single = sel.length === 1 ? sel[0] : null;
    if (single && (single.type === 'line' || single.type === 'arrow') && single.points?.length === 2) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      for (const p of single.points) {
        ctx.beginPath();
        ctx.arc(tx(p.x), ty(p.y), 6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else {
      // Group bounding box + resize handles
      const gb = boundsOfMany(sel);
      if (gb) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx(gb.x), ty(gb.y), gb.w * scale, gb.h * scale);
        const hs = handlePositions(gb);
        ctx.fillStyle = '#fff';
        for (const h of hs) {
          ctx.beginPath();
          ctx.rect(tx(h.x) - 4, ty(h.y) - 4, 8, 8);
          ctx.fill(); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // Alignment guides
  if (guides.v.length || guides.h.length) {
    ctx.save();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    guides.v.forEach(vx => { ctx.beginPath(); ctx.moveTo(tx(vx), 0); ctx.lineTo(tx(vx), canvas.height); ctx.stroke(); });
    guides.h.forEach(hy => { ctx.beginPath(); ctx.moveTo(0, ty(hy)); ctx.lineTo(canvas.width, ty(hy)); ctx.stroke(); });
    ctx.restore();
  }

  // Marquee selection rectangle
  if (marquee) {
    ctx.save();
    ctx.fillStyle = 'rgba(59,130,246,0.08)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.fillRect(tx(marquee.x), ty(marquee.y), marquee.w * scale, marquee.h * scale);
    ctx.strokeRect(tx(marquee.x), ty(marquee.y), marquee.w * scale, marquee.h * scale);
    ctx.restore();
  }
}

// 8 resize-handle positions for a bounding box (world coords)
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
function handlePositions(b: Box): (Point & { id: HandleId })[] {
  const { x, y, w, h } = b;
  return [
    { id: 'nw', x, y }, { id: 'n', x: x + w / 2, y }, { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 }, { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h }, { id: 'sw', x, y: y + h }, { id: 'w', x, y: y + h / 2 },
  ];
}

// ── Canvas Editor ───────────────────────────────────────────────────────────

// ── Funnel analysis template (generated from the uploaded analysis) ───────────
function buildFunnelTemplate(): CanvasShape[] {
  const shapes: CanvasShape[] = [];
  const mk = (s: Partial<CanvasShape> & { type: ShapeType }): CanvasShape =>
    ({ id: uid(), color: '#1e293b', lineWidth: 2, groupId: null, ...s } as CanvasShape);

  const stages = ['Submitted', 'Viewed', 'Contacted', 'Interviewed', 'Hired'];
  const stageColors = ['#dbeafe', '#dcfce7', '#fef9c3', '#ffedd5', '#fce7f3'];

  const labelW = 200;           // left label column
  const cellW = 240;            // each stage column
  const gap = 12;
  const originX = 40;
  const stageX = (i: number) => originX + labelW + gap + i * (cellW + gap);
  const titleH = 52;
  const headerY = 110;

  // Title
  shapes.push(mk({ type: 'text', x: originX, y: 36, width: 1000, height: 40, text: 'Funnel Analysis — Example', color: '#0f172a', fontSize: 30, lineWidth: 1 }));

  // Stage header row + arrows between stages
  stages.forEach((name, i) => {
    shapes.push(mk({ type: 'rect', x: stageX(i), y: headerY, width: cellW, height: titleH, fill: stageColors[i], color: '#334155', text: name, fontSize: 18 }));
    if (i < stages.length - 1) {
      shapes.push(mk({ type: 'arrow', points: [
        { x: stageX(i) + cellW, y: headerY + titleH / 2 },
        { x: stageX(i + 1), y: headerY + titleH / 2 },
      ], color: '#94a3b8', lineWidth: 2 }));
    }
  });

  type Row = { label: string; cells: string[]; fill: string };
  const rows: Row[] = [
    { label: 'Total Numbers', fill: '#ffffff', cells: ['400', '120', '48', '16', '4'] },
    { label: '% From total', fill: '#ffffff', cells: ['100%', '30.0%', '12.0%', '4.0%', '1.0%'] },
    { label: 'Conversion at each step', fill: '#ffffff', cells: ['N/A', '30.0%', '40.0%', '33.3%', '25.0%'] },
    { label: 'Is this an issue?', fill: '#f8fafc', cells: [
      'Are we applying to the right jobs? Check budget, client history and fit.',
      'Is the opening line of the proposal strong enough to get a view?',
      'Does the profile and cover letter give the client a reason to reply?',
      'Are chats turning into interviews, or stalling after the first message?',
      'What is stopping interviews from becoming hires?',
    ] },
    { label: 'Internal or external factor?', fill: '#f1f5f9', cells: [
      'Mostly internal (job selection).',
      'Mostly internal (proposal quality).',
      'Mixed (profile vs. competition).',
      'Mixed (client seriousness vs. our follow-up).',
      'Mixed (budget vs. our closing).',
    ] },
    { label: 'How can it be improved?', fill: '#f8fafc', cells: [
      'Filter jobs by budget, payment verification and hire rate before applying.',
      'Personalise the first two lines to the job post.',
      'Refresh the profile summary, portfolio and keywords.',
      'Reply quickly and suggest a specific call time.',
      'Send a short recap and clear next step after each call.',
    ] },
    { label: 'Top 3 things to do', fill: '#fefce8', cells: [
      '1. Set a minimum budget\n2. Apply within the first hour\n3. Cover more time zones',
      '1. Reply fast\n2. Reference the client\'s project\n3. Keep it short',
      '1. Update profile headline\n2. Add case studies',
      '1. Review past calls\n2. Prepare questions\n3. Create urgency',
      '1. Follow up within 24h\n2. Offer a small paid trial\n3. Share a prototype',
    ] },
    { label: 'Dependencies / risk factors', fill: '#fee2e2', cells: [
      'Number and quality of jobs posted.',
      'Competition and timing of the proposal.',
      'How many proposals the client receives.',
      'Whether the client has budget and is ready to start.',
      'Client decision and comparison with other freelancers.',
    ] },
  ];

  let y = headerY + titleH + 20;
  for (const row of rows) {
    const lineCount = Math.max(...row.cells.map(c => {
      const wrapped = Math.ceil(c.replace(/\n/g, ' ').length / 34);
      const explicit = c.split('\n').length;
      return Math.max(wrapped, explicit);
    }), 1);
    const h = Math.max(56, lineCount * 22 + 24);

    // left label box
    shapes.push(mk({ type: 'rect', x: originX, y, width: labelW, height: h, fill: '#e2e8f0', color: '#475569', text: row.label, fontSize: 14 }));
    // stage cells
    row.cells.forEach((c, i) => {
      shapes.push(mk({ type: 'rect', x: stageX(i), y, width: cellW, height: h, fill: row.fill, color: '#cbd5e1', text: c, fontSize: 13, lineWidth: 1 }));
    });
    y += h + 12;
  }

  return shapes;
}

const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  rect: { w: 140, h: 80 }, roundRect: { w: 140, h: 80 }, ellipse: { w: 120, h: 120 },
  diamond: { w: 140, h: 90 }, parallelogram: { w: 150, h: 80 }, cylinder: { w: 120, h: 120 },
  sticky: { w: 160, h: 160 }, text: { w: 240, h: 40 },
};
const BOX_TYPES = ['rect', 'roundRect', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'text', 'sticky', 'image'];
const SHAPE_DRAW_TOOLS = ['rect', 'roundRect', 'ellipse', 'diamond', 'parallelogram', 'cylinder', 'sticky'];

const CanvasEditor: React.FC<{ board: CanvasBoard; onSave: (shapes: CanvasShape[]) => void }> = ({ board, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [shapes, setShapes] = useState<CanvasShape[]>(board.shapes ?? []);
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const [imgTick, setImgTick] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);

  // Style controls
  const [color, setColor] = useState('#1e293b');
  const [fill, setFill] = useState('none');
  const [lineWidth, setLineWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);

  // History
  const [history, setHistory] = useState<CanvasShape[][]>([board.shapes ?? []]);
  const [histIdx, setHistIdx] = useState(0);

  // Text editing
  const [editor, setEditor] = useState<{ id: string; screenX: number; screenY: number } | null>(null);
  const [editorVal, setEditorVal] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Clipboard
  const clipboard = useRef<CanvasShape[]>([]);

  // Interaction refs
  const mode = useRef<'idle' | 'draw' | 'move' | 'resize' | 'marquee' | 'pan'>('idle');
  const drawShapeRef = useRef<CanvasShape | null>(null);
  const startWorld = useRef<Point>({ x: 0, y: 0 });
  const startShapes = useRef<Map<string, CanvasShape>>(new Map());
  const activeHandle = useRef<HandleId | null>(null);
  const endpointDrag = useRef<{ id: string; index: 0 | 1 } | null>(null);
  const resizeStartBox = useRef<Box | null>(null);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const offStart = useRef<Point>({ x: 0, y: 0 });
  const marqueeStart = useRef<Point>({ x: 0, y: 0 });
  const marqueeBox = useRef<Box | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const movedRef = useRef(false);

  const toWorld = useCallback((px: number, py: number): Point => ({ x: (px - offset.x) / scale, y: (py - offset.y) / scale }), [offset, scale]);
  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const c = canvasRef.current!.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - c.left, y: e.touches[0].clientY - c.top };
    return { x: (e as React.MouseEvent).clientX - c.left, y: (e as React.MouseEvent).clientY - c.top };
  };

  const commit = useCallback((next: CanvasShape[]) => {
    setShapes(next);
    setHistory(h => { const cut = h.slice(0, histIdx + 1); cut.push(next); return cut; });
    setHistIdx(i => i + 1);
    onSave(next);
  }, [histIdx, onSave]);

  const undo = useCallback(() => { if (histIdx > 0) { const ni = histIdx - 1; setHistIdx(ni); setShapes(history[ni]); onSave(history[ni]); setSelectedIds(new Set()); } }, [histIdx, history, onSave]);
  const redo = useCallback(() => { if (histIdx < history.length - 1) { const ni = histIdx + 1; setHistIdx(ni); setShapes(history[ni]); onSave(history[ni]); setSelectedIds(new Set()); } }, [histIdx, history, onSave]);

  // Resize canvas to wrapper — only when the size actually changes (prevents flicker)
  useEffect(() => {
    const c = canvasRef.current!, wrap = wrapRef.current!;
    const sync = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (c.width !== w || c.height !== h) {
        c.width = w; c.height = h;
        redraw(c, shapesRef.current, offsetRef.current.x, offsetRef.current.y, scaleRef.current, showGrid, selectedIds, marquee, guides);
      }
    };
    const ro = new ResizeObserver(sync);
    ro.observe(wrap);
    sync();
    return () => ro.disconnect();
  }, []); // eslint-disable-line

  useEffect(() => {
    const c = canvasRef.current!;
    redraw(c, shapes, offset.x, offset.y, scale, showGrid, selectedIds, marquee, guides, () => setImgTick(t => t + 1));
  }, [shapes, offset, scale, showGrid, selectedIds, marquee, guides, imgTick]);

  const snapVal = (v: number) => snap ? Math.round(v / 8) * 8 : v;

  // ── Selection helpers ──
  const selectedShapes = () => shapes.filter(s => selectedIds.has(s.id));
  const expandGroups = (ids: Set<string>): Set<string> => {
    const groups = new Set<string>();
    shapes.forEach(s => { if (s.groupId && ids.has(s.id)) groups.add(s.groupId); });
    if (!groups.size) return ids;
    const out = new Set(ids);
    shapes.forEach(s => { if (s.groupId && groups.has(s.groupId)) out.add(s.id); });
    return out;
  };

  // ── Text editing ──
  const openEditor = (s: CanvasShape) => {
    const b = shapeBounds(s);
    const screenX = b.x * scale + offset.x;
    const screenY = b.y * scale + offset.y;
    setEditor({ id: s.id, screenX, screenY });
    setEditorVal(s.text ?? '');
    setTimeout(() => { editorRef.current?.focus(); editorRef.current?.select(); }, 20);
  };
  const commitEditor = () => {
    if (!editor) return;
    const val = editorVal;
    const next = shapes.map(s => s.id === editor.id ? { ...s, text: val } : s)
      .filter(s => !(s.id === editor.id && s.type === 'text' && !val.trim()));
    commit(next);
    setEditor(null); setEditorVal('');
  };

  // ── Pointer down ──
  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (editor) commitEditor();
    const pos = getPos(e);
    const w = toWorld(pos.x, pos.y);
    startWorld.current = w;
    movedRef.current = false;

    // Pan (space/pan tool or middle mouse)
    if (tool === 'pan' || ('button' in e && e.button === 1)) {
      mode.current = 'pan'; panStart.current = pos; offStart.current = { ...offset }; return;
    }

    // SELECT tool: handles, hit shapes, or marquee
    if (tool === 'select') {
      const sel = selectedShapes();
      // Single line/arrow: check endpoint handles first
      if (sel.length === 1 && (sel[0].type === 'line' || sel[0].type === 'arrow') && sel[0].points?.length === 2) {
        const pts = sel[0].points!;
        for (let i = 0; i < 2; i++) {
          if (Math.hypot(w.x - pts[i].x, w.y - pts[i].y) < 9 / scale) {
            mode.current = 'resize';
            endpointDrag.current = { id: sel[0].id, index: i as 0 | 1 };
            startShapes.current = new Map([[sel[0].id, JSON.parse(JSON.stringify(sel[0]))]]);
            return;
          }
        }
      }
      const gb = boundsOfMany(sel);
      if (gb) {
        // Check resize handles
        for (const h of handlePositions(gb)) {
          if (Math.hypot(w.x - h.x, w.y - h.y) < 7 / scale) {
            mode.current = 'resize'; activeHandle.current = h.id; resizeStartBox.current = gb;
            startShapes.current = new Map(sel.map(s => [s.id, JSON.parse(JSON.stringify(s))]));
            return;
          }
        }
      }
      // Hit a shape?
      let hit: CanvasShape | null = null;
      for (let i = shapes.length - 1; i >= 0; i--) { if (hitShape(shapes[i], w, scale)) { hit = shapes[i]; break; } }
      if (hit) {
        const multi = 'shiftKey' in e && (e as React.MouseEvent).shiftKey;
        let ids: Set<string>;
        if (multi) { ids = new Set(selectedIds); ids.has(hit.id) ? ids.delete(hit.id) : ids.add(hit.id); }
        else { ids = selectedIds.has(hit.id) ? new Set(selectedIds) : new Set([hit.id]); }
        ids = expandGroups(ids);
        setSelectedIds(ids);
        mode.current = 'move';
        startShapes.current = new Map(shapes.filter(s => ids.has(s.id)).map(s => [s.id, JSON.parse(JSON.stringify(s))]));
        return;
      }
      // Empty -> marquee
      mode.current = 'marquee'; marqueeStart.current = w; setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      if (!(('shiftKey' in e) && (e as React.MouseEvent).shiftKey)) setSelectedIds(new Set());
      return;
    }

    // DRAWING tools
    mode.current = 'draw';
    if (tool === 'pen') {
      drawShapeRef.current = { id: uid(), type: 'path', points: [w], color, lineWidth, groupId: null };
    } else if (tool === 'line' || tool === 'arrow') {
      drawShapeRef.current = { id: uid(), type: tool, points: [w, w], color, lineWidth, groupId: null };
    } else if (tool === 'text') {
      const d = DEFAULT_SIZE.text;
      const s: CanvasShape = { id: uid(), type: 'text', x: snapVal(w.x), y: snapVal(w.y), width: d.w, height: d.h, color, lineWidth: 1, fontSize, text: '', groupId: null };
      commit([...shapes, s]); setTool('select'); setSelectedIds(new Set([s.id])); mode.current = 'idle';
      openEditor(s); return;
    } else if (SHAPE_DRAW_TOOLS.includes(tool)) {
      const d = DEFAULT_SIZE[tool];
      drawShapeRef.current = {
        id: uid(), type: tool as ShapeType, x: w.x, y: w.y, width: 0, height: 0,
        color: tool === 'sticky' ? '#334155' : color,
        fill: tool === 'sticky' ? '#fef08a' : fill,
        lineWidth, fontSize, text: '', groupId: null,
        _seed: d,
      } as any;
    }
  };

  // ── Pointer move ──
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    const w = toWorld(pos.x, pos.y);

    if (mode.current === 'pan') {
      setOffset({ x: offStart.current.x + (pos.x - panStart.current.x), y: offStart.current.y + (pos.y - panStart.current.y) });
      return;
    }

    if (mode.current === 'draw' && drawShapeRef.current) {
      const s = drawShapeRef.current;
      if (s.type === 'path') s.points!.push(w);
      else if (s.type === 'line' || s.type === 'arrow') s.points![1] = w;
      else {
        s.x = Math.min(startWorld.current.x, w.x);
        s.y = Math.min(startWorld.current.y, w.y);
        s.width = Math.abs(w.x - startWorld.current.x);
        s.height = Math.abs(w.y - startWorld.current.y);
      }
      setShapes(prev => [...prev.filter(p => p.id !== s.id), s]);
      return;
    }

    if (mode.current === 'move') {
      movedRef.current = true;
      let dx = w.x - startWorld.current.x;
      let dy = w.y - startWorld.current.y;
      // Snap to grid on the primary moved shape's origin
      const g = { v: [] as number[], h: [] as number[] };
      const next = shapes.map(s => {
        const orig = startShapes.current.get(s.id);
        if (!orig) return s;
        if (orig.points) return { ...s, points: orig.points.map(p => ({ x: snapVal(p.x + dx), y: snapVal(p.y + dy) })) };
        return { ...s, x: snapVal((orig.x ?? 0) + dx), y: snapVal((orig.y ?? 0) + dy) };
      });
      // Alignment guides vs other shapes
      const movingIds = new Set(startShapes.current.keys());
      const mb = boundsOfMany(next.filter(s => movingIds.has(s.id)));
      if (mb) {
        const others = next.filter(s => !movingIds.has(s.id));
        const mCenters = [mb.x, mb.x + mb.w / 2, mb.x + mb.w];
        const mMids = [mb.y, mb.y + mb.h / 2, mb.y + mb.h];
        for (const o of others) {
          const ob = shapeBounds(o);
          [ob.x, ob.x + ob.w / 2, ob.x + ob.w].forEach(ex => mCenters.forEach(mx => { if (Math.abs(mx - ex) < 5 / scale) g.v.push(ex); }));
          [ob.y, ob.y + ob.h / 2, ob.y + ob.h].forEach(ey => mMids.forEach(my => { if (Math.abs(my - ey) < 5 / scale) g.h.push(ey); }));
        }
      }
      setGuides({ v: [...new Set(g.v)], h: [...new Set(g.h)] });
      shapesRef.current = next;
      setShapes(next);
      return;
    }

    if (mode.current === 'resize' && endpointDrag.current) {
      const { id, index } = endpointDrag.current;
      movedRef.current = true;
      const next = shapesRef.current.map(s => {
        if (s.id !== id || !s.points) return s;
        const pts = [...s.points];
        pts[index] = { x: snapVal(w.x), y: snapVal(w.y) };
        return { ...s, points: pts };
      });
      shapesRef.current = next;
      setShapes(next);
      return;
    }

    if (mode.current === 'resize' && resizeStartBox.current && activeHandle.current) {
      const b0 = resizeStartBox.current;
      const id = activeHandle.current;
      let nx = b0.x, ny = b0.y, nw = b0.w, nh = b0.h;
      const right = b0.x + b0.w, bottom = b0.y + b0.h;
      if (id.includes('e')) nw = Math.max(8, w.x - b0.x);
      if (id.includes('s')) nh = Math.max(8, w.y - b0.y);
      if (id.includes('w')) { nx = Math.min(w.x, right - 8); nw = right - nx; }
      if (id.includes('n')) { ny = Math.min(w.y, bottom - 8); nh = bottom - ny; }
      const sx = nw / b0.w, sy = nh / b0.h;
      const next = shapes.map(s => {
        const orig = startShapes.current.get(s.id);
        if (!orig) return s;
        if (orig.points) {
          return { ...s, points: orig.points.map(p => ({ x: nx + (p.x - b0.x) * sx, y: ny + (p.y - b0.y) * sy })) };
        }
        return { ...s, x: nx + ((orig.x ?? 0) - b0.x) * sx, y: ny + ((orig.y ?? 0) - b0.y) * sy, width: (orig.width ?? 0) * sx, height: (orig.height ?? 0) * sy };
      });
      shapesRef.current = next;
      setShapes(next);
      return;
    }

    if (mode.current === 'marquee') {
      const s = marqueeStart.current;
      const box = { x: Math.min(s.x, w.x), y: Math.min(s.y, w.y), w: Math.abs(w.x - s.x), h: Math.abs(w.y - s.y) };
      marqueeBox.current = box;
      setMarquee(box);
      return;
    }
  };

  // ── Pointer up ──
  const onUp = () => {
    if (mode.current === 'draw' && drawShapeRef.current) {
      const s = drawShapeRef.current as any;
      // Click (no drag) on a shape tool -> seed default size
      if (s._seed && (!s.width || !s.height || (s.width < 4 && s.height < 4))) {
        s.width = s._seed.w; s.height = s._seed.h;
      }
      delete s._seed;
      const valid = s.type === 'path' ? (s.points?.length ?? 0) > 1
        : (s.type === 'line' || s.type === 'arrow') ? Math.hypot((s.points![1].x - s.points![0].x), (s.points![1].y - s.points![0].y)) > 3
        : (s.width ?? 0) > 2 && (s.height ?? 0) > 2;
      const base = shapes.filter(p => p.id !== s.id);
      if (valid) { commit([...base, s]); setTool('select'); setSelectedIds(new Set([s.id])); }
      else setShapes(base);
      drawShapeRef.current = null;
    } else if (mode.current === 'move' || mode.current === 'resize') {
      if (movedRef.current || mode.current === 'resize') commit(shapesRef.current);
      setGuides({ v: [], h: [] });
    } else if (mode.current === 'marquee') {
      const mq = marqueeBox.current;
      if (mq && (mq.w > 2 || mq.h > 2)) {
        const inBox = shapes.filter(s => {
          const b = shapeBounds(s);
          // Select any shape the marquee touches (intersection), not just fully enclosed
          return b.x <= mq.x + mq.w && b.x + b.w >= mq.x && b.y <= mq.y + mq.h && b.y + b.h >= mq.y;
        }).map(s => s.id);
        setSelectedIds(expandGroups(new Set(inBox)));
      }
      marqueeBox.current = null;
      setMarquee(null);
    }
    mode.current = 'idle'; activeHandle.current = null; endpointDrag.current = null;
  };

  const onDouble = (e: React.MouseEvent) => {
    const w = toWorld(...(Object.values(getPos(e)) as [number, number]));
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (BOX_TYPES.includes(s.type) && hitShape(s, w, scale)) {
        setSelectedIds(new Set([s.id])); openEditor(s); return;
      }
    }
  };

  // ── Operations ──
  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return;
    commit(shapes.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }, [shapes, selectedIds, commit]);

  const copySelected = useCallback(() => {
    clipboard.current = selectedShapes().map(s => JSON.parse(JSON.stringify(s)));
  }, [shapes, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard.current.length) return;
    const idMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const clones = clipboard.current.map(s => {
      const nid = uid(); idMap.set(s.id, nid);
      let ng = s.groupId;
      if (s.groupId) { if (!groupMap.has(s.groupId)) groupMap.set(s.groupId, uid()); ng = groupMap.get(s.groupId)!; }
      const off = 16;
      const moved = s.points
        ? { ...s, id: nid, groupId: ng, points: s.points.map(p => ({ x: p.x + off, y: p.y + off })) }
        : { ...s, id: nid, groupId: ng, x: (s.x ?? 0) + off, y: (s.y ?? 0) + off };
      return moved;
    });
    commit([...shapes, ...clones]);
    setSelectedIds(new Set(clones.map(c => c.id)));
  }, [shapes, commit]);

  const duplicateSelected = useCallback(() => { copySelected(); pasteClipboard(); }, [copySelected, pasteClipboard]);

  const align = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const sel = selectedShapes();
    if (sel.length < 2) return;
    const gb = boundsOfMany(sel)!;
    const next = shapes.map(s => {
      if (!selectedIds.has(s.id)) return s;
      const b = shapeBounds(s);
      let dx = 0, dy = 0;
      if (kind === 'left') dx = gb.x - b.x;
      else if (kind === 'right') dx = (gb.x + gb.w) - (b.x + b.w);
      else if (kind === 'hcenter') dx = (gb.x + gb.w / 2) - (b.x + b.w / 2);
      else if (kind === 'top') dy = gb.y - b.y;
      else if (kind === 'bottom') dy = (gb.y + gb.h) - (b.y + b.h);
      else if (kind === 'vcenter') dy = (gb.y + gb.h / 2) - (b.y + b.h / 2);
      if (s.points) return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      return { ...s, x: (s.x ?? 0) + dx, y: (s.y ?? 0) + dy };
    });
    commit(next);
  };

  const layer = (dir: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedIds.size) return;
    const sel = shapes.filter(s => selectedIds.has(s.id));
    const rest = shapes.filter(s => !selectedIds.has(s.id));
    if (dir === 'front') commit([...rest, ...sel]);
    else if (dir === 'back') commit([...sel, ...rest]);
    else {
      // forward/backward one step
      const arr = [...shapes];
      const idxs = arr.map((s, i) => selectedIds.has(s.id) ? i : -1).filter(i => i >= 0);
      if (dir === 'forward') {
        for (let k = idxs.length - 1; k >= 0; k--) { const i = idxs[k]; if (i < arr.length - 1 && !selectedIds.has(arr[i + 1].id)) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; } }
      } else {
        for (let k = 0; k < idxs.length; k++) { const i = idxs[k]; if (i > 0 && !selectedIds.has(arr[i - 1].id)) { [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; } }
      }
      commit(arr);
    }
  };

  const groupSelected = () => {
    if (selectedIds.size < 2) return;
    const gid = uid();
    commit(shapes.map(s => selectedIds.has(s.id) ? { ...s, groupId: gid } : s));
  };
  const ungroupSelected = () => {
    if (!selectedIds.size) return;
    commit(shapes.map(s => selectedIds.has(s.id) ? { ...s, groupId: null } : s));
  };

  // Apply style changes live to selection
  const applyStyle = (patch: Partial<CanvasShape>) => {
    if (!selectedIds.size) return;
    commit(shapes.map(s => selectedIds.has(s.id) ? { ...s, ...patch } : s));
  };

  // One-click color: fills solid shapes, colors the stroke of lines/arrows/pen/text.
  const applyColor = (c: string) => {
    setColor(c);
    if (!selectedIds.size) return;
    const solid = new Set(['rect', 'ellipse', 'diamond']);
    commit(shapes.map(s => {
      if (!selectedIds.has(s.id)) return s;
      if (solid.has(s.type)) return { ...s, fill: c, color: c };
      if (s.type === 'sticky') return { ...s, fill: c };
      return { ...s, color: c }; // line, arrow, path, text
    }));
  };

  const exportPng = () => {
    const b = boundsOfMany(shapes) ?? { x: 0, y: 0, w: 800, h: 600 };
    const pad = 40;
    const tmp = document.createElement('canvas');
    tmp.width = (b.w + pad * 2); tmp.height = (b.h + pad * 2);
    const c = tmp.getContext('2d')!;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, tmp.width, tmp.height);
    shapes.forEach(s => drawShape(c, s, -b.x + pad, -b.y + pad, 1));
    const a = document.createElement('a');
    a.download = `${board.name || 'canvas'}.png`; a.href = tmp.toDataURL('image/png'); a.click();
  };

  const clearAll = () => { if (window.confirm('Clear the whole canvas?')) { commit([]); setSelectedIds(new Set()); } };

  // Place an image (data URL) onto the canvas, scaled to fit and centered in view.
  const addImage = (src: string) => {
    const probe = new Image();
    probe.onload = () => {
      const cvEl = canvasRef.current;
      const viewW = cvEl?.width ?? 800;
      const viewH = cvEl?.height ?? 600;
      // Fit within ~60% of the visible area (in world units)
      const maxW = (viewW * 0.6) / scaleRef.current;
      const maxH = (viewH * 0.6) / scaleRef.current;
      let w = probe.naturalWidth || 400;
      let h = probe.naturalHeight || 300;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      w = Math.max(40, w * ratio); h = Math.max(40, h * ratio);
      // Center in the current viewport, in world coords
      const cx = (viewW / 2 - offsetRef.current.x) / scaleRef.current;
      const cy = (viewH / 2 - offsetRef.current.y) / scaleRef.current;
      const shape: CanvasShape = {
        id: uid(), type: 'image', x: cx - w / 2, y: cy - h / 2, width: w, height: h,
        src, color: '#000', lineWidth: 1, groupId: null,
      };
      imageCache.set(src, probe); // reuse the already-decoded image
      commit([...shapesRef.current, shape]);
      setTool('select');
      setSelectedIds(new Set([shape.id]));
    };
    probe.src = src;
  };

  const addImageFromFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') addImage(reader.result); };
    reader.readAsDataURL(file);
  };

  const onImportClick = () => imageInputRef.current?.click();

  // ── Keyboard ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const cmd = e.ctrlKey || e.metaKey;
      if (cmd && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (cmd && e.key === 'y') { e.preventDefault(); redo(); return; }
      if (cmd && e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (cmd && e.key === 'x') { e.preventDefault(); copySelected(); deleteSelected(); return; }
      if (cmd && e.key === 'v') { e.preventDefault(); pasteClipboard(); return; }
      if (cmd && e.key === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (cmd && e.key === 'a') { e.preventDefault(); setSelectedIds(new Set(shapes.map(s => s.id))); return; }
      if (cmd && e.key === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelected() : groupSelected(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedIds.size) { e.preventDefault(); deleteSelected(); } return; }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setTool('select'); return; }
      if (cmd || e.altKey) return;
      const map: Record<string, Tool> = { v: 'select', h: 'pan', p: 'pen', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', s: 'sticky' };
      if (map[e.key]) setTool(map[e.key]);
      // Arrow-key nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.size) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(shapes.map(s => selectedIds.has(s.id)
          ? (s.points ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : { ...s, x: (s.x ?? 0) + dx, y: (s.y ?? 0) + dy })
          : s));
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [shapes, selectedIds, undo, redo, copySelected, pasteClipboard, duplicateSelected, deleteSelected, commit]);

  // Paste a screenshot / copied image from the clipboard onto the canvas
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); addImageFromFile(file); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line

  // ── UI ──
  const TOOL_GROUPS: { heading: string; tools: { id: Tool; icon: React.ReactNode; label: string; key: string }[] }[] = [
    { heading: 'Cursor', tools: [
      { id: 'select', icon: <MousePointer2 size={20} />, label: 'Select', key: 'V' },
      { id: 'pan', icon: <Hand size={20} />, label: 'Pan', key: 'H' },
    ]},
    { heading: 'Draw', tools: [
      { id: 'pen', icon: <Pen size={20} />, label: 'Pen', key: 'P' },
      { id: 'line', icon: <Minus size={20} />, label: 'Line', key: 'L' },
      { id: 'arrow', icon: <ArrowRight size={20} />, label: 'Arrow', key: 'A' },
    ]},
    { heading: 'Shapes', tools: [
      { id: 'rect', icon: <Square size={20} />, label: 'Rectangle', key: 'R' },
      { id: 'roundRect', icon: <SquareRoundCorner size={20} />, label: 'Rounded', key: '' },
      { id: 'ellipse', icon: <Circle size={20} />, label: 'Ellipse', key: 'O' },
      { id: 'diamond', icon: <Diamond size={20} />, label: 'Decision', key: 'D' },
      { id: 'parallelogram', icon: <RectangleHorizontal size={20} className="-skew-x-12" />, label: 'Data', key: '' },
      { id: 'cylinder', icon: <Cylinder size={20} />, label: 'Database', key: '' },
    ]},
    { heading: 'Content', tools: [
      { id: 'text', icon: <Type size={20} />, label: 'Text', key: 'T' },
      { id: 'sticky', icon: <StickyNote size={20} />, label: 'Sticky', key: 'S' },
    ]},
  ];
  const SWATCHES = ['#1e293b', '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
  const FILLS = ['none', '#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#dbeafe', '#ede9fe', '#fce7f3', '#f1f5f9', '#ffffff'];

  const hasSel = selectedIds.size > 0;
  const multiSel = selectedIds.size > 1;
  const editingShape = editor ? shapes.find(s => s.id === editor.id) : null;
  const selHasBox = selectedShapes().some(s => BOX_TYPES.includes(s.type));
  const TEXT_TYPES = ['text', 'sticky', 'rect', 'roundRect', 'ellipse', 'diamond', 'parallelogram', 'cylinder'];
  const selHasText = selectedShapes().some(s => TEXT_TYPES.includes(s.type));
  const selHasLine = selectedShapes().some(s => s.type === 'line' || s.type === 'arrow');

  // Toggle a boolean text/line style on the selection (or set the default for new shapes)
  const toggleTextStyle = (key: 'bold' | 'italic' | 'underline') => {
    const sel = selectedShapes();
    const next = !(sel.length ? sel.every(s => s[key]) : false);
    applyStyle({ [key]: next } as Partial<CanvasShape>);
  };
  const toggleLineStyle = (key: 'dash' | 'elbow') => {
    const sel = selectedShapes();
    const next = !(sel.length ? sel.every(s => s[key]) : false);
    applyStyle({ [key]: next } as Partial<CanvasShape>);
  };
  const styleActive = (key: 'bold' | 'italic' | 'underline' | 'dash' | 'elbow') => {
    const sel = selectedShapes();
    return sel.length > 0 && sel.every(s => (s as any)[key]);
  };

  // Toggle "- " bullet prefixes on every line of the selected text shapes
  const toggleBullets = () => {
    const sel = selectedShapes().filter(s => TEXT_TYPES.includes(s.type));
    if (!sel.length) return;
    // If every non-empty line across the selection already starts with a bullet, strip them; else add.
    const allBulleted = sel.every(s =>
      (s.text ?? '').split('\n').filter(l => l.trim()).every(l => /^\s*[-*•]\s+/.test(l))
    );
    const apply = (t: string) => t.split('\n').map(line => {
      if (!line.trim()) return line;
      if (allBulleted) return line.replace(/^(\s*)[-*•]\s+/, '$1');
      return /^\s*[-*•]\s+/.test(line) ? line : `- ${line}`;
    }).join('\n');
    commit(shapes.map(s => selectedIds.has(s.id) && TEXT_TYPES.includes(s.type) ? { ...s, text: apply(s.text ?? '') } : s));
  };

  // Small labelled button used across the property bar
  const Tip: React.FC<{ label: string; onClick?: () => void; disabled?: boolean; active?: boolean; danger?: boolean; children: React.ReactNode }> =
    ({ label, onClick, disabled, active, danger, children }) => (
      <button onClick={onClick} disabled={disabled} title={label}
        className={`group relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
          active ? 'bg-blue-600 text-white' : danger ? 'text-slate-500 hover:bg-red-50 hover:text-red-500' : 'text-slate-600 hover:bg-slate-100'
        }`}>
        {children}
        <span className="pointer-events-none absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity z-30">{label}</span>
      </button>
    );

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Top property bar — changes with context */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-white flex-wrap min-h-[52px]">
        {/* Stroke color */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 w-9">Color</span>
          <div className="flex items-center gap-1">
            {SWATCHES.map(c => (
              <button key={c} onClick={() => applyColor(c)}
                title={c}
                className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent' : 'border-slate-200'}`}
                style={{ background: c }} />
            ))}
            <label className="w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400" title="Custom color">
              <Palette size={13} className="text-slate-400" />
              <input type="color" value={color} onChange={e => applyColor(e.target.value)} className="sr-only" />
            </label>
          </div>
        </div>

        <div className="w-px h-7 bg-slate-200 mx-2" />

        {/* Fill color */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 w-6">Fill</span>
          <div className="flex items-center gap-1">
            {FILLS.map(f => (
              <button key={f} onClick={() => { setFill(f); applyStyle({ fill: f }); }}
                title={f === 'none' ? 'No fill' : f}
                className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 relative overflow-hidden ${fill === f ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent' : 'border-slate-200'}`}
                style={{ background: f === 'none' ? '#fff' : f }}>
                {f === 'none' && <span className="absolute inset-0 flex items-center justify-center"><span className="w-[140%] h-px bg-red-400 rotate-45" /></span>}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-7 bg-slate-200 mx-2" />

        {/* Stroke width */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Weight</span>
          <input type="range" min={1} max={16} value={lineWidth}
            onChange={e => { const v = +e.target.value; setLineWidth(v); applyStyle({ lineWidth: v }); }}
            className="w-20 accent-blue-600" />
          <span className="text-[11px] text-slate-500 w-4 tabular-nums">{lineWidth}</span>
        </div>

        {(tool === 'text' || tool === 'sticky' || selHasBox) && (
          <>
            <div className="w-px h-7 bg-slate-200 mx-2" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400">Font</span>
              <input type="range" min={10} max={64} value={fontSize}
                onChange={e => { const v = +e.target.value; setFontSize(v); applyStyle({ fontSize: v }); }}
                className="w-20 accent-blue-600" />
              <span className="text-[11px] text-slate-500 w-6 tabular-nums">{fontSize}px</span>
            </div>
          </>
        )}

        {(tool === 'text' || tool === 'sticky' || selHasText) && (
          <>
            <div className="w-px h-7 bg-slate-200 mx-2" />
            <div className="flex items-center gap-0.5">
              <Tip label="Bold" onClick={() => toggleTextStyle('bold')} active={styleActive('bold')}><Bold size={16} /></Tip>
              <Tip label="Italic" onClick={() => toggleTextStyle('italic')} active={styleActive('italic')}><Italic size={16} /></Tip>
              <Tip label="Underline" onClick={() => toggleTextStyle('underline')} active={styleActive('underline')}><Underline size={16} /></Tip>
              <Tip label="Bullet list" onClick={toggleBullets}><List size={16} /></Tip>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <Tip label="Align left" onClick={() => applyStyle({ align: 'left' })}><AlignLeft size={16} /></Tip>
              <Tip label="Align center" onClick={() => applyStyle({ align: 'center' })}><AlignCenter size={16} /></Tip>
              <Tip label="Align right" onClick={() => applyStyle({ align: 'right' })}><AlignRight size={16} /></Tip>
            </div>
          </>
        )}

        {selHasLine && (
          <>
            <div className="w-px h-7 bg-slate-200 mx-2" />
            <div className="flex items-center gap-0.5">
              <Tip label="Dashed line" onClick={() => toggleLineStyle('dash')} active={styleActive('dash')}>
                <span className="text-[15px] font-bold tracking-tighter">┅</span>
              </Tip>
              <Tip label="Elbow (right-angle) connector" onClick={() => toggleLineStyle('elbow')} active={styleActive('elbow')}>
                <Spline size={16} />
              </Tip>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Right-side global actions */}
        <div className="flex items-center gap-0.5">
          <Tip label="Undo (Ctrl+Z)" onClick={undo} disabled={histIdx <= 0}><Undo2 size={17} /></Tip>
          <Tip label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={histIdx >= history.length - 1}><Redo2 size={17} /></Tip>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <Tip label="Toggle grid" onClick={() => setShowGrid(g => !g)} active={showGrid}><Grid3x3 size={17} /></Tip>
          <Tip label="Snap to grid" onClick={() => setSnap(s => !s)} active={snap}><Magnet size={17} /></Tip>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <Tip label="Import image" onClick={onImportClick}><ImagePlus size={17} /></Tip>
          <Tip label="Export PNG" onClick={exportPng}><Download size={17} /></Tip>
          <Tip label="Clear canvas" onClick={clearAll} danger><Trash2 size={17} /></Tip>
        </div>
      </div>

      {/* Body: left tool rail + canvas */}
      <div className="flex flex-1 min-h-0">
        {/* Left vertical tool rail (Canva-style) */}
        <div className="w-[76px] flex-shrink-0 border-r border-slate-100 bg-slate-50/60 overflow-y-auto py-2">
          {TOOL_GROUPS.map(group => (
            <div key={group.heading} className="px-2 pb-2 mb-1">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-300 px-1 pb-1">{group.heading}</div>
              <div className="grid grid-cols-1 gap-1">
                {group.tools.map(t => (
                  <button key={t.id} onClick={() => setTool(t.id)}
                    className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
                      tool === t.id ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-500 hover:bg-white hover:shadow-sm'
                    }`}>
                    {t.icon}
                    <span className="text-[9px] font-medium leading-none">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Canvas area */}
        <div className="relative flex-1 min-h-0">
          <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-white"
            style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer?.files?.[0];
              if (file) addImageFromFile(file);
            }}>
            <canvas ref={canvasRef}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onDoubleClick={onDouble}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
              onWheel={e => {
                const c = canvasRef.current!.getBoundingClientRect();
                const mx = e.clientX - c.left, my = e.clientY - c.top;
                if (e.ctrlKey || e.metaKey) {
                  const d = e.deltaY > 0 ? 0.9 : 1.1;
                  setScale(s => Math.max(0.15, Math.min(5, s * d)));
                  setOffset(o => ({ x: mx - (mx - o.x) * d, y: my - (my - o.y) * d }));
                } else {
                  setOffset(o => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }));
                }
              }}
              style={{ display: 'block', width: '100%', height: '100%' }} />

            <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) addImageFromFile(f); e.target.value = ''; }} />

            {/* Inline text editor */}
            {editor && editingShape && (
              <textarea ref={editorRef} value={editorVal}
                onChange={e => setEditorVal(e.target.value)}
                onKeyDown={e => {
                  // Enter = newline (natural for multi-line & bullets). Ctrl/Cmd+Enter or Esc/blur commits.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditor(); }
                  if (e.key === 'Escape') { e.preventDefault(); commitEditor(); }
                }}
                onBlur={commitEditor}
                className="absolute z-10 resize-none outline-none rounded"
                style={{
                  left: editor.screenX, top: editor.screenY,
                  width: Math.max(80, (shapeBounds(editingShape).w) * scale),
                  height: Math.max(28, (shapeBounds(editingShape).h) * scale),
                  fontSize: (editingShape.fontSize ?? 16) * scale,
                  fontFamily: 'Inter, sans-serif',
                  color: editingShape.type === 'sticky' ? '#334155' : editingShape.color,
                  background: editingShape.type === 'sticky' ? '#fef08a' : 'rgba(255,255,255,0.95)',
                  border: '2px solid #3b82f6',
                  padding: editingShape.type === 'text' ? '2px 4px' : '6px',
                  textAlign: (editingShape.type === 'text' || editingShape.type === 'sticky') ? 'left' : 'center',
                  lineHeight: 1.3,
                }} />
            )}

            {/* Floating selection toolbar (overlay — does not resize the canvas) */}
            {hasSel && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-2 py-1 shadow-md flex-wrap max-w-[92%] z-20">
                <span className="text-[11px] font-semibold text-blue-600 mr-1 px-2 py-0.5 bg-blue-100 rounded-full whitespace-nowrap">{selectedIds.size} selected</span>
                {!multiSel && selHasBox && (
                  <button onClick={() => openEditor(selectedShapes()[0])}
                    className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap">
                    <Edit2 size={13} /> Edit text
                  </button>
                )}
                <Tip label="Duplicate (Ctrl+D)" onClick={duplicateSelected}><CopyPlus size={16} /></Tip>
                <Tip label="Copy (Ctrl+C)" onClick={copySelected}><Copy size={16} /></Tip>
                <Tip label="Paste (Ctrl+V)" onClick={pasteClipboard}><Clipboard size={16} /></Tip>
                <div className="w-px h-6 bg-slate-200 mx-0.5" />
                <Tip label="Align left" onClick={() => align('left')} disabled={!multiSel}><AlignHorizontalJustifyStart size={16} /></Tip>
                <Tip label="Align center" onClick={() => align('hcenter')} disabled={!multiSel}><AlignHorizontalJustifyCenter size={16} /></Tip>
                <Tip label="Align right" onClick={() => align('right')} disabled={!multiSel}><AlignHorizontalJustifyEnd size={16} /></Tip>
                <Tip label="Align top" onClick={() => align('top')} disabled={!multiSel}><AlignVerticalJustifyStart size={16} /></Tip>
                <Tip label="Align middle" onClick={() => align('vcenter')} disabled={!multiSel}><AlignVerticalJustifyCenter size={16} /></Tip>
                <Tip label="Align bottom" onClick={() => align('bottom')} disabled={!multiSel}><AlignVerticalJustifyEnd size={16} /></Tip>
                <div className="w-px h-6 bg-slate-200 mx-0.5" />
                <Tip label="Bring to front" onClick={() => layer('front')}><BringToFront size={16} /></Tip>
                <Tip label="Send to back" onClick={() => layer('back')}><SendToBack size={16} /></Tip>
                <div className="w-px h-6 bg-slate-200 mx-0.5" />
                <Tip label="Group (Ctrl+G)" onClick={groupSelected} disabled={!multiSel}><Group size={16} /></Tip>
                <Tip label="Ungroup (Ctrl+Shift+G)" onClick={ungroupSelected}><Ungroup size={16} /></Tip>
                <div className="w-px h-6 bg-slate-200 mx-0.5" />
                <Tip label="Delete (Del)" onClick={deleteSelected} danger><Trash2 size={16} /></Tip>
              </div>
            )}

            {/* Floating zoom controls */}
            <div className="absolute bottom-4 left-4 flex items-center gap-0.5 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-1 py-1 shadow-md">
              <Tip label="Zoom out" onClick={() => setScale(s => Math.max(0.15, s - 0.1))}><ZoomOut size={16} /></Tip>
              <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
                className="text-xs font-medium text-slate-600 w-12 text-center tabular-nums hover:text-slate-900" title="Reset view">
                {Math.round(scale * 100)}%
              </button>
              <Tip label="Zoom in" onClick={() => setScale(s => Math.min(5, s + 0.1))}><ZoomIn size={16} /></Tip>
              <div className="w-px h-5 bg-slate-200 mx-0.5" />
              <Tip label="Fit / reset view" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 size={16} /></Tip>
            </div>

            {!shapes.length && tool === 'select' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-sm text-slate-400 font-medium">Pick a tool on the left to start</p>
                  <p className="text-xs text-slate-300 mt-1">Drag to draw · double-click a shape to add text</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
// ── Main Page ─────────────────────────────────────────────────────────────────
export const CanvasPage: React.FC = () => {
  const [boards,      setBoards]      = useState<CanvasBoard[]>([]);
  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [renamingId,  setRenamingId]  = useState<string | null>(null);
  const [renameVal,   setRenameVal]   = useState('');
  const saveTimeout = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('canvases').select('*').order('updated_at', { ascending: false });
      if (data && data.length > 0) {
        const bs = data.map((r: any) => ({ ...r, shapes: r.shapes ?? [] }));
        setBoards(bs); setActiveId(bs[0].id);
      } else {
        // Create first canvas
        const board: CanvasBoard = { id: uid(), name: 'Untitled Canvas', shapes: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await supabase.from('canvases').insert(board);
        setBoards([board]); setActiveId(board.id);
      }
      setLoading(false);
    })();
  }, []);

  const newBoard = async () => {
    const board: CanvasBoard = { id: uid(), name: `Canvas ${boards.length + 1}`, shapes: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await supabase.from('canvases').insert(board);
    setBoards(prev => [board, ...prev]);
    setActiveId(board.id);
  };

  const newFromTemplate = async () => {
    const board: CanvasBoard = { id: uid(), name: 'Funnel Analysis', shapes: buildFunnelTemplate(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await supabase.from('canvases').insert(board);
    setBoards(prev => [board, ...prev]);
    setActiveId(board.id);
  };

  const deleteBoard = async (id: string) => {
    if (!window.confirm('Delete this canvas?')) return;
    await supabase.from('canvases').delete().eq('id', id);
    setBoards(prev => {
      const next = prev.filter(b => b.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const renameBoard = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from('canvases').update({ name: name.trim() }).eq('id', id);
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name: name.trim() } : b));
    setRenamingId(null);
  };

  const saveShapes = useCallback((id: string, shapes: CanvasShape[]) => {
    clearTimeout(saveTimeout.current[id]);
    saveTimeout.current[id] = setTimeout(async () => {
      await supabase.from('canvases').update({ shapes, updated_at: new Date().toISOString() }).eq('id', id);
      setBoards(prev => prev.map(b => b.id === id ? { ...b, shapes } : b));
    }, 800);
  }, []);

  const activeBoard = boards.find(b => b.id === activeId);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
      <span className="text-sm text-slate-400">Loading canvases...</span>
    </div>
  );

  return (
    <div className="w-full" style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Slim single-row header: board tabs + New button */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
          {boards.map(b => (
            <div key={b.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] font-medium flex-shrink-0 transition-all cursor-pointer ${
                activeId === b.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setActiveId(b.id)}>
            {renamingId === b.id ? (
              <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') renameBoard(b.id, renameVal); if (e.key === 'Escape') setRenamingId(null); }}
                onBlur={() => renameBoard(b.id, renameVal)}
                className="bg-transparent outline-none w-24 text-sm"
                onClick={e => e.stopPropagation()}/>
            ) : (
              <span className="truncate max-w-32">{b.name}</span>
            )}
            <div className="flex items-center gap-0.5 ml-1">
              <button onClick={e => { e.stopPropagation(); setRenamingId(b.id); setRenameVal(b.name); }}
                className={`p-0.5 rounded hover:bg-black/10 ${activeId === b.id ? 'text-blue-200 hover:text-white' : 'text-slate-400'}`}>
                <Edit2 size={11}/>
              </button>
              {boards.length > 1 && (
                <button onClick={e => { e.stopPropagation(); deleteBoard(b.id); }}
                  className={`p-0.5 rounded hover:bg-red-100 ${activeId === b.id ? 'text-blue-200 hover:text-red-500' : 'text-slate-400 hover:text-red-500'}`}>
                  <X size={11}/>
                </button>
              )}
            </div>
          </div>
        ))}
        </div>
        <button onClick={newFromTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 border border-slate-200 text-[13px] font-medium rounded-lg hover:border-slate-300 transition-colors flex-shrink-0">
          <Plus size={14}/> Funnel template
        </button>
        <button onClick={newBoard}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[13px] font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0">
          <Plus size={14}/> New
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeBoard && (
          <CanvasEditor key={activeBoard.id} board={activeBoard} onSave={shapes => saveShapes(activeBoard.id, shapes)}/>
        )}
      </div>
    </div>
  );
};
