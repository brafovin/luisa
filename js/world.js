'use strict';

/* ------------------------------------------------------------------ *
 *  Neo Miami: prozedurale Stadt (deterministisch, Seed-basiert)
 * ------------------------------------------------------------------ */

const CS    = 340;              // Rasterweite (Straßenmitte zu Straßenmitte)
const RW    = 104;              // Straßenbreite
const GRID  = 10;               // Blöcke pro Achse
const WORLD = GRID * CS;        // Weltgröße in Pixeln
const SW    = 18;               // Gehsteigbreite
const FENCE_H = 12;             // Zaunhöhe - im Sprung überwindbar
const HEDGE_H = 10;             // Heckenhöhe

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
          height: 48 + rnd() * (j < 3 || i < 3 ? 210 : 95),
          wall: pick(PALETTE.wall), roof: pick(PALETTE.roof),
          neon: rnd() < 0.35 ? pick(PALETTE.neon) : null,
          floors: 2 + ((rnd() * 4) | 0)
        };
        b.id = this.buildings.length;
        this.setDoor(b, i, j, rnd);
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

  /**
   * Tür an der Fassade, die der nächsten Straße zugewandt ist.
   * Nur Häuser mit genug Grundfläche lassen sich betreten.
   */
  setDoor(b, i, j, rnd) {
    if (b.w < 62 || b.h < 62) { b.door = null; return; }
    const dW = b.x - i * CS, dE = (i + 1) * CS - (b.x + b.w);
    const dN = b.y - j * CS, dS = (j + 1) * CS - (b.y + b.h);
    // unter allen etwa gleich straßennahen Seiten eine zufällig wählen
    const cand = [['W', dW], ['E', dE], ['N', dN], ['S', dS]];
    const m = Math.min(dW, dE, dN, dS);
    const near = cand.filter(c => c[1] <= m + 26);
    const side = near[(rnd() * near.length) | 0][0];
    let x, y, nx = 0, ny = 0;
    if (side === 'W')      { x = b.x;           y = b.y + b.h / 2; nx = -1; }
    else if (side === 'E') { x = b.x + b.w;     y = b.y + b.h / 2; nx = 1; }
    else if (side === 'N') { x = b.x + b.w / 2; y = b.y;           ny = -1; }
    else                   { x = b.x + b.w / 2; y = b.y + b.h;     ny = 1; }
    b.door = { side, x, y, nx, ny, w: 30, h: 34 };
    b.interiorKind = rnd() < 0.42 ? 'shop' : rnd() < 0.6 ? 'office' : 'flat';
    b.seed = (rnd() * 1e9) | 0;
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
    const f = { x, y, w, h, h3: FENCE_H };
    this.fences.push(f);
    this.solids.push({ x, y, w, h, low: true });
  },

  addHedge(x, y, w, h) {
    const g = { x, y, w, h, h3: HEDGE_H };
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
  }
};
