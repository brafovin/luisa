'use strict';

/* ------------------------------------------------------------------ *
 *  Software-3D-Renderer für die Ego-Perspektive.
 *  Kein WebGL: alles wird als perspektivisch projiziertes Polygon auf
 *  ein 2D-Canvas gezeichnet (Maler-Algorithmus, Rückseiten-Culling).
 * ------------------------------------------------------------------ */

const FOV  = 76 * Math.PI / 180;   // Standardblickfeld
let viewFov = FOV;                 // aktuell wirksames Blickfeld (Zoom im Zielfernrohr)
function setFov(f) { viewFov = f; }
function currentFov() { return viewFov; }
const NEAR = 1.4;                       // Nahebene
const VIEW_FAR = 1250;                  // Sichtweite
const FOG_RGB = [96, 92, 128];          // Dunstfarbe am Horizont

/** Kamera: Weltposition, Augenhöhe, Gier- und Nickwinkel. */
const cam = { x: 0, y: 0, z: 17, yaw: 0, pitch: 0, roll: 0 };

let F = 600, HW = 0, HH = 0;            // Brennweite, halbe Bildmaße
let sy_ = 0, cy_ = 1, sp_ = 0, cp_ = 1; // Sinus/Cosinus von yaw und pitch
let horizonY = 0;

/* ------------------------- Farbwerkzeuge ------------------------- */

const _rgbCache = new Map();
function rgb(hex) {
  let v = _rgbCache.get(hex);
  if (!v) {
    v = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    _rgbCache.set(hex, v);
  }
  return v;
}

/** Fläche einfärben: Grundfarbe × Lichtanteil, mit Entfernungsdunst. */
function shade(c, light, d, alpha) {
  const t = clamp((d - 300) / 1000, 0, 0.72);
  const r = Math.round(lerp(c[0] * light, FOG_RGB[0], t));
  const g = Math.round(lerp(c[1] * light, FOG_RGB[1], t));
  const b = Math.round(lerp(c[2] * light, FOG_RGB[2], t));
  return alpha === undefined
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------ Projektionskern ------------------------ */

function beginFrame(vw, vh) {
  HW = vw / 2; HH = vh / 2;
  F = HW / Math.tan(viewFov / 2);
  sy_ = Math.sin(cam.yaw); cy_ = Math.cos(cam.yaw);
  sp_ = Math.sin(cam.pitch); cp_ = Math.cos(cam.pitch);
  horizonY = HH + Math.tan(cam.pitch) * F;
}

// Arbeitspuffer, damit pro Frame nichts alloziert wird
const _cx = new Float64Array(24), _cy = new Float64Array(24), _cd = new Float64Array(24);
const _qx = new Float64Array(32), _qy = new Float64Array(32), _qd = new Float64Array(32);

/** Weltpunkt in Kamerakoordinaten (x = rechts, y = oben, d = Tiefe). */
function toCam(px, py, pz, i) {
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
  const right = -dx * sy_ + dy * cy_;
  const fwd = dx * cy_ + dy * sy_;
  _cx[i] = right;
  _cy[i] = dz * cp_ - fwd * sp_;
  _cd[i] = fwd * cp_ + dz * sp_;
}

/**
 * Polygon zeichnen. pts = [x,y,z, x,y,z, ...] in Weltkoordinaten.
 * Schneidet an der Nahebene ab und projiziert dann perspektivisch.
 */
function poly(ctx, pts, fill, stroke) {
  const n = pts.length / 3;
  for (let i = 0; i < n; i++) toCam(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], i);

  // Sutherland-Hodgman gegen die Nahebene
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const din = _cd[i] >= NEAR, djn = _cd[j] >= NEAR;
    if (din) { _qx[m] = _cx[i]; _qy[m] = _cy[i]; _qd[m] = _cd[i]; m++; }
    if (din !== djn) {
      const t = (NEAR - _cd[i]) / (_cd[j] - _cd[i]);
      _qx[m] = _cx[i] + (_cx[j] - _cx[i]) * t;
      _qy[m] = _cy[i] + (_cy[j] - _cy[i]) * t;
      _qd[m] = NEAR; m++;
    }
  }
  if (m < 3) return false;

  ctx.beginPath();
  for (let i = 0; i < m; i++) {
    const s = F / _qd[i];
    const x = HW + _qx[i] * s, y = HH - _qy[i] * s;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  return true;
}

/** Bildschirmposition eines Weltpunkts, oder null hinter der Kamera. */
function project(px, py, pz) {
  toCam(px, py, pz, 0);
  if (_cd[0] < NEAR) return null;
  const s = F / _cd[0];
  return { x: HW + _cx[0] * s, y: HH - _cy[0] * s, d: _cd[0], s };
}

/** Liegt der Punkt grob im Sichtkegel? */
function visible(px, py, radius) {
  const dx = px - cam.x, dy = py - cam.y;
  const fwd = dx * cy_ + dy * sy_;
  if (fwd < -radius || fwd > VIEW_FAR + radius) return false;
  const side = Math.abs(-dx * sy_ + dy * cy_);
  return side < (fwd + radius) * (HW / F) + radius + 60;
}

/* ---------------------------- Baukörper ---------------------------- */

const _box = new Float64Array(12);

