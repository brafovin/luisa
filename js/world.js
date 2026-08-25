'use strict';

/* ------------------------------------------------------------------ *
 *  Neo Miami: prozedurale Stadt (deterministisch, Seed-basiert)
 * ------------------------------------------------------------------ */

const CS    = 340;              // Rasterweite (Straßenmitte zu Straßenmitte)
const RW    = 104;              // Straßenbreite
const GRID  = 10;               // Blöcke pro Achse
const WORLD = GRID * CS;        // Weltgröße in Pixeln
const SW    = 18;               // Gehsteigbreite

const K3D = 0.0026;             // Stärke der Pseudo-3D-Extrusion

/** Versatz für die "Dachfläche" eines Objekts der Höhe h. */
function proj3d(sx, sy, h, vw, vh) {
  return [(sx - vw / 2) * h * K3D, (sy - vh / 2) * h * K3D];
}

const PALETTE = {
  wall:  ['#e8d7c3', '#f2b8c6', '#9ad7d1', '#c9a7e8', '#f7d9a0', '#a8c0e8', '#e8a6a0', '#cfe0c2'],
  roof:  ['#7a6f66', '#8c6b74', '#5f7f7c', '#6f5f85', '#8a7a5c', '#5f6f88', '#8a6260', '#6f7d63'],
  neon:  ['#ff2e63', '#ff9f43', '#2bd9ff', '#ff6ec7', '#7cff5a']
};

