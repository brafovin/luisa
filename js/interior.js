'use strict';

/* ------------------------------------------------------------------ *
 *  Innenräume: betretbare Häuser.
 *  Der Raum liegt in denselben Weltkoordinaten wie das Haus, deshalb
 *  bleiben Position, Kamera und Geschosse beim Betreten konsistent.
 * ------------------------------------------------------------------ */

const IN_WALL  = 8;    // Wandstärke
const IN_CEIL  = 42;   // Deckenhöhe
const DOOR_W   = 30;

/** Baustein eines Innenraums. */
function inBox(x0, y0, x1, y1, z0, z1, color, opts) {
  return {
    x0, y0, x1, y1, z0, z1, color: rgb(color),
    solid: !opts || opts.solid !== false,
    low: !!(opts && opts.low),
    glow: !!(opts && opts.glow)
  };
}

/**
 * Innenraum aus einem Haus erzeugen: Wände, Möbel, Ausgang, Bewohner.
 * Deterministisch über den Seed des Hauses.
 */
function makeInterior(b) {
  const rnd = makeRng(b.seed || (b.id + 1) * 7919);
  const x0 = b.x + IN_WALL, y0 = b.y + IN_WALL;
  const x1 = b.x + b.w - IN_WALL, y1 = b.y + b.h - IN_WALL;
  const d = b.door;

  const it = {
    b, x0, y0, x1, y1, ceil: IN_CEIL,
    kind: b.interiorKind || 'office',
    parts: [], solids: [], peds: [], lamps: [],
    register: null,
    // Standpunkte innen und außen vor der Tür
    inPos:  { x: d.x - d.nx * 26, y: d.y - d.ny * 26 },
    outPos: { x: d.x + d.nx * 30, y: d.y + d.ny * 30 },
    door: d
  };

  const add = (p) => { it.parts.push(p); if (p.solid) it.solids.push(p); };
  const W = x1 - x0, H = y1 - y0;

  // Vor der Tür bleibt ein Gang frei, sonst steht man beim Betreten im Regal
  const pw = DOOR_W / 2 + 16, pd = 92;
  const path = d.nx !== 0
    ? { x: Math.min(d.x, d.x - d.nx * pd), y: d.y - pw, w: pd, h: pw * 2 }
    : { x: d.x - pw, y: Math.min(d.y, d.y - d.ny * pd), w: pw * 2, h: pd };
  /** Möbelstück nur aufstellen, wenn es den Eingang nicht verstellt. */
  const addF = (p) => {
    if (overlaps(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0, path.x, path.y, path.w, path.h)) return false;
    add(p); return true;
  };

  /* --- Wände: als Quader außerhalb des Raums, damit die Innenseiten
         durch das normale Rückseiten-Culling sichtbar werden. --- */
  const wallC = it.kind === 'shop' ? '#e6dccb' : it.kind === 'flat' ? '#d9c9b4' : '#cfd6dd';
  const seg = (ax0, ay0, ax1, ay1) => add(inBox(ax0, ay0, ax1, ay1, 0, it.ceil, wallC));
  // Türöffnung in der betreffenden Wand aussparen
  const gap = DOOR_W / 2;
  if (d.side === 'W' || d.side === 'E') {
    const wx = d.side === 'W' ? [b.x, x0] : [x1, b.x + b.w];
    seg(wx[0], b.y, wx[1], d.y - gap);
    seg(wx[0], d.y + gap, wx[1], b.y + b.h);
    // gegenüberliegende und quer laufende Wände
    const ox = d.side === 'W' ? [x1, b.x + b.w] : [b.x, x0];
    seg(ox[0], b.y, ox[1], b.y + b.h);
    seg(b.x, b.y, b.x + b.w, y0);
    seg(b.x, y1, b.x + b.w, b.y + b.h);
    // Türsturz über der Öffnung
    add(inBox(wx[0], d.y - gap, wx[1], d.y + gap, it.ceil - 8, it.ceil, wallC, { solid: false }));
  } else {
    const wy = d.side === 'N' ? [b.y, y0] : [y1, b.y + b.h];
    seg(b.x, wy[0], d.x - gap, wy[1]);
    seg(d.x + gap, wy[0], b.x + b.w, wy[1]);
    const oy = d.side === 'N' ? [y1, b.y + b.h] : [b.y, y0];
    seg(b.x, oy[0], b.x + b.w, oy[1]);
    seg(b.x, b.y, x0, b.y + b.h);
    seg(x1, b.y, b.x + b.w, b.y + b.h);
    add(inBox(d.x - gap, wy[0], d.x + gap, wy[1], it.ceil - 8, it.ceil, wallC, { solid: false }));
  }

  /* --- Deckenlampen --- */
  const lampsX = Math.max(1, Math.round(W / 90)), lampsY = Math.max(1, Math.round(H / 90));
  for (let a = 0; a < lampsX; a++) {
    for (let c = 0; c < lampsY; c++) {
      const lx = x0 + W * (a + 0.5) / lampsX, ly = y0 + H * (c + 0.5) / lampsY;
      it.lamps.push({ x: lx, y: ly });
      add(inBox(lx - 16, ly - 5, lx + 16, ly + 5, it.ceil - 4, it.ceil - 1.5, '#fff3cf',
        { solid: false, glow: true }));
    }
  }

  /* --- Einrichtung --- */
  if (it.kind === 'shop') {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const shelfC = ['#8a6a4a', '#6f7f8c', '#7a6a86'];
    // Regale liegen längs der Eingangsachse - man schaut in die Gänge, nicht auf ein Regalende
    if (d.nx !== 0) {
      const a0 = d.nx > 0 ? x0 + 22 : x0 + pd + 14;
      const a1 = d.nx > 0 ? x1 - pd - 14 : x1 - 22;
      const rows = clamp(Math.floor(H / 62), 1, 4);
      for (let r = 0; r < rows && a1 - a0 > 50; r++) {
        const ry = y0 + 30 + r * (H - 56) / Math.max(1, rows - 1 || 1);
        if (ry > y1 - 24) break;
        add(inBox(a0, ry - 9, a1, ry + 9, 0, 30, shelfC[r % 3]));
        add(inBox(a0, ry - 9, a1, ry + 9, 30, 33, '#c8b18d', { solid: false }));
      }
    } else {
      const a0 = d.ny > 0 ? y0 + 22 : y0 + pd + 14;
      const a1 = d.ny > 0 ? y1 - pd - 14 : y1 - 22;
      const cols = clamp(Math.floor(W / 62), 1, 4);
      for (let c = 0; c < cols && a1 - a0 > 50; c++) {
        const rx = x0 + 30 + c * (W - 56) / Math.max(1, cols - 1 || 1);
        if (rx > x1 - 24) break;
        add(inBox(rx - 9, a0, rx + 9, a1, 0, 30, shelfC[c % 3]));
        add(inBox(rx - 9, a0, rx + 9, a1, 30, 33, '#c8b18d', { solid: false }));
      }
    }
    // Tresen an der Wand gegenüber der Tür
    const tx = mx - d.nx * W * 0.30, ty = my - d.ny * H * 0.30;
    let cx, cy;
    if (d.nx !== 0) {
      cx = tx; cy = my;
      const a = my - H * 0.28, b2 = my + H * 0.28;
      add(inBox(cx - 16, a, cx + 16, b2, 0, 24, '#5d4530'));
      add(inBox(cx - 18, a - 2, cx + 18, b2 + 2, 24, 27, '#8d6a48', { solid: false }));
    } else {
      cx = mx; cy = ty;
      const a = mx - W * 0.28, b2 = mx + W * 0.28;
      add(inBox(a, cy - 16, b2, cy + 16, 0, 24, '#5d4530'));
      add(inBox(a - 2, cy - 18, b2 + 2, cy + 18, 24, 27, '#8d6a48', { solid: false }));
    }
    it.register = { x: cx, y: cy, looted: false, cash: 250 + ((rnd() * 450) | 0) };

  } else if (it.kind === 'office') {
    const cols = clamp(Math.floor(W / 80), 1, 3), rows = clamp(Math.floor(H / 70), 1, 3);
    for (let a = 0; a < cols; a++) {
      for (let c = 0; c < rows; c++) {
        const dx = x0 + W * (a + 0.5) / cols, dy = y0 + H * (c + 0.5) / rows;
        if (!addF(inBox(dx - 26, dy - 14, dx + 26, dy + 14, 0, 17, '#6b5b4a', { low: true }))) continue;
        add(inBox(dx - 9, dy - 8, dx + 9, dy + 8, 17, 30, '#22283a', { solid: false }));   // Monitor
        addF(inBox(dx - 34, dy - 8, dx - 22, dy + 8, 0, 20, '#39405a', { low: true }));    // Stuhl
      }
    }
    addF(inBox(x1 - 26, y0 + 16, x1 - 10, y0 + 44, 0, 34, '#4a5b46'));                     // Pflanze

  } else {                                     // Wohnung
    addF(inBox(x0 + 20, y0 + 20, x0 + 90, y0 + 56, 0, 20, '#7d5a86', { low: true }));      // Sofa
    addF(inBox(x0 + 34, y0 + 70, x0 + 78, y0 + 96, 0, 14, '#6b5b4a', { low: true }));      // Tisch
    addF(inBox(x1 - 30, y0 + 30, x1 - 14, y0 + 78, 0, 28, '#2b3040'));                     // Schrank
    addF(inBox(x1 - 26, y1 - 70, x1 - 12, y1 - 20, 0, 12, '#3b4256', { low: true }));      // Bett
    addF(inBox(x0 + 24, y1 - 40, x0 + 60, y1 - 28, 0, 26, '#20242f'));                     // Fernseher
  }

  /* --- Bewohner --- */
  const n = it.kind === 'shop' ? 1 + ((rnd() * 2) | 0) : (rnd() * 3) | 0;
  for (let k = 0; k < n; k++) {
    let px = 0, py = 0;
    for (let tries = 0; tries < 12; tries++) {           // nicht im Eingangsbereich stehen
      px = x0 + 24 + rnd() * Math.max(1, W - 48);
      py = y0 + 24 + rnd() * Math.max(1, H - 48);
      if (dist2(px, py, it.inPos.x, it.inPos.y) > 62 * 62) break;
    }
    const p = makePed(px, py, 'civ');
    p.spd = 0.4 + rnd() * 0.4;
    it.peds.push(p);
  }
  return it;
}