/** Achsenparalleler Quader: nur sichtbare Seiten, Rückseiten entfallen. */
function drawBox(ctx, x0, y0, x1, y1, z0, z1, c, d, alpha) {
  const b = _box;
  if (cam.x < x0) {                                   // Westwand
    b[0]=x0;b[1]=y0;b[2]=z0; b[3]=x0;b[4]=y1;b[5]=z0; b[6]=x0;b[7]=y1;b[8]=z1; b[9]=x0;b[10]=y0;b[11]=z1;
    poly(ctx, b, shade(c, 0.72, d, alpha));
  } else if (cam.x > x1) {                            // Ostwand
    b[0]=x1;b[1]=y0;b[2]=z0; b[3]=x1;b[4]=y1;b[5]=z0; b[6]=x1;b[7]=y1;b[8]=z1; b[9]=x1;b[10]=y0;b[11]=z1;
    poly(ctx, b, shade(c, 1.0, d, alpha));
  }
  if (cam.y < y0) {                                   // Nordwand
    b[0]=x0;b[1]=y0;b[2]=z0; b[3]=x1;b[4]=y0;b[5]=z0; b[6]=x1;b[7]=y0;b[8]=z1; b[9]=x0;b[10]=y0;b[11]=z1;
    poly(ctx, b, shade(c, 0.88, d, alpha));
  } else if (cam.y > y1) {                            // Südwand
    b[0]=x0;b[1]=y1;b[2]=z0; b[3]=x1;b[4]=y1;b[5]=z0; b[6]=x1;b[7]=y1;b[8]=z1; b[9]=x0;b[10]=y1;b[11]=z1;
    poly(ctx, b, shade(c, 0.62, d, alpha));
  }
  if (cam.z > z1) {                                   // Dach
    b[0]=x0;b[1]=y0;b[2]=z1; b[3]=x1;b[4]=y0;b[5]=z1; b[6]=x1;b[7]=y1;b[8]=z1; b[9]=x0;b[10]=y1;b[11]=z1;
    poly(ctx, b, shade(c, 1.18, d, alpha));
  } else if (cam.z < z0) {                            // Unterseite (z. B. Auto in der Luft)
    b[0]=x0;b[1]=y0;b[2]=z0; b[3]=x1;b[4]=y0;b[5]=z0; b[6]=x1;b[7]=y1;b[8]=z0; b[9]=x0;b[10]=y1;b[11]=z0;
    poly(ctx, b, shade(c, 0.4, d, alpha));
  }
}

/** Gedrehte Kiste (für Autos) - Grundfläche als Rechteck um (cx,cy). */
const _rot = new Float64Array(12);
function drawRotBox(ctx, cx, cy, ang, w, l, z0, z1, c, d, topColor) {
  const co = Math.cos(ang), si = Math.sin(ang);
  const hx = l / 2, hy = w / 2;
  // Eckpunkte gegen den Uhrzeigersinn
  const px = [cx + co * hx - si * hy, cx + co * hx + si * hy, cx - co * hx + si * hy, cx - co * hx - si * hy];
  const py = [cy + si * hx + co * hy, cy + si * hx - co * hy, cy - si * hx - co * hy, cy - si * hx + co * hy];
  const r = _rot;
  // Deckel
  for (let i = 0; i < 4; i++) { r[i*3] = px[i]; r[i*3+1] = py[i]; r[i*3+2] = z1; }
  poly(ctx, r, shade(topColor || c, 1.16, d));
  // Seiten, nur die zur Kamera zeigenden
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const ex = px[j] - px[i], ey = py[j] - py[i];
    const nx = ey, ny = -ex;                                  // Außennormale
    if ((cam.x - px[i]) * nx + (cam.y - py[i]) * ny <= 0) continue;
    const light = 0.66 + 0.34 * Math.abs(nx) / (Math.hypot(nx, ny) || 1);
    r[0]=px[i];r[1]=py[i];r[2]=z0; r[3]=px[j];r[4]=py[j];r[5]=z0;
    r[6]=px[j];r[7]=py[j];r[8]=z1; r[9]=px[i];r[10]=py[i];r[11]=z1;
    poly(ctx, r, shade(c, light, d));
  }
}

/** Weiches Schattenoval auf dem Boden. */
const _sh = new Float64Array(12 * 3);
function drawShadow3(ctx, x, y, rx, ry, alpha) {
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    _sh[i*3] = x + Math.cos(a) * rx;
    _sh[i*3+1] = y + Math.sin(a) * ry;
    _sh[i*3+2] = 0.4;
  }
  poly(ctx, _sh, `rgba(0,0,0,${alpha})`);
}

/* ------------------------- Boden und Himmel ------------------------- */

const _quad = new Float64Array(12);
function groundQuad(ctx, x, y, w, h, css) {
  _quad[0]=x;   _quad[1]=y;   _quad[2]=0;
  _quad[3]=x+w; _quad[4]=y;   _quad[5]=0;
  _quad[6]=x+w; _quad[7]=y+h; _quad[8]=0;
  _quad[9]=x;   _quad[10]=y+h;_quad[11]=0;
  poly(ctx, _quad, css);
}

function drawSky(ctx, vw, vh, time) {
  const g = ctx.createLinearGradient(0, Math.min(horizonY, vh) - vh * 0.9, 0, horizonY);
  g.addColorStop(0, '#1b1450');
  g.addColorStop(0.45, '#7d3a86');
  g.addColorStop(0.78, '#e0637a');
  g.addColorStop(1, '#ffb266');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, Math.max(0, Math.min(horizonY, vh)));

  // Sonne tief über dem Horizont
  const sun = project(cam.x + Math.cos(0.7) * 4000, cam.y + Math.sin(0.7) * 4000, 260);
  if (sun && sun.y < horizonY + 40) {
    const r = 62;
    const sg = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, r * 3.4);
    sg.addColorStop(0, 'rgba(255,240,190,.95)');
    sg.addColorStop(0.22, 'rgba(255,180,110,.55)');
    sg.addColorStop(1, 'rgba(255,120,90,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, r * 3.4, 0, TAU); ctx.fill();
  }

  // Boden unter dem Horizont, am Horizont in den Dunst überblendet
  if (horizonY < vh) {
    const y0 = Math.max(0, horizonY);
    const gg = ctx.createLinearGradient(0, y0, 0, y0 + vh * 0.4);
    gg.addColorStop(0, `rgb(${FOG_RGB[0]},${FOG_RGB[1]},${FOG_RGB[2]})`);
    gg.addColorStop(1, '#3b3947');
    ctx.fillStyle = gg;
    ctx.fillRect(0, y0, vw, vh - y0);
  }
}