const World = {
  cells: [],        // Rastertyp pro Block
  buildings: [],
  palms: [],
  fences: [],       // niedrige Hindernisse - drüberspringen erlaubt!
  hedges: [],
  solids: [],       // Kollisionsboxen; low=true kann übersprungen werden
  parkSpots: [],    // Startplätze für geparkte Autos
  grid: null,       // räumlicher Hash für Kollisionsabfragen
  cellSize: 170,
  cols: 0, rows: 0,

  /* ------------------------------ Aufbau ------------------------------ */

  generate(seed = 20260825) {
    const rnd = makeRng(seed);
    const pick = arr => arr[(rnd() * arr.length) | 0];
    this.buildings.length = this.palms.length = this.fences.length = 0;
    this.hedges.length = this.solids.length = 0;
    this.cells = [];

    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const x0 = i * CS + RW / 2, y0 = j * CS + RW / 2;
        const size = CS - RW;
        let kind;
        if (j === GRID - 1) kind = 'beach';
        else {
          const r = rnd();
          kind = r < 0.60 ? 'blocks' : r < 0.76 ? 'park' : r < 0.88 ? 'lot' : 'plaza';
        }
        this.cells.push({ i, j, x: x0, y: y0, s: size, kind });
        this.buildCell(x0, y0, size, kind, rnd, pick, i, j);
      }
    }
    this.buildHash();
  },

  buildCell(x0, y0, s, kind, rnd, pick, i, j) {
    const lx = x0 + SW, ly = y0 + SW, ls = s - SW * 2;   // Grundstück ohne Gehsteig

    if (kind === 'blocks') {
      // 1-4 Häuser pro Block, an den Rändern ausgerichtet
      const split = rnd() < 0.45;
      const rects = split
        ? [[lx, ly, ls, ls * 0.5 - 6], [lx, ly + ls * 0.5 + 6, ls, ls * 0.5 - 6]]
        : (rnd() < 0.5
          ? [[lx, ly, ls * 0.5 - 6, ls], [lx + ls * 0.5 + 6, ly, ls * 0.5 - 6, ls]]
          : [[lx, ly, ls, ls]]);
      for (const [bx, by, bw, bh] of rects) {
        if (rnd() < 0.14) { this.makeYard(bx, by, bw, bh, rnd); continue; }
        const inset = 4 + rnd() * 10;
        const b = {
          x: bx + inset, y: by + inset, w: bw - inset * 2, h: bh - inset * 2,
          height: 30 + rnd() * (j < 3 || i < 3 ? 105 : 65),
          wall: pick(PALETTE.wall), roof: pick(PALETTE.roof),
          neon: rnd() < 0.35 ? pick(PALETTE.neon) : null,
          floors: 2 + ((rnd() * 4) | 0)
        };
        this.buildings.push(b);
        this.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, low: false });
      }

    } else if (kind === 'park') {
      // Grünfläche mit Zaun (mit Lücke) und Palmen
      this.fenceRing(lx, ly, ls, ls, rnd);
      const n = 3 + ((rnd() * 4) | 0);
      for (let k = 0; k < n; k++) {
        this.addPalm(lx + 24 + rnd() * (ls - 48), ly + 24 + rnd() * (ls - 48), rnd);
      }
      if (rnd() < 0.5) this.addHedge(lx + ls * 0.3, ly + ls * 0.55, ls * 0.4, 16);

    } else if (kind === 'lot') {
      // Parkplatz: Autos zum Klauen (und zum Drüberspringen)
      const cols = 3, rows = 3;
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          if (rnd() < 0.4) continue;
          this.parkSpots.push({
            x: lx + ls * (a + 0.5) / cols,
            y: ly + ls * (b + 0.5) / rows,
            ang: (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.12
          });
        }
      }
      if (rnd() < 0.6) this.addPalm(lx + 10, ly + 10, rnd);

    } else if (kind === 'plaza') {
      // Platz mit Hecken und Palmenreihe
      for (let k = 0; k < 3; k++) this.addHedge(lx + 16, ly + 30 + k * (ls / 3), ls - 32, 18);
      this.addPalm(lx + ls / 2, ly + 14, rnd);
      this.addPalm(lx + ls / 2, ly + ls - 14, rnd);

    } else { // beach
      const n = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) this.addPalm(lx + 30 + rnd() * (ls - 60), ly + 20 + rnd() * (ls * 0.6), rnd);
      if (rnd() < 0.4) this.addHedge(lx + 20, ly + ls * 0.15, ls - 40, 14);
    }
  },

  makeYard(x, y, w, h, rnd) {
    this.fenceRing(x + 8, y + 8, w - 16, h - 16, rnd);
    this.addPalm(x + w / 2, y + h / 2, rnd);
  },

  /** Zaunring mit einer Lücke - oder eben: drüberspringen. */
  fenceRing(x, y, w, h, rnd) {
    const gap = (rnd() * 4) | 0;                 // Seite mit Eingang
    const t = 10;
    const segs = [
      [x, y, w, t], [x, y + h - t, w, t],
      [x, y, t, h], [x + w - t, y, t, h]
    ];
    segs.forEach((s, idx) => {
      if (idx === gap) {                          // Lücke in der Mitte lassen
        const horiz = idx < 2;
        const half = (horiz ? s[2] : s[3]) * 0.34;
        if (horiz) {
          this.addFence(s[0], s[1], half, s[3]);
          this.addFence(s[0] + s[2] - half, s[1], half, s[3]);
        } else {
          this.addFence(s[0], s[1], s[2], half);
          this.addFence(s[0], s[1] + s[3] - half, s[2], half);
        }
      } else this.addFence(s[0], s[1], s[2], s[3]);
    });
  },

  addFence(x, y, w, h) {
    const f = { x, y, w, h };
    this.fences.push(f);
    this.solids.push({ x, y, w, h, low: true });
  },

  addHedge(x, y, w, h) {
    const g = { x, y, w, h };
    this.hedges.push(g);
    this.solids.push({ x, y, w, h, low: true });
  },

  addPalm(x, y, rnd) {
    const p = { x, y, height: 46 + rnd() * 34, lean: (rnd() - 0.5) * 0.5, seed: rnd() };
    this.palms.push(p);
    this.solids.push({ x: x - 6, y: y - 6, w: 12, h: 12, low: true });
  },

  /* -------------------------- Kollisionshash -------------------------- */

  buildHash() {
    this.cols = Math.ceil(WORLD / this.cellSize) + 2;
    this.rows = this.cols;
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
    for (const s of this.solids) {
      const i0 = Math.max(0, (s.x / this.cellSize) | 0);
      const i1 = Math.min(this.cols - 1, ((s.x + s.w) / this.cellSize) | 0);
      const j0 = Math.max(0, (s.y / this.cellSize) | 0);
      const j1 = Math.min(this.rows - 1, ((s.y + s.h) / this.cellSize) | 0);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) this.grid[j * this.cols + i].push(s);
    }
  },

  /** Alle Kollisionsboxen im Umkreis einer Box. */
  near(x, y, w, h, out) {
    out.length = 0;
    const i0 = Math.max(0, (x / this.cellSize) | 0);
    const i1 = Math.min(this.cols - 1, ((x + w) / this.cellSize) | 0);
    const j0 = Math.max(0, (y / this.cellSize) | 0);
    const j1 = Math.min(this.rows - 1, ((y + h) / this.cellSize) | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const bucket = this.grid[j * this.cols + i];
        for (const s of bucket) if (out.indexOf(s) < 0) out.push(s);
      }
    }
    return out;
  },

  /** Liegt der Punkt auf Asphalt? (für Verkehr / Spawns) */
  onRoad(x, y) {
    const mx = ((x % CS) + CS) % CS, my = ((y % CS) + CS) % CS;
    return mx < RW / 2 || mx > CS - RW / 2 || my < RW / 2 || my > CS - RW / 2;
  },

  /* ------------------------------ Boden ------------------------------ */

  drawGround(ctx, cam, vw, vh, time) {
    // Asphalt als Grundfläche
    ctx.fillStyle = '#3e3e4c';
    ctx.fillRect(0, 0, vw, vh);

    const i0 = Math.max(0, ((cam.x) / CS | 0) - 1), i1 = Math.min(GRID - 1, ((cam.x + vw) / CS | 0) + 1);
    const j0 = Math.max(0, ((cam.y) / CS | 0) - 1), j1 = Math.min(GRID - 1, ((cam.y + vh) / CS | 0) + 1);

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = this.cells[j * GRID + i];
        if (!c) continue;
        const sx = c.x - cam.x, sy = c.y - cam.y;
        ctx.fillStyle = c.kind === 'beach' ? '#e0c48f' : '#9696aa';   // Gehsteig
        ctx.fillRect(sx, sy, c.s, c.s);
        ctx.fillStyle =
          c.kind === 'park' ? '#3f8f5c' :
          c.kind === 'beach' ? '#eddaa8' :
          c.kind === 'lot' ? '#4a4a58' :
          c.kind === 'plaza' ? '#a89f95' : '#75758a';
        ctx.fillRect(sx + SW, sy + SW, c.s - SW * 2, c.s - SW * 2);
        if (c.kind === 'lot') {                                        // Parkplatzmarkierung
          ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
          for (let k = 1; k < 3; k++) {
            const ly = sy + SW + (c.s - SW * 2) * k / 3;
            ctx.beginPath(); ctx.moveTo(sx + SW, ly); ctx.lineTo(sx + c.s - SW, ly); ctx.stroke();
          }
        }
      }
    }

    // Mittelstreifen
    ctx.strokeStyle = 'rgba(255,214,80,.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 20]);
    ctx.beginPath();
    for (let i = i0; i <= i1 + 1; i++) {
      const x = i * CS - cam.x;
      if (x > -10 && x < vw + 10) { ctx.moveTo(x, 0); ctx.lineTo(x, vh); }
    }
    for (let j = j0; j <= j1 + 1; j++) {
      const y = j * CS - cam.y;
      if (y > -10 && y < vh + 10) { ctx.moveTo(0, y); ctx.lineTo(vw, y); }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Ozean südlich der Stadt
    const oy = WORLD - cam.y;
    if (oy < vh) {
      const g = ctx.createLinearGradient(0, oy, 0, vh);
      g.addColorStop(0, '#2aa6b8'); g.addColorStop(1, '#0e4f74');
      ctx.fillStyle = g;
      ctx.fillRect(0, oy, vw, vh - oy);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const wy = oy + 16 + k * 26 + Math.sin(time * 0.002 + k) * 5;
        if (wy > vh) break;
        ctx.moveTo(((k * 137 + time * 0.03) % vw) - 60, wy);
        ctx.lineTo(((k * 137 + time * 0.03) % vw) + 40, wy);
      }
      ctx.stroke();
    }
  },

  /* ----------------------------- Objekte ----------------------------- */

  drawBuilding(ctx, b, cam, vw, vh) {
    const sx = b.x - cam.x, sy = b.y - cam.y;
    const [ox, oy] = proj3d(sx + b.w / 2, sy + b.h / 2, b.height, vw, vh);

    // Schlagschatten
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(sx + 6, sy + 8, b.w, b.h);

    // Wandkörper: vier Quads von Basis zu Dach
    ctx.fillStyle = b.wall;
    const bx = [sx, sx + b.w, sx + b.w, sx], by = [sy, sy, sy + b.h, sy + b.h];
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(bx[k], by[k]); ctx.lineTo(bx[n], by[n]);
      ctx.lineTo(bx[n] + ox, by[n] + oy); ctx.lineTo(bx[k] + ox, by[k] + oy);
      ctx.closePath(); ctx.fill();
    }
    // Wandabdunklung zur Basis hin
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(bx[k], by[k]); ctx.lineTo(bx[n], by[n]);
      ctx.lineTo(bx[n] + ox * 0.45, by[n] + oy * 0.45); ctx.lineTo(bx[k] + ox * 0.45, by[k] + oy * 0.45);
      ctx.closePath(); ctx.fill();
    }
    // Fensterbänder
    ctx.strokeStyle = 'rgba(35,35,70,.16)';
    ctx.lineWidth = 2;
    for (let f = 1; f <= b.floors; f++) {
      const t = f / (b.floors + 1);
      ctx.strokeRect(sx + ox * t, sy + oy * t, b.w, b.h);
    }
    // Dach
    ctx.fillStyle = b.roof;
    ctx.fillRect(sx + ox, sy + oy, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(sx + ox, sy + oy, b.w, b.h);
    if (b.w > 40 && b.h > 40) {                       // Klimaanlagen aufs Dach
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(sx + ox + 10, sy + oy + 10, 16, 12);
      ctx.fillRect(sx + ox + b.w - 30, sy + oy + b.h - 24, 20, 14);
    }
    if (b.neon) {                                     // Neonkante am Dachrand
      ctx.strokeStyle = b.neon; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(sx + ox + 1.5, sy + oy + 1.5, b.w - 3, b.h - 3);
      ctx.globalAlpha = 0.18; ctx.lineWidth = 9;
      ctx.strokeRect(sx + ox + 1.5, sy + oy + 1.5, b.w - 3, b.h - 3);
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
  },

  drawPalm(ctx, p, cam, vw, vh, time) {
    const sx = p.x - cam.x, sy = p.y - cam.y;
    const [ox, oy] = proj3d(sx, sy, p.height, vw, vh);
    const tx = sx + ox + p.lean * 14, ty = sy + oy;

    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(sx + 6, sy + 4, 16, 9, 0, 0, TAU); ctx.fill();

    ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + ox * .5 + p.lean * 8, sy + oy * .5, tx, ty); ctx.stroke();

    const sway = Math.sin(time * 0.0016 + p.seed * 9) * 0.12;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#3fa863' : '#1f6b3c';
      ctx.lineWidth = pass ? 4 : 7;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + sway + (pass ? 0.06 : 0);
        ctx.beginPath(); ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * 14, ty + Math.sin(a) * 10,
          tx + Math.cos(a) * 26, ty + Math.sin(a) * 18 + 4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c9a227';
    ctx.beginPath(); ctx.arc(tx, ty, 4, 0, TAU); ctx.fill();
    ctx.lineCap = 'butt';
  },

  drawFence(ctx, f, cam, vw, vh) {
    const sx = f.x - cam.x, sy = f.y - cam.y, H = 26;
    const [ox, oy] = proj3d(sx + f.w / 2, sy + f.h / 2, H, vw, vh);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx + 3, sy + 4, f.w, f.h);
    ctx.fillStyle = '#8d8577'; ctx.fillRect(sx, sy, f.w, f.h);
    ctx.fillStyle = '#b9b1a1'; ctx.fillRect(sx + ox, sy + oy, f.w, f.h);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + ox, sy + oy, f.w, f.h);
  },

  drawHedge(ctx, g, cam, vw, vh) {
    const sx = g.x - cam.x, sy = g.y - cam.y, H = 24;
    const [ox, oy] = proj3d(sx + g.w / 2, sy + g.h / 2, H, vw, vh);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx + 3, sy + 4, g.w, g.h);
    ctx.fillStyle = '#2c7a45'; ctx.fillRect(sx, sy, g.w, g.h);
    ctx.fillStyle = '#3fa15c'; ctx.fillRect(sx + ox, sy + oy, g.w, g.h);
  }
};