/* --------------------------- Innen-Kollision --------------------------- */

function collideInside(it, e, r, canFly) {
  for (const s of it.solids) {
    if (canFly && s.low) continue;
    if (!overlaps(e.x - r, e.y - r, r * 2, r * 2, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0)) continue;
    const left = s.x0 - (e.x + r), right = s.x1 - (e.x - r);
    const up = s.y0 - (e.y + r), down = s.y1 - (e.y - r);
    const dx = Math.abs(left) < Math.abs(right) ? left : right;
    const dy = Math.abs(up) < Math.abs(down) ? up : down;
    if (Math.abs(dx) < Math.abs(dy)) e.x += dx; else e.y += dy;
    e.hit = true;
  }
}

/** Blockiert eine Wand oder ein hohes Möbelstück den Schuss? */
function blockedInside(it, x, y, z) {
  for (const s of it.solids) {
    if (z < s.z0 || z > s.z1) continue;
    if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return true;
  }
  return false;
}

function updateInterior(it) {
  for (const p of it.peds) {
    if (p.dead) continue;
    const d = dist(p.x, p.y, player.x, player.y);
    if (player.wanted > 0 && d < 160) { p.panic = 50; p.ang = Math.atan2(p.y - player.y, p.x - player.x); }
    if (p.panic > 0) p.panic--;
    if (--p.turnCd <= 0) { p.ang += (rng() - 0.5) * 1.8; p.turnCd = 40 + rng() * 80; }
    const sp = p.spd * (p.panic > 0 ? 2.4 : 1);
    p.x += Math.cos(p.ang) * sp; p.y += Math.sin(p.ang) * sp;
    p.hit = false;
    collideInside(it, p, 9, false);
    if (p.hit) p.ang += Math.PI * (0.5 + rng() * 0.5);
    p.step += sp * 0.25;
  }
}