/** Gehsteige, Grundstücke und Fahrbahnmarkierungen als flache Polygone. */
function drawGround3(ctx) {
  const R = 560;                                    // Radius der Bodendetails
  const i0 = Math.max(0, ((cam.x - R) / CS) | 0), i1 = Math.min(GRID - 1, ((cam.x + R) / CS) | 0);
  const j0 = Math.max(0, ((cam.y - R) / CS) | 0), j1 = Math.min(GRID - 1, ((cam.y + R) / CS) | 0);

  const cells = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = World.cells[j * GRID + i];
      if (!c || !visible(c.x + c.s / 2, c.y + c.s / 2, c.s)) continue;
      cells.push(c);
    }
  }
  // von hinten nach vorn, damit angrenzende Flächen sauber überlappen
  cells.sort((a, b) => dist2(b.x + b.s / 2, b.y + b.s / 2, cam.x, cam.y) - dist2(a.x + a.s / 2, a.y + a.s / 2, cam.x, cam.y));

  for (const c of cells) {
    const d = dist(c.x + c.s / 2, c.y + c.s / 2, cam.x, cam.y);
    groundQuad(ctx, c.x, c.y, c.s, c.s, shade(rgb(c.kind === 'beach' ? '#e0c48f' : '#9d9db2'), 1, d));
    const inner = c.kind === 'park' ? '#3f8f5c' : c.kind === 'beach' ? '#eddaa8'
      : c.kind === 'lot' ? '#4a4a58' : c.kind === 'plaza' ? '#a89f95' : '#7b7b91';
    groundQuad(ctx, c.x + SW, c.y + SW, c.s - SW * 2, c.s - SW * 2, shade(rgb(inner), 1, d));
  }

  // Mittelstreifen der Straßen
  const DASH = 26, GAP = 22, STRIPE = 3.4, MR = 420;
  const marks = rgb('#ffd650');
  for (let i = Math.max(0, i0); i <= i1 + 1; i++) {
    const x = i * CS;
    if (Math.abs(x - cam.x) > MR) continue;
    const s0 = Math.floor((cam.y - MR) / (DASH + GAP)) * (DASH + GAP);
    for (let y = s0; y < cam.y + MR; y += DASH + GAP) {
      if (!visible(x, y + DASH / 2, 40)) continue;
      groundQuad(ctx, x - STRIPE / 2, y, STRIPE, DASH, shade(marks, 1, dist(x, y, cam.x, cam.y)));
    }
  }
  for (let j = Math.max(0, j0); j <= j1 + 1; j++) {
    const y = j * CS;
    if (Math.abs(y - cam.y) > MR) continue;
    const s0 = Math.floor((cam.x - MR) / (DASH + GAP)) * (DASH + GAP);
    for (let x = s0; x < cam.x + MR; x += DASH + GAP) {
      if (!visible(x + DASH / 2, y, 40)) continue;
      groundQuad(ctx, x, y - STRIPE / 2, DASH, STRIPE, shade(marks, 1, dist(x, y, cam.x, cam.y)));
    }
  }
  // Ozean südlich der Stadt, mit Brandung und Wellenbändern
  if (cam.y > WORLD - 1400) {
    const x0 = cam.x - 2600, w = 5200;
    groundQuad(ctx, x0, WORLD, w, 3000, shade(rgb('#12608c'), 1, Math.max(60, WORLD - cam.y)));
    groundQuad(ctx, x0, WORLD, w, 26, shade(rgb('#eaf6ff'), 1, Math.max(40, WORLD - cam.y)));
    for (let k = 1; k <= 7; k++) {
      const yy = WORLD + k * k * 22 + Math.sin(k * 1.7) * 8;
      groundQuad(ctx, x0 + ((k * 271) % 400), WORLD + k * k * 22, w * 0.9, 7,
        shade(rgb('#7fd4ef'), 1, Math.max(60, yy - cam.y)));
    }
  }
}

/* ----------------------------- Gebäude ----------------------------- */

const _band = new Float64Array(12);
function bandX(ctx, x, a0, a1, z0, z1, css) {
  _band[0]=x;_band[1]=a0;_band[2]=z0; _band[3]=x;_band[4]=a1;_band[5]=z0;
  _band[6]=x;_band[7]=a1;_band[8]=z1; _band[9]=x;_band[10]=a0;_band[11]=z1;
  poly(ctx, _band, css);
}
function bandY(ctx, y, a0, a1, z0, z1, css) {
  _band[0]=a0;_band[1]=y;_band[2]=z0; _band[3]=a1;_band[4]=y;_band[5]=z0;
  _band[6]=a1;_band[7]=y;_band[8]=z1; _band[9]=a0;_band[10]=y;_band[11]=z1;
  poly(ctx, _band, css);
}

const GLASS = rgb('#3b4a7a');
const NEON_H = 4;

function drawBuilding3(ctx, b, d) {
  const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, top = b.height;
  drawBox(ctx, x0, y0, x1, y1, 0, top, rgb(b.wall), d);
  if (d > 420) return;

  // Fensterbänder pro Etage, leicht vor die Wand gesetzt
  const floors = Math.min(7, Math.max(1, Math.round(top / 32)));
  const e = 0.4, inset = 5;
  const glassCss = shade(GLASS, 1, d);
  const glowCss = b.neon ? shade(rgb(b.neon), 1.25, d) : null;
  for (let f = 0; f < floors; f++) {
    const base = b.door ? 46 : 9;
    const za = base + f * (top - base) / floors, zb = za + Math.min(11, (top - base) / floors * 0.55);
    if (zb > top - 2) break;
    if (cam.x < x0) bandX(ctx, x0 - e, y0 + inset, y1 - inset, za, zb, glassCss);
    else if (cam.x > x1) bandX(ctx, x1 + e, y0 + inset, y1 - inset, za, zb, glassCss);
    if (cam.y < y0) bandY(ctx, y0 - e, x0 + inset, x1 - inset, za, zb, glassCss);
    else if (cam.y > y1) bandY(ctx, y1 + e, x0 + inset, x1 - inset, za, zb, glassCss);
  }
  // Eingangstür samt Rahmen und Lampe
  if (b.door && d < 340) {
    const dr = b.door, hw = dr.w / 2, e2 = 0.6;
    const frameC = shade(rgb('#2a2f3d'), 1, d);
    const doorC = shade(rgb('#8c5a2b'), 1, d);
    const lampC = shade(rgb('#ffd98a'), 1.3, d);
    if (dr.side === 'W' || dr.side === 'E') {
      const x = dr.side === 'W' ? b.x - e2 : b.x + b.w + e2;
      bandX(ctx, x, dr.y - hw - 4, dr.y + hw + 4, 0, dr.h + 5, frameC);
      bandX(ctx, x - dr.nx * 0.3, dr.y - hw, dr.y + hw, 0, dr.h, doorC);
      bandX(ctx, x, dr.y - 7, dr.y + 7, dr.h + 7, dr.h + 12, lampC);
    } else {
      const y = dr.side === 'N' ? b.y - e2 : b.y + b.h + e2;
      bandY(ctx, y, dr.x - hw - 4, dr.x + hw + 4, 0, dr.h + 5, frameC);
      bandY(ctx, y - dr.ny * 0.3, dr.x - hw, dr.x + hw, 0, dr.h, doorC);
      bandY(ctx, y, dr.x - 7, dr.x + 7, dr.h + 7, dr.h + 12, lampC);
    }
  }

  // Neonstreifen unter der Dachkante
  if (glowCss) {
    const za = top - NEON_H - 2, zb = top - 2;
    if (cam.x < x0) bandX(ctx, x0 - e, y0 + 2, y1 - 2, za, zb, glowCss);
    else if (cam.x > x1) bandX(ctx, x1 + e, y0 + 2, y1 - 2, za, zb, glowCss);
    if (cam.y < y0) bandY(ctx, y0 - e, x0 + 2, x1 - 2, za, zb, glowCss);
    else if (cam.y > y1) bandY(ctx, y1 + e, x0 + 2, x1 - 2, za, zb, glowCss);
  }
}

/* ------------------------------ Palmen ------------------------------ */

const PALM_TRUNK = rgb('#7a5a3a'), PALM_LEAF = rgb('#2f8f52'), PALM_LEAF2 = rgb('#48b06c');

function drawPalm3(ctx, p, d, time) {
  drawShadow3(ctx, p.x + 4, p.y + 3, 15, 11, clamp(0.3 - d * 0.0002, 0.06, 0.3));
  const lean = p.lean * 10;
  drawRotBox(ctx, p.x + lean * 0.5, p.y, 0, 5.5, 5.5, 0, p.height, PALM_TRUNK, d);
  const crown = project(p.x + lean, p.y, p.height);
  if (!crown) return;
  const s = crown.s;                                  // Pixel pro Welteinheit
  const sway = Math.sin(time * 0.0016 + p.seed * 9) * 0.12;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = shade(pass ? PALM_LEAF2 : PALM_LEAF, 1, d);
    ctx.lineWidth = Math.max(1, (pass ? 3.5 : 6) * s);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + sway;
      ctx.beginPath();
      ctx.moveTo(crown.x, crown.y);
      ctx.quadraticCurveTo(crown.x + Math.cos(a) * 13 * s, crown.y + Math.sin(a) * 9 * s - 6 * s,
        crown.x + Math.cos(a) * 26 * s, crown.y + Math.sin(a) * 17 * s + 4 * s);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

/* ------------------------------- Autos ------------------------------- */

function drawCar3(ctx, c, d, frames) {
  const col = rgb(c.color);
  drawShadow3(ctx, c.x + 3, c.y + 3, c.w * 0.62, c.w * 0.5, clamp(0.34 - c.z * 0.004 - d * 0.0002, 0.05, 0.34));
  const z0 = 3 + c.z, z1 = 17 + c.z, z2 = 28 + c.z;
  drawRotBox(ctx, c.x, c.y, c.ang, c.h + 3, c.w, z0, z1, col, d);            // Karosserie
  const cabX = c.x - Math.cos(c.ang) * 3, cabY = c.y - Math.sin(c.ang) * 3;
  drawRotBox(ctx, cabX, cabY, c.ang, c.h * 0.86, c.w * 0.52, z1, z2, rgb('#313b57'), d, col);  // Kabine
  if (c.kind === 'cop') {
    const on = ((frames / 8) | 0) % 2 === 0;
    drawRotBox(ctx, cabX, cabY, c.ang, c.h * 0.5, 9, z2, z2 + 5, rgb(on ? '#3b7bff' : '#ff3b5c'), d);
    const g = project(cabX, cabY, z2 + 4);
    if (g) {
      const r = Math.max(6, 40 * g.s);
      const rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      rg.addColorStop(0, on ? 'rgba(70,130,255,.5)' : 'rgba(255,60,90,.5)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
    }
  }
  // Scheinwerfer
  const fx = c.x + Math.cos(c.ang) * (c.h / 2 + 1), fy = c.y + Math.sin(c.ang) * (c.h / 2 + 1);
  const hl = project(fx, fy, 10 + c.z);
  if (hl && d < 300) {
    ctx.fillStyle = 'rgba(255,246,214,.8)';
    const r = clamp(2.6 * hl.s, 1.2, 8);
    const ox = -Math.sin(c.ang), oy = Math.cos(c.ang);
    for (const sgn of [-1, 1]) {
      const q = project(fx + ox * sgn * c.w * 0.33, fy + oy * sgn * c.w * 0.33, 10 + c.z);
      if (q) { ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill(); }
    }
  }
}

/* ---------------------------- Passanten ---------------------------- */

function drawPed3(ctx, p, d) {
  const base = project(p.x, p.y, 0);
  const head = project(p.x, p.y, 18 + p.z);
  if (!base || !head) return;
  const h = base.y - head.y;
  if (h < 1.5) return;
  const w = h * 0.40;
  drawShadow3(ctx, p.x + 2, p.y + 2, 8, 6, clamp(0.3 - d * 0.0002, 0.05, 0.3));

  const bob = Math.sin(p.step) * h * 0.03;
  const cx = base.x, top = head.y;

  if (p.dress) {
    // Beine
    ctx.fillStyle = shade(rgb(p.skin), 0.92, d);
    const stride = Math.sin(p.step) * w * 0.10;
    ctx.fillRect(cx - w * 0.24 + stride, top + h * 0.70, w * 0.17, h * 0.30);
    ctx.fillRect(cx + w * 0.07 - stride, top + h * 0.70, w * 0.17, h * 0.30);
    // Kleid: schmale Schultern, ausgestellter Saum
    ctx.fillStyle = shade(rgb(p.shirt), 1, d);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.36, top + h * 0.22 + bob);
    ctx.quadraticCurveTo(cx, top + h * 0.13 + bob, cx + w * 0.36, top + h * 0.22 + bob);
    ctx.lineTo(cx + w * 0.30, top + h * 0.44 + bob);
    ctx.lineTo(cx + w * 0.60, top + h * 0.76);
    ctx.lineTo(cx - w * 0.60, top + h * 0.76);
    ctx.lineTo(cx - w * 0.30, top + h * 0.44 + bob);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(rgb(p.shirt), 0.82, d);                          // Saumkante
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.60, top + h * 0.76);
    ctx.quadraticCurveTo(cx, top + h * 0.82, cx + w * 0.60, top + h * 0.76);
    ctx.lineTo(cx + w * 0.60, top + h * 0.73);
    ctx.quadraticCurveTo(cx, top + h * 0.79, cx - w * 0.60, top + h * 0.73);
    ctx.closePath(); ctx.fill();
    // Arme
    ctx.strokeStyle = shade(rgb(p.skin), 0.95, d);
    ctx.lineWidth = Math.max(1, w * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, top + h * 0.26 + bob);
    ctx.lineTo(cx - w * 0.42, top + h * 0.56 - bob);
    ctx.moveTo(cx + w * 0.34, top + h * 0.26 - bob);
    ctx.lineTo(cx + w * 0.42, top + h * 0.56 + bob);
    ctx.stroke();
    ctx.lineCap = 'butt';
  } else {
    ctx.fillStyle = shade(rgb(p.kind === 'cop' ? '#1b2f6b' : '#5b5b6e'), 0.85, d);
    ctx.fillRect(cx - w * 0.34, top + h * 0.55, w * 0.68, h * 0.45);       // Beine
    ctx.fillStyle = shade(rgb(p.shirt), 1, d);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, top + h * 0.62 + bob);
    ctx.lineTo(cx - w * 0.42, top + h * 0.22 + bob);
    ctx.quadraticCurveTo(cx, top + h * 0.12 + bob, cx + w * 0.42, top + h * 0.22 + bob);
    ctx.lineTo(cx + w / 2, top + h * 0.62 + bob);
    ctx.closePath(); ctx.fill();
  }
  if (p.kind === 'cop') {                                                  // Dienstmarke
    ctx.fillStyle = shade(rgb('#ffd23f'), 1, d);
    ctx.fillRect(cx - w * 0.1, top + h * 0.3 + bob, w * 0.2, h * 0.06);
  }
  drawFace(ctx, p, cx, top + h * 0.11 + bob, w * 0.28, d);
}