/* ----------------------------- Rendering ----------------------------- */

const _iList = [];

function renderInterior(ctx, it, vw, vh, time, frames) {
  beginFrame(vw, vh);

  // Decke und Boden zuerst - sie begrenzen den Raum nach oben und unten
  ctx.fillStyle = '#15131c';
  ctx.fillRect(0, 0, vw, vh);
  const ceilC = rgb('#ded8cd'), floorC = rgb(it.kind === 'shop' ? '#6d6355' : it.kind === 'flat' ? '#7a5a3c' : '#4f5560');
  // Decke als eigene Fläche - hell genug, um den Raum zu schließen
  const cq = [it.b.x, it.b.y, it.ceil, it.b.x + it.b.w, it.b.y, it.ceil,
              it.b.x + it.b.w, it.b.y + it.b.h, it.ceil, it.b.x, it.b.y + it.b.h, it.ceil];
  poly(ctx, cq, shade(ceilC, 0.60, 40));
  groundQuad(ctx, it.b.x, it.b.y, it.b.w, it.b.h, shade(floorC, 1, 40));

  // Ausgangsmarkierung auf dem Boden
  const d = it.door;
  groundQuad(ctx, it.inPos.x - 16, it.inPos.y - 16, 32, 32,
    `rgba(60,255,140,${0.22 + Math.sin(time * 0.005) * 0.08})`);

  _iList.length = 0;
  for (const p of it.parts) {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
    if (!visible(cx, cy, Math.max(p.x1 - p.x0, p.y1 - p.y0))) continue;
    _iList.push({ d: dist(cx, cy, cam.x, cam.y), t: 0, o: p });
  }
  for (const p of it.peds) if (!p.dead) _iList.push({ d: dist(p.x, p.y, cam.x, cam.y), t: 1, o: p });
  for (const q of parts) if (visible(q.x, q.y, 6)) _iList.push({ d: dist(q.x, q.y, cam.x, cam.y), t: 2, o: q });
  for (const b of bullets) _iList.push({ d: dist(b.x, b.y, cam.x, cam.y), t: 3, o: b });
  if (it.register && !it.register.looted)
    _iList.push({ d: dist(it.register.x, it.register.y, cam.x, cam.y), t: 4, o: it.register });
  _iList.sort((a, b) => b.d - a.d);

  for (const e of _iList) {
    const o = e.o;
    switch (e.t) {
      case 0:
        if (o.glow) {                                    // Leuchte an der Decke
          const q = [o.x0, o.y0, o.z0, o.x1, o.y0, o.z0, o.x1, o.y1, o.z0, o.x0, o.y1, o.z0];
          poly(ctx, q, '#fff6da');
          const lp = project((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, o.z0);
          if (lp) {
            const r = clamp(60 * lp.s, 10, 260);
            const g = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, r);
            g.addColorStop(0, 'rgba(255,238,190,.35)');
            g.addColorStop(1, 'rgba(255,220,150,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(lp.x, lp.y, r, 0, TAU); ctx.fill();
          }
        } else {
          drawBox(ctx, o.x0, o.y0, o.x1, o.y1, o.z0, o.z1, o.color, e.d * 0.5);
        }
        break;
      case 1: drawPed3(ctx, o, e.d); break;
      case 2: drawParticle3(ctx, o); break;
      case 3: drawBullet3(ctx, o); break;
      case 4: {
        const pulse = 0.5 + Math.sin(time * 0.006) * 0.5;
        drawBox(ctx, o.x - 9, o.y - 11, o.x + 9, o.y + 11, 27, 40, rgb('#2f3a4d'), 40);
        drawBox(ctx, o.x - 7, o.y - 9, o.x + 7, o.y + 9, 40, 42.5, rgb('#ffd23f'), 40 - pulse * 30);
        break;
      }
    }
  }

  // Tageslicht durch die Türöffnung
  const dp = project(d.x, d.y, 16);
  if (dp && dp.d < 300) {
    const r = clamp(90 * dp.s, 8, 300);
    const g = ctx.createRadialGradient(dp.x, dp.y, 0, dp.x, dp.y, r);
    g.addColorStop(0, 'rgba(255,205,150,.35)');
    g.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(dp.x, dp.y, r, 0, TAU); ctx.fill();
  }
}