/** Kopf mit Gesicht. Nah dran sieht man Augen, Nase, Mund und Frisur. */
function drawFace(ctx, p, hx, hy, r, d) {
  if (p.kind !== 'cop' && r >= 2) drawHairBack(ctx, p, hx, hy, r, d);
  ctx.fillStyle = shade(rgb(p.skin), 1, d);
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill();
  if (r < 3.5) return;                                   // zu weit weg für Details

  const v = p.face || 0;
  const eyeX = r * (0.34 + (v % 7) * 0.014);
  const eyeY = hy - r * 0.10;
  const eyeR = Math.max(0.7, r * 0.15);
  const panic = p.panic > 0;

  // Ohren
  ctx.fillStyle = shade(rgb(p.skin), 0.88, d);
  ctx.beginPath(); ctx.ellipse(hx - r * 0.95, hy + r * 0.05, r * 0.16, r * 0.24, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + r * 0.95, hy + r * 0.05, r * 0.16, r * 0.24, 0, 0, TAU); ctx.fill();

  // Augen
  ctx.fillStyle = '#f6f2ee';
  ctx.beginPath(); ctx.ellipse(hx - eyeX, eyeY, eyeR, eyeR * (panic ? 1.25 : 0.92), 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + eyeX, eyeY, eyeR, eyeR * (panic ? 1.25 : 0.92), 0, 0, TAU); ctx.fill();
  ctx.fillStyle = ['#3b2a1c', '#26415e', '#2f5138', '#4a3352'][v % 4];
  const pr = Math.max(0.5, eyeR * 0.55);
  ctx.beginPath(); ctx.arc(hx - eyeX, eyeY, pr, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + eyeX, eyeY, pr, 0, TAU); ctx.fill();

  if (r > 6) {                                           // Brauen und Nase erst aus der Nähe
    ctx.strokeStyle = shade(rgb(p.hair || '#2a1b12'), 0.9, d);
    ctx.lineWidth = Math.max(0.8, r * 0.10);
    ctx.beginPath();
    ctx.moveTo(hx - eyeX - r * 0.20, eyeY - r * (panic ? 0.44 : 0.34));
    ctx.lineTo(hx - eyeX + r * 0.20, eyeY - r * (panic ? 0.38 : 0.30));
    ctx.moveTo(hx + eyeX - r * 0.20, eyeY - r * (panic ? 0.38 : 0.30));
    ctx.lineTo(hx + eyeX + r * 0.20, eyeY - r * (panic ? 0.44 : 0.34));
    ctx.stroke();
    ctx.strokeStyle = shade(rgb(p.skin), 0.78, d);
    ctx.lineWidth = Math.max(0.7, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(hx, hy - r * 0.02); ctx.lineTo(hx - r * 0.09, hy + r * 0.24);
    ctx.stroke();
  }

  // Mund: erschrocken offen, sonst ein Strich
  if (panic) {
    ctx.fillStyle = '#5a2530';
    ctx.beginPath(); ctx.ellipse(hx, hy + r * 0.50, r * 0.20, r * 0.28, 0, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = '#8c5a58';
    ctx.lineWidth = Math.max(0.7, r * 0.11);
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.26, hy + r * 0.48);
    ctx.quadraticCurveTo(hx, hy + r * (0.52 + ((v % 5) - 2) * 0.05), hx + r * 0.26, hy + r * 0.48);
    ctx.stroke();
  }

  // Frisur bzw. Dienstmütze
  if (p.kind === 'cop') {
    ctx.fillStyle = shade(rgb('#1b2138'), 1, d);
    ctx.beginPath(); ctx.arc(hx, hy - r * 0.18, r * 1.02, Math.PI, TAU); ctx.fill();
    ctx.fillRect(hx - r * 1.05, hy - r * 0.24, r * 2.1, r * 0.22);
    ctx.fillStyle = shade(rgb('#ffd23f'), 1, d);
    ctx.fillRect(hx - r * 0.22, hy - r * 0.78, r * 0.44, r * 0.20);
  } else {
    // Deckhaar mit Scheitel
    ctx.fillStyle = shade(rgb(p.hair), 1, d);
    ctx.beginPath();
    ctx.ellipse(hx, hy - r * 0.34, r * 1.06, r * 0.78, 0, Math.PI, TAU);
    ctx.fill();
    const part = ((p.face || 0) % 2 ? 1 : -1) * r * 0.30;
    ctx.beginPath();
    ctx.moveTo(hx + part, hy - r * 0.86);
    ctx.quadraticCurveTo(hx + part * 2.4, hy - r * 0.30, hx + part * 1.9, hy + r * 0.16);
    ctx.lineTo(hx + part * 0.2, hy - r * 0.30);
    ctx.closePath(); ctx.fill();
  }
}

/** Haaransatz hinter dem Kopf: lang, Zopf, Bob oder Dutt. */
function drawHairBack(ctx, p, hx, hy, r, d) {
  const c = shade(rgb(p.hair), 0.9, d);
  ctx.fillStyle = c;
  switch (p.hairStyle) {
    case 0:                                              // lang bis über die Schultern
      ctx.beginPath();
      ctx.moveTo(hx - r * 1.05, hy - r * 0.5);
      ctx.quadraticCurveTo(hx - r * 1.4, hy + r * 1.7, hx - r * 0.5, hy + r * 2.1);
      ctx.lineTo(hx + r * 0.5, hy + r * 2.1);
      ctx.quadraticCurveTo(hx + r * 1.4, hy + r * 1.7, hx + r * 1.05, hy - r * 0.5);
      ctx.closePath(); ctx.fill();
      break;
    case 1:                                              // Pferdeschwanz
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.2, r * 1.05, r * 1.0, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.8, hy - r * 0.5);
      ctx.quadraticCurveTo(hx + r * 1.9, hy + r * 0.6, hx + r * 1.2, hy + r * 1.9);
      ctx.quadraticCurveTo(hx + r * 1.0, hy + r * 0.7, hx + r * 0.5, hy - r * 0.2);
      ctx.closePath(); ctx.fill();
      break;
    case 2:                                              // Bob bis zum Kinn
      ctx.beginPath();
      ctx.moveTo(hx - r * 1.12, hy - r * 0.4);
      ctx.quadraticCurveTo(hx - r * 1.24, hy + r * 0.9, hx - r * 0.7, hy + r * 1.05);
      ctx.lineTo(hx + r * 0.7, hy + r * 1.05);
      ctx.quadraticCurveTo(hx + r * 1.24, hy + r * 0.9, hx + r * 1.12, hy - r * 0.4);
      ctx.closePath(); ctx.fill();
      break;
    default:                                             // Dutt
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.2, r * 1.04, r * 0.98, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 1.18, r * 0.46, r * 0.42, 0, 0, TAU); ctx.fill();
  }
}

/* ------------------------- Zäune, Hecken, Effekte ------------------------- */

const FENCE_C = rgb('#b9b1a1'), HEDGE_C = rgb('#33914f');

function drawMissionBeacon(ctx, m, d) {
  const col = rgb(m.stage === 'pickup' ? '#ffd23f' : '#2bff88');
  const r = 17;
  drawBox(ctx, m.x - r, m.y - r, m.x + r, m.y + r, 0, 95, col, d, 0.3);
  drawBox(ctx, m.x - r - 3, m.y - r - 3, m.x + r + 3, m.y + r + 3, 0, 3, col, d, 0.75);
}

function drawParticle3(ctx, q) {
  const s = project(q.x, q.y, q.z + 1);
  if (!s) return;
  const px = Math.max(1, q.size * s.s * 1.6);
  ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
  ctx.fillStyle = q.color;
  ctx.fillRect(s.x - px / 2, s.y - px / 2, px, px);
  ctx.globalAlpha = 1;
}

function drawBullet3(ctx, b) {
  const a = project(b.px, b.py, b.pz !== undefined ? b.pz : 12);
  const c = project(b.x, b.y, b.z !== undefined ? b.z : 12);
  if (!a || !c) return;
  ctx.strokeStyle = b.friendly ? 'rgba(255,238,170,.95)' : 'rgba(255,130,130,.95)';
  ctx.lineWidth = Math.max(1, 2.2 * c.s);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  ctx.lineCap = 'butt';
}

/* ------------------------------ Szene ------------------------------ */

const sceneList = [];

function render3d(ctx, vw, vh, time, frames) {
  beginFrame(vw, vh);
  drawSky(ctx, vw, vh, time);
  drawGround3(ctx);

  // Sichtbare Objekte einsammeln und von hinten nach vorn zeichnen
  sceneList.length = 0;
  const push = (x, y, t, o) => {
    const d = dist(x, y, cam.x, cam.y);
    if (d > VIEW_FAR) return;
    sceneList.push({ d, t, o });
  };

  for (const b of World.buildings)
    if (visible(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) push(b.x + b.w / 2, b.y + b.h / 2, 0, b);
  for (const f of World.fences)
    if (visible(f.x + f.w / 2, f.y + f.h / 2, Math.max(f.w, f.h))) push(f.x + f.w / 2, f.y + f.h / 2, 1, f);
  for (const g of World.hedges)
    if (visible(g.x + g.w / 2, g.y + g.h / 2, Math.max(g.w, g.h))) push(g.x + g.w / 2, g.y + g.h / 2, 2, g);
  for (const p of World.palms)
    if (visible(p.x, p.y, 30)) push(p.x, p.y, 3, p);
  for (const c of cars)
    if (!c.dead && c !== player.car && visible(c.x, c.y, 40)) push(c.x, c.y, 4, c);
  for (const p of peds)
    if (!p.dead && visible(p.x, p.y, 20)) push(p.x, p.y, 5, p);
  for (const q of parts) if (visible(q.x, q.y, 6)) push(q.x, q.y, 6, q);
  for (const b of bullets) if (visible(b.x, b.y, 20)) push(b.x, b.y, 7, b);
  if (mission && visible(mission.x, mission.y, 60)) push(mission.x, mission.y, 8, mission);
  for (const st of presentStalkers()) if (visible(st.x, st.y, 40)) push(st.x, st.y, 9, st);

  sceneList.sort((a, b) => b.d - a.d);

  for (const it of sceneList) {
    switch (it.t) {
      case 0: drawBuilding3(ctx, it.o, it.d); break;
      case 1: drawBox(ctx, it.o.x, it.o.y, it.o.x + it.o.w, it.o.y + it.o.h, 0, it.o.h3, FENCE_C, it.d); break;
      case 2: drawBox(ctx, it.o.x, it.o.y, it.o.x + it.o.w, it.o.y + it.o.h, 0, it.o.h3, HEDGE_C, it.d); break;
      case 3: drawPalm3(ctx, it.o, it.d, time); break;
      case 4: drawCar3(ctx, it.o, it.d, frames); break;
      case 5: drawPed3(ctx, it.o, it.d); break;
      case 6: drawParticle3(ctx, it.o); break;
      case 7: drawBullet3(ctx, it.o); break;
      case 8: drawMissionBeacon(ctx, it.o, it.d); break;
      case 9: drawStalker3(ctx, it.o, it.d); break;
    }
  }
}

/* --------------------- Waffe, Armaturenbrett, Visier --------------------- */

/** Pistole am unteren Bildrand, mit Laufbewegung und Rückstoß. */
function drawWeapon(ctx, vw, vh, bob, recoil, inCar, weapon) {
  if (weapon === 1) return drawRifle(ctx, vw, vh, bob, recoil, inCar);
  const S = (vh / 760) * (inCar ? 0.95 : 1.3);
  const ax = vw * (inCar ? 0.64 : 0.71) + Math.sin(bob) * 11 * S;
  const ay = vh * (inCar ? 1.06 : 1.12) + Math.abs(Math.cos(bob)) * 9 * S - recoil * 26 * S;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-0.22 + recoil * 0.16);
  ctx.scale(S, S);

  // Griff, nach hinten geneigt
  ctx.fillStyle = '#20232c';
  ctx.beginPath();
  ctx.moveTo(-18, -104); ctx.lineTo(20, -104); ctx.lineTo(44, 10); ctx.lineTo(2, 10);
  ctx.closePath(); ctx.fill();

  // Abzugsbügel
  ctx.strokeStyle = '#20232c'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(-4, -96, 26, 0.15, Math.PI - 0.5); ctx.stroke();

  // Rahmen und Verschluss
  ctx.fillStyle = '#31353f';
  ctx.fillRect(-30, -196, 52, 96);
  ctx.fillStyle = '#3f4450';
  ctx.fillRect(-30, -196, 52, 26);
  ctx.fillStyle = '#171a22';                       // Auswurföffnung
  ctx.fillRect(-24, -166, 40, 16);
  ctx.fillStyle = '#4b5160';                       // Mündung
  ctx.fillRect(-22, -206, 36, 12);
  ctx.fillStyle = '#0f1117';
  ctx.fillRect(-14, -204, 20, 8);
  ctx.fillStyle = '#c9ced9';                       // Kimme und Korn
  ctx.fillRect(-26, -200, 6, 7);
  ctx.fillRect(14, -200, 6, 7);

  // Hand am Griff
  ctx.fillStyle = '#dda87e';
  ctx.beginPath(); ctx.ellipse(16, -52, 30, 40, -0.18, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c9905f';
  for (let i = 0; i < 3; i++) {                    // Finger
    ctx.beginPath();
    ctx.ellipse(-6, -86 + i * 21, 15, 8, 0.12, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#e8b98d';                       // Daumen
  ctx.beginPath(); ctx.ellipse(30, -78, 10, 21, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#cf9a6d';                       // Unterarm
  ctx.beginPath();
  ctx.moveTo(-2, -26); ctx.lineTo(44, -18); ctx.lineTo(86, 190); ctx.lineTo(18, 190);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#20e3b2';                       // Ärmel
  ctx.beginPath();
  ctx.moveTo(14, 60); ctx.lineTo(70, 66); ctx.lineTo(86, 190); ctx.lineTo(18, 190);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  return { x: ax + Math.cos(-0.22 - Math.PI / 2) * 206 * S, y: ay + Math.sin(-0.22 - Math.PI / 2) * 206 * S };
}

/** Scharfschützengewehr: langer Lauf, Zielfernrohr, Schaft. */
function drawRifle(ctx, vw, vh, bob, recoil, inCar) {
  const S = (vh / 760) * (inCar ? 0.72 : 0.82);
  const ax = vw * (inCar ? 0.70 : 0.75) + Math.sin(bob) * 9 * S;
  const ay = vh * (inCar ? 1.12 : 1.18) + Math.abs(Math.cos(bob)) * 8 * S - recoil * 34 * S;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-0.44 + recoil * 0.2);
  ctx.scale(S, S);

  ctx.fillStyle = '#3a2b20';                       // Schaft
  ctx.beginPath();
  ctx.moveTo(-16, -120); ctx.lineTo(26, -128); ctx.lineTo(66, 40); ctx.lineTo(6, 46);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1f17';                       // Griffstück
  ctx.beginPath();
  ctx.moveTo(-14, -128); ctx.lineTo(18, -132); ctx.lineTo(34, -60); ctx.lineTo(2, -56);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#242832';                       // Systemkasten
  ctx.fillRect(-26, -250, 46, 128);
  ctx.fillStyle = '#171a22';
  ctx.fillRect(-26, -212, 46, 12);
  ctx.fillStyle = '#3d434f';                       // Kammerstängel
  ctx.fillRect(18, -236, 26, 11);
  ctx.beginPath(); ctx.arc(46, -230, 8, 0, TAU); ctx.fill();

  ctx.fillStyle = '#2b303c';                       // Lauf
  ctx.fillRect(-14, -392, 22, 152);
  ctx.fillStyle = '#454b58';                       // Mündungsbremse
  ctx.fillRect(-18, -412, 30, 22);
  ctx.fillStyle = '#0e1015';
  ctx.fillRect(-8, -410, 10, 18);

  ctx.fillStyle = '#1b1f28';                       // Zielfernrohr
  ctx.fillRect(-24, -352, 44, 30);
  ctx.beginPath(); ctx.ellipse(-2, -356, 26, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5fa8d8';
  ctx.beginPath(); ctx.ellipse(-2, -356, 18, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#20242e';                       // Montageringe
  ctx.fillRect(-26, -330, 48, 10);
  ctx.fillRect(-26, -378, 48, 10);

  ctx.fillStyle = '#302b3a';                       // Zweibein
  ctx.fillRect(-22, -300, 10, 40);

  ctx.fillStyle = '#dda87e';                       // Hand am Griff
  ctx.beginPath(); ctx.ellipse(14, -104, 26, 34, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c9905f';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.ellipse(-4, -136 + i * 20, 14, 8, 0.1, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#cf9a6d';                       // Unterarm
  ctx.beginPath();
  ctx.moveTo(2, -78); ctx.lineTo(48, -70); ctx.lineTo(92, 190); ctx.lineTo(24, 190);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#20e3b2';                       // Ärmel
  ctx.beginPath();
  ctx.moveTo(20, 40); ctx.lineTo(76, 48); ctx.lineTo(92, 190); ctx.lineTo(24, 190);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  const a = -0.44 + recoil * 0.2;
  return { x: ax + Math.cos(a - Math.PI / 2) * 412 * S,
           y: ay + Math.sin(a - Math.PI / 2) * 412 * S };
}

function drawMuzzleFlash(ctx, mz) {
  const g = ctx.createRadialGradient(mz.x, mz.y, 2, mz.x, mz.y, 86);
  g.addColorStop(0, 'rgba(255,248,214,.95)');
  g.addColorStop(0.28, 'rgba(255,178,58,.6)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(mz.x, mz.y, 86, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,238,180,.9)';          // Sternform
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, r = i % 2 ? 12 : 34;
    const x = mz.x + Math.cos(a) * r, y = mz.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

/** Innenraum: Motorhaube, Armaturenbrett, Lenkrad. */
function drawDashboard(ctx, vw, vh, car, steer) {
  const col = car.color;
  ctx.save();
  ctx.fillStyle = col;                                   // Motorhaube
  ctx.beginPath();
  ctx.moveTo(-vw * 0.1, vh);
  ctx.lineTo(vw * 0.14, vh * 0.80);
  ctx.lineTo(vw * 0.86, vh * 0.80);
  ctx.lineTo(vw * 1.1, vh);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, vh * 0.86, vw, vh);
  ctx.fillStyle = '#181b24';                             // Armaturenbrett
  ctx.beginPath();
  ctx.moveTo(0, vh);
  ctx.lineTo(0, vh * 0.88);
  ctx.quadraticCurveTo(vw * 0.5, vh * 0.80, vw, vh * 0.88);
  ctx.lineTo(vw, vh);
  ctx.closePath(); ctx.fill();
  // A-Säulen und Dachkante, damit man im Wagen sitzt
  ctx.fillStyle = '#141720';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(vw * 0.10, 0); ctx.lineTo(vw * 0.045, vh * 0.86); ctx.lineTo(0, vh * 0.86);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(vw, 0); ctx.lineTo(vw * 0.90, 0); ctx.lineTo(vw * 0.955, vh * 0.86); ctx.lineTo(vw, vh * 0.86);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1b1f2a';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(vw, 0); ctx.lineTo(vw * 0.88, vh * 0.07); ctx.lineTo(vw * 0.12, vh * 0.07);
  ctx.closePath(); ctx.fill();

  // Lenkrad
  ctx.translate(vw * 0.5, vh * 1.16);
  ctx.rotate(steer * 0.5);
  ctx.strokeStyle = '#0f1118'; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.arc(0, 0, vh * 0.24, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#2b2f3d'; ctx.lineWidth = 18;
  ctx.beginPath(); ctx.arc(0, 0, vh * 0.24, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Blick durch das Zielfernrohr: schwarze Maske, Absehen, Zoomanzeige. */
function drawScope(ctx, vw, vh, zoom, maxZoom, fireCd) {
  const cx = vw / 2, cy = vh / 2;
  const r = Math.min(vw, vh) * 0.42;
  const t = clamp((zoom - 1) / (maxZoom - 1), 0, 1);   // Einblenden beim Anlegen

  ctx.save();
  ctx.globalAlpha = t;

  // Alles außerhalb des Okulars abdecken
  ctx.fillStyle = '#05050a';
  ctx.beginPath();
  ctx.rect(0, 0, vw, vh);
  ctx.arc(cx, cy, r, 0, TAU, true);
  ctx.fill();

  // Linsenrand und leichte Randabdunklung
  const edge = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,.65)');
  ctx.fillStyle = edge;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,160,180,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, TAU); ctx.stroke();

  // Absehen mit Teilstrichen
  ctx.strokeStyle = 'rgba(15,18,24,.92)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx - 16, cy);
  ctx.moveTo(cx + 16, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - 16);
  ctx.moveTo(cx, cy + 16); ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();                                    // dicke Balken außen
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.55, cy);
  ctx.moveTo(cx + r * 0.55, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - r * 0.55);
  ctx.moveTo(cx, cy + r * 0.55); ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.fillStyle = 'rgba(15,18,24,.92)';
  for (let i = 1; i <= 4; i++) {                      // Mil-Punkte
    const o = i * r * 0.11;
    ctx.beginPath(); ctx.arc(cx, cy + o, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - o, cy, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + o, cy, 2.4, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,40,60,.95)';
  ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, TAU); ctx.fill();

  // Nachladebalken und Zoomanzeige
  if (fireCd > 0) {
    ctx.strokeStyle = 'rgba(255,210,63,.85)'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 14, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - fireCd / 58, 0, 1));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,230,240,.8)';
  ctx.font = 'bold 15px Verdana,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(maxZoom.toFixed(1) + 'x', cx, cy + r - 26);
  ctx.restore();
}

function drawCrosshair(ctx, vw, vh, spread) {
  const x = vw / 2, y = vh / 2, r = 7 + spread;
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r - 8, y); ctx.lineTo(x - r, y);
  ctx.moveTo(x + r, y); ctx.lineTo(x + r + 8, y);
  ctx.moveTo(x, y - r - 8); ctx.lineTo(x, y - r);
  ctx.moveTo(x, y + r); ctx.lineTo(x, y + r + 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,46,99,.95)';
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
}
