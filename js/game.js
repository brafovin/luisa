'use strict';

/* ------------------------------------------------------------------ *
 *  VICE HORIZON VI - Spielkern
 *  Top-Down-Open-World: laufen, springen (Leertaste!), Autos klauen,
 *  Fahndungslevel, Lieferaufträge.
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

let VW = 0, VH = 0, DPR = 1;

const overlayCv = document.createElement('canvas');
const overlayCtx = overlayCv.getContext('2d');

/** Abendtönung + Vignette einmalig in eine Ebene rendern. */
function buildOverlay() {
  overlayCv.width = Math.max(1, VW); overlayCv.height = Math.max(1, VH);
  const o = overlayCtx;
  o.clearRect(0, 0, VW, VH);
  const g = o.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, 'rgba(255,140,190,.05)');
  g.addColorStop(1, 'rgba(60,20,110,.07)');
  o.fillStyle = g; o.fillRect(0, 0, VW, VH);
  const v = o.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.36, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.34)');
  o.fillStyle = v; o.fillRect(0, 0, VW, VH);
}

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  VW = innerWidth; VH = innerHeight;
  canvas.width = VW * DPR; canvas.height = VH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  buildOverlay();
}
addEventListener('resize', resize);

/* --------------------------- Konstanten --------------------------- */

const GRAV       = 0.30;   // Schwerkraft pro Frame
const JUMP_V     = 3.7;    // Absprunggeschwindigkeit zu Fuß (Scheitel ~23 Einheiten)
const CAR_HOP_V  = 3.4;    // Hydraulik-Hüpfer im Auto
const FLY_H      = 13;     // ab dieser Höhe fliegt man über Zäune und Hecken
const WALK       = 2.5;
const RUN        = 4.3;
const EYE        = 17;     // Augenhöhe zu Fuß
const CAR_EYE    = 16;     // Augenhöhe im Auto
const MOUSE_SENS = 0.0022; // Mausempfindlichkeit
const PITCH_MAX  = 1.15;   // maximaler Nickwinkel
const PED_R      = 11;
const FRAME      = 1000 / 60;

const CAR_TYPES = [
  { name: 'Sedan',  w: 46, h: 24, max: 7.4, acc: 0.20, grip: 0.045 },
  { name: 'Sport',  w: 48, h: 22, max: 9.2, acc: 0.28, grip: 0.052 },
  { name: 'Van',    w: 54, h: 27, max: 6.2, acc: 0.16, grip: 0.036 },
  { name: 'Pickup', w: 50, h: 25, max: 7.0, acc: 0.19, grip: 0.041 }
];
const CAR_COLORS = ['#ff2e63', '#2bd9ff', '#ffd23f', '#7cff5a', '#ff9f43', '#f5f5f5', '#8a7bff', '#22252e'];

/* ----------------------------- Zustand ----------------------------- */

const rng = makeRng(1337);
let state = 'menu';           // menu | play | pause | dead
let time = 0, frames = 0;
let shake = 0;

const mouse = { dx: 0, dy: 0, left: false, right: false, rightHit: false, locked: false };
const scratch = [];           // Puffer für Kollisionsabfragen

const player = {
  x: 0, y: 0, z: 0, vz: 0, ang: -Math.PI / 2,
  vx: 0, vy: 0, health: 100, cash: 0, wanted: 0,
  car: null, stun: 0, hurtCd: 0, crimeCd: 0, starCd: 0, step: 0, kills: 0,
  fireCd: 0, muzzle: 0, weapon: 0, scoped: false, sway: 0, zoom: 1, recoil: 0,
  yaw: 0, pitch: 0, lookOff: 0, bob: 0,
  inside: null                 // betretener Innenraum, sonst null
};
const interiors = new Map();   // Haus-Id -> erzeugter Innenraum

let cars = [], peds = [], parts = [], bullets = [];
let mission = null;
let hintText = '';
let flashText = '', flashCd = 0;

/** Kurze Meldung, die den normalen Hinweis eine Weile überschreibt. */
function flashHint(t) { flashText = t; flashCd = 140; }

/* ---------------------------- Hilfsmittel --------------------------- */

function randRoadPoint() {
  const axis = rng() < 0.5 ? 'h' : 'v';
  const idx = 1 + ((rng() * (GRID - 1)) | 0);
  const sign = rng() < 0.5 ? 1 : -1;
  const lane = RW * 0.24;
  const along = rng() * WORLD;
  if (axis === 'h') {
    const cy = idx * CS + (sign > 0 ? lane : -lane);
    return { x: along, y: cy, ang: sign > 0 ? 0 : Math.PI, axis, sign, road: idx };
  }
  const cx = idx * CS + (sign > 0 ? -lane : lane);
  return { x: cx, y: along, ang: sign > 0 ? Math.PI / 2 : -Math.PI / 2, axis, sign, road: idx };
}

/** Straßenpunkt außerhalb des Sichtfelds, aber in Spielernähe. */
function spawnPointNearPlayer(minD = 620, maxD = 1150) {
  for (let i = 0; i < 40; i++) {
    const p = randRoadPoint();
    const d = dist(p.x, p.y, player.x, player.y);
    if (d > minD && d < maxD) return p;
  }
  return randRoadPoint();
}

/** Grober Nähetest - ersetzt die alte Bildausschnittsprüfung. */
function inView(x, y, pad = 140) {
  return dist2(x, y, cam.x, cam.y) < (520 + pad) * (520 + pad);
}

/** Achsenweise Kollisionsauflösung gegen die Weltgeometrie. */
function collide(e, r, canFly) {
  if (player.inside && e === player) {
    collideInside(player.inside, e, r, canFly);
    return;
  }
  const list = World.near(e.x - r, e.y - r, r * 2, r * 2, scratch);
  for (const s of list) {
    if (canFly && s.low) continue;
    if (!overlaps(e.x - r, e.y - r, r * 2, r * 2, s.x, s.y, s.w, s.h)) continue;
    // kleinste Verschiebung suchen
    const left = (s.x - (e.x + r)), right = (s.x + s.w - (e.x - r));
    const up = (s.y - (e.y + r)), down = (s.y + s.h - (e.y - r));
    const dx = Math.abs(left) < Math.abs(right) ? left : right;
    const dy = Math.abs(up) < Math.abs(down) ? up : down;
    if (Math.abs(dx) < Math.abs(dy)) { e.x += dx; e.hitAxis = 'x'; }
    else { e.y += dy; e.hitAxis = 'y'; }
    e.hit = true;
  }
  e.x = clamp(e.x, 12, WORLD - 12);
  e.y = clamp(e.y, 12, WORLD - 12);
}

function burst(x, y, z, n, color, spread = 3, up = 3) {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    parts.push({
      x, y, z, vx: Math.cos(a) * rng() * spread, vy: Math.sin(a) * rng() * spread,
      vz: rng() * up, life: 24 + rng() * 22, max: 46, color, size: 2 + rng() * 3
    });
  }
}

/* ------------------------------ Autos ------------------------------ */

function makeCar(x, y, ang, kind) {
  const t = CAR_TYPES[(rng() * CAR_TYPES.length) | 0];
  return {
    x, y, z: 0, vz: 0, ang, spd: 0, type: t, kind,          // kind: parked | traffic | cop
    w: kind === 'cop' ? 48 : t.w, h: kind === 'cop' ? 24 : t.h,
    max: kind === 'cop' ? 8.4 : t.max,
    acc: kind === 'cop' ? 0.26 : t.acc,
    color: kind === 'cop' ? '#f2f2f2' : CAR_COLORS[(rng() * CAR_COLORS.length) | 0],
    health: 100, driver: false, axis: 'h', sign: 1, turnCd: 0, blink: 0, dead: false
  };
}

function spawnTraffic(n) {
  for (let i = 0; i < n; i++) {
    const p = spawnPointNearPlayer(500, 1200);
    const c = makeCar(p.x, p.y, p.ang, 'traffic');
    c.axis = p.axis; c.sign = p.sign; c.road = p.road;
    c.spd = c.max * (0.55 + rng() * 0.3);
    cars.push(c);
  }
}

function spawnParked() {
  for (const s of World.parkSpots) {
    if (rng() < 0.35) continue;
    cars.push(makeCar(s.x, s.y, s.ang, 'parked'));
  }
}

function spawnCop() {
  const p = spawnPointNearPlayer(700, 1300);
  const c = makeCar(p.x, p.y, p.ang, 'cop');
  c.axis = p.axis; c.sign = p.sign;
  cars.push(c);
  Sfx.siren();
}

/** Verkehrs-KI: fährt auf der Spur, biegt an Kreuzungen zufällig ab. */
function updateTraffic(c) {
  const lane = RW * 0.24;
  if (c.turnCd > 0) c.turnCd--;
  const cross = c.axis === 'h' ? c.x : c.y;
  const nearNode = Math.abs(((cross % CS) + CS) % CS) < 8 || Math.abs(((cross % CS) + CS) % CS - CS) < 8;
  if (nearNode && c.turnCd === 0 && rng() < 0.4) {
    const node = Math.round(cross / CS) * CS;
    const newSign = rng() < 0.5 ? 1 : -1;
    if (c.axis === 'h') { c.x = node; c.axis = 'v'; c.sign = newSign; c.x = node + (newSign > 0 ? -lane : lane); }
    else { c.y = node; c.axis = 'h'; c.sign = newSign; c.y = node + (newSign > 0 ? lane : -lane); }
    c.turnCd = 70;
  }
  c.ang = c.axis === 'h' ? (c.sign > 0 ? 0 : Math.PI) : (c.sign > 0 ? Math.PI / 2 : -Math.PI / 2);

  // vor sich schauen: bremsen wenn belegt
  let block = false;
  const fx = c.x + Math.cos(c.ang) * 52, fy = c.y + Math.sin(c.ang) * 52;
  for (const o of cars) {
    if (o === c || o.dead) continue;
    if (dist2(fx, fy, o.x, o.y) < 34 * 34) { block = true; break; }
  }
  if (!block && dist2(fx, fy, player.x, player.y) < 30 * 30 && !player.car) block = true;
  c.spd = block ? Math.max(0, c.spd - 0.35) : Math.min(c.max * 0.75, c.spd + 0.12);
  c.x += Math.cos(c.ang) * c.spd;
  c.y += Math.sin(c.ang) * c.spd;
  if (c.x < 0 || c.x > WORLD || c.y < 0 || c.y > WORLD) c.dead = true;
}

/** Polizei-KI: direkt auf den Spieler zu. */
function updateCop(c) {
  const tx = player.car ? player.car.x : player.x;
  const ty = player.car ? player.car.y : player.y;
  const want = Math.atan2(ty - c.y, tx - c.x);
  const d = angDiff(c.ang, want);
  c.ang += clamp(d, -0.055, 0.055);
  const far = dist(c.x, c.y, tx, ty);
  c.spd = lerp(c.spd, far > 90 ? c.max : 1.5, 0.06);

  const px = c.x, py = c.y;
  c.x += Math.cos(c.ang) * c.spd;
  c.y += Math.sin(c.ang) * c.spd;
  c.hit = false;
  collide(c, 18, c.z > FLY_H);
  if (c.hit) { c.spd *= 0.55; if (rng() < 0.05) { c.x = px; c.y = py; c.ang += 0.9; } }

  c.blink = (c.blink + 1) % 40;
  if (c.blink === 0 && inView(c.x, c.y, 500)) Sfx.siren();

  // Rammen
  if (!player.car && player.z < FLY_H && dist2(c.x, c.y, player.x, player.y) < 26 * 26) hurtPlayer(14, true);
  if (player.car && dist2(c.x, c.y, player.car.x, player.car.y) < 42 * 42) {
    const rel = Math.abs(c.spd) + Math.abs(player.car.spd);
    if (rel > 5) { hurtPlayer(rel * 0.6, false); shake = Math.min(14, shake + rel); Sfx.crash(); }
    c.spd *= 0.4;
  }
}

/** Fahrphysik für das Spielerauto. */
function updatePlayerCar(c) {
  const fwd = Input.held('KeyW', 'ArrowUp');
  const back = Input.held('KeyS', 'ArrowDown');
  const lf = Input.held('KeyA', 'ArrowLeft');
  const rt = Input.held('KeyD', 'ArrowRight');

  if (fwd) c.spd += c.acc;
  else if (back) c.spd -= c.acc * 0.85;
  else c.spd *= 0.985;
  c.spd = clamp(c.spd, -c.max * 0.45, c.max);
  if (Math.abs(c.spd) < 0.02) c.spd = 0;

  const steer = (rt ? 1 : 0) - (lf ? 1 : 0);
  c.steerVis = lerp(c.steerVis || 0, steer, 0.18);
  const grip = c.type.grip * (c.z > 0 ? 0.45 : 1);            // in der Luft kaum Lenkung
  c.ang += steer * grip * clamp(Math.abs(c.spd) / c.max * 1.5, 0, 1) * Math.sign(c.spd || 1);

  // Hydraulik-Hüpfer
  if (Input.hit('Space') && c.z === 0) { c.vz = CAR_HOP_V; Sfx.jump(); }
  if (c.z > 0 || c.vz > 0) {
    c.vz -= GRAV * 0.9; c.z += c.vz;
    if (c.z <= 0) {
      c.z = 0; c.vz = 0;
      burst(c.x, c.y, 0, 8, 'rgba(210,205,190,.85)', 2.2, 1.2);
      Sfx.land(); shake = Math.max(shake, 3);
    }
  }

  const px = c.x, py = c.y;
  c.x += Math.cos(c.ang) * c.spd;
  c.y += Math.sin(c.ang) * c.spd;
  c.hit = false;
  collide(c, Math.max(c.w, c.h) * 0.42, c.z > FLY_H);
  if (c.hit) {
    const impact = Math.abs(c.spd);
    if (impact > 2.2) {
      hurtPlayer(impact * 1.6, false);
      damageCar(c, impact * 2.4, false);
      burst((c.x + px) / 2, (c.y + py) / 2, 6, 10, '#ffd66a', 3.5, 2);
      shake = Math.min(16, shake + impact * 1.6);
      Sfx.crash();
    }
    c.spd *= -0.22;
  }

  // Passanten überfahren
  if (Math.abs(c.spd) > 1.6 && c.z < FLY_H) {
    for (const p of peds) {
      if (p.dead) continue;
      if (dist2(p.x, p.y, c.x, c.y) < 24 * 24) {
        p.dead = true; player.kills++;
        burst(p.x, p.y, 8, 14, '#c0223a', 3, 2.5);
        addWanted(1);
        c.spd *= 0.9;
      }
    }
  }
}

/* ----------------------------- Waffen ----------------------------- */

const BULLET_SPD = 17;
const BULLET_DMG = 20;

/**
 * Waffen. `pierce` = wie viele Personen eine Kugel zusätzlich durchschlägt,
 * `zoom` = Verkleinerungsfaktor des Blickfelds im Zielfernrohr.
 */
const WEAPONS = [
  {
    name: 'PISTOLE', dmg: BULLET_DMG, cd: 9, carCd: 13, spd: BULLET_SPD,
    spread: 0.02, carSpread: 0.05, recoil: 0.022, shake: 1.2, pierce: 0,
    zoom: 1, reach: 46, sound: () => Sfx.shot()
  },
  {
    name: 'SNIPER', dmg: 75, cd: 58, carCd: 75, spd: 34,
    spread: 0.012, carSpread: 0.06, recoil: 0.085, shake: 7, pierce: 2,
    zoom: 3.6, reach: 120, sound: () => Sfx.sniper()
  }
];
const SNIPER = 1;

function spawnBullet(x, y, z, ang, pitch, friendly, spd, dmg, pierce, life) {
  const flat = Math.cos(pitch);
  bullets.push({
    x, y, z, ang,
    vx: Math.cos(ang) * spd * flat, vy: Math.sin(ang) * spd * flat, vz: Math.sin(pitch) * spd,
    life: life || 46, friendly, px: x, py: y, pz: z,
    dmg: dmg || BULLET_DMG, pierce: pierce || 0
  });
}

/** Geschossen wird immer dorthin, wo das Fadenkreuz steht. */
function playerShoot() {
  const w = WEAPONS[player.weapon];
  const inCar = !!player.car;
  const ox = inCar ? player.car.x : player.x;
  const oy = inCar ? player.car.y : player.y;
  // Im Zielfernrohr sitzt der Schuss genau auf dem Fadenkreuz
  const spread = player.scoped ? 0 : (inCar ? w.carSpread : w.spread);
  const a = cam.yaw + (rng() - 0.5) * spread;
  const pit = cam.pitch + (rng() - 0.5) * spread;
  const off = inCar ? 30 : 16;
  const ez = (inCar ? CAR_EYE + player.car.z : EYE + player.z) - 2;
  spawnBullet(ox + Math.cos(a) * off, oy + Math.sin(a) * off, ez, a, pit, true,
    w.spd, w.dmg, w.pierce, w.reach);
  player.ang = a;
  player.muzzle = player.weapon === SNIPER ? 6 : 4;
  player.fireCd = inCar ? w.carCd : w.cd;
  shake = Math.min(14, shake + w.shake);
  player.recoil += w.recoil;                               // hebt den Lauf, federt dann zurück
  w.sound();
}

/** Waffe wechseln - mit Q durchschalten oder direkt über 1 und 2. */
function switchWeapon(idx) {
  if (idx === player.weapon) return;
  player.weapon = idx;
  player.fireCd = Math.max(player.fireCd, 14);
  player.scoped = false;
  flashHint(WEAPONS[idx].name + (idx === SNIPER ? '  —  [RECHTE MAUS] Zielfernrohr' : ''));
  Sfx.tone(idx === SNIPER ? 260 : 420, idx === SNIPER ? 420 : 620, 0.09, 'square', 0.2);
}

/** Trifft die Kugel eine massive Wand? (Zäune/Hecken werden überschossen) */
function bulletBlocked(x, y, z) {
  if (player.inside) return blockedInside(player.inside, x, y, z);
  const list = World.near(x - 1, y - 1, 2, 2, scratch);
  for (const s of list) {
    if (s.low) continue;
    if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
  }
  return false;
}

function explodeCar(c, byPlayer) {
  c.dead = true;
  burst(c.x, c.y, 6, 34, '#ff8a2b', 5, 4);
  burst(c.x, c.y, 10, 18, '#ffe38a', 6, 5);
  burst(c.x, c.y, 4, 14, 'rgba(60,60,70,.9)', 3, 3);
  Sfx.explode();
  shake = Math.min(22, shake + 14);
  for (const p of peds) if (!p.dead && dist2(p.x, p.y, c.x, c.y) < 80 * 80) p.dead = true;
  const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
  const d = dist(px, py, c.x, c.y);
  if (d < 100) hurtPlayer((1 - d / 100) * 45, false);
  if (byPlayer) addWanted(1);
}

function damageCar(c, dmg, byPlayer) {
  c.health -= dmg;
  if (c.health <= 0) explodeCar(c, byPlayer);
}

function updateBullets() {
  for (const b of bullets) {
    b.px = b.x; b.py = b.y; b.pz = b.z;
    for (let step = 0; step < 2; step++) {            // Teilschritte gegen Tunneln
      b.x += b.vx / 2; b.y += b.vy / 2; b.z += b.vz / 2;
      if (b.z <= 0) {                                 // Einschlag im Boden
        b.life = 0;
        burst(b.x, b.y, 1, 4, '#d8cfc0', 1.4, 1.2);
        break;
      }
      if ((player.inside || b.z < 26) && bulletBlocked(b.x, b.y, b.z)) {
        b.life = 0;
        burst(b.x, b.y, 10, 4, '#ffd9a0', 1.6, 1);
        Sfx.ricochet();
        break;
      }
      if (b.friendly) {
        let hit = false;
        if (hitStalker(b.x, b.y, b.z, b.dmg)) { b.life = 0; break; }
        const targets = player.inside ? player.inside.peds : peds;
        for (const p of targets) {
          if (p.dead || dist2(p.x, p.y, b.x, b.y) > 12 * 12) continue;
          if (b.z < p.z || b.z > p.z + 20) continue;              // über den Kopf geschossen
          p.dead = true; player.kills++;
          burst(p.x, p.y, 10, 12, '#c0223a', 3, 2.4);
          addWanted(p.kind === 'cop' ? 2 : 1);
          if (b.pierce > 0) { b.pierce--; continue; }      // Sniper schlägt durch
          hit = true; break;
        }
        if (!hit && !player.inside) for (const c of cars) {
          if (c.dead || c.driver || dist2(c.x, c.y, b.x, b.y) > 22 * 22) continue;
          if (b.z > c.z + 30) continue;
          burst(b.x, b.y, 8, 5, '#ffd66a', 2, 1.5);
          damageCar(c, b.dmg, true);
          if (c.kind === 'cop' && !c.dead) addWanted(0);
          hit = true; break;
        }
        if (hit) { b.life = 0; break; }
      } else {
        if (player.car) {
          if (dist2(player.car.x, player.car.y, b.x, b.y) < 24 * 24) {
            hurtPlayer(5, false); damageCar(player.car, 8, false); b.life = 0; break;
          }
        } else if (dist2(player.x, player.y, b.x, b.y) < 12 * 12
                   && b.z > player.z && b.z < player.z + 20) {
          hurtPlayer(8, false); b.life = 0; break;
        }
      }
      if (b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) { b.life = 0; break; }
    }
    b.life--;
  }
  bullets = bullets.filter(b => b.life > 0);
}

/* ---------------------------- Passanten ---------------------------- */

function makePed(x, y, kind) {
  return {
    x, y, z: 0, vz: 0, kind,                                  // kind: civ | cop
    ang: rng() * TAU, spd: kind === 'cop' ? 2.9 : 0.7 + rng() * 0.7,
    shirt: kind === 'cop' ? '#1b2f6b' : hslHex(rng() * 360, 62, 58),
    hair: kind === 'cop' ? '#1b2138' : hslHex([28, 34, 20, 45, 300][(rng() * 5) | 0], 20 + rng() * 45, 12 + rng() * 34),
    bald: kind !== 'cop' && rng() < 0.12,
    face: (rng() * 1000) | 0,          // Variation von Augenabstand und Mund
    fireCd: 40 + rng() * 60,
    skin: hslHex(25 + rng() * 15, 45 + rng() * 20, 45 + rng() * 28),
    turnCd: 0, panic: 0, dead: false, step: rng() * 10
  };
}

function spawnPeds(n) {
  for (let i = 0; i < n; i++) {
    const c = World.cells[(rng() * World.cells.length) | 0];
    const edge = (rng() * 4) | 0;
    const t = rng();
    let x, y;
    if (edge === 0) { x = c.x + t * c.s; y = c.y + SW * 0.5; }
    else if (edge === 1) { x = c.x + t * c.s; y = c.y + c.s - SW * 0.5; }
    else if (edge === 2) { x = c.x + SW * 0.5; y = c.y + t * c.s; }
    else { x = c.x + c.s - SW * 0.5; y = c.y + t * c.s; }
    if (!inView(x, y, 60) || peds.length < 6) peds.push(makePed(x, y, 'civ'));
  }
}

function spawnFootCop() {
  const p = spawnPointNearPlayer(320, 620);
  peds.push(makePed(p.x, p.y, 'cop'));
}

function updatePed(p) {
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const d = dist(p.x, p.y, px, py);

  if (p.kind === 'cop') {
    const want = Math.atan2(py - p.y, px - p.x);
    p.ang += clamp(angDiff(p.ang, want), -0.12, 0.12);
    if (d < 18 && !player.car && player.z < FLY_H) hurtPlayer(9, true);
    // ab 3 Sternen schießen die Cops zurück - im Sprung fliegen die Kugeln unten durch
    if (player.wanted >= 3 && d < 300 && --p.fireCd <= 0) {
      p.fireCd = 55 + rng() * 45;
      spawnBullet(p.x + Math.cos(p.ang) * 12, p.y + Math.sin(p.ang) * 12, 12,
        p.ang + (rng() - 0.5) * 0.22, 0, false, 12);
      Sfx.copshot();
    }
    if (d > 1400) p.dead = true;
  } else {
    if (player.wanted > 0 && d < 190) { p.panic = 60; p.ang = Math.atan2(p.y - py, p.x - px); }
    if (p.panic > 0) p.panic--;
    if (--p.turnCd <= 0) { p.ang += (rng() - 0.5) * 1.6; p.turnCd = 40 + rng() * 90; }
  }

  const sp = p.spd * (p.panic > 0 ? 2.6 : 1);
  p.x += Math.cos(p.ang) * sp;
  p.y += Math.sin(p.ang) * sp;
  p.hit = false;
  collide(p, 9, false);
  if (p.hit) p.ang += Math.PI * (0.5 + rng() * 0.5);
  p.step += sp * 0.25;
}

/* --------------------------- Spieler zu Fuß --------------------------- */

function updatePlayerOnFoot() {
  if (player.stun > 0) { player.stun--; }

  const fx = Math.cos(player.yaw), fy = Math.sin(player.yaw);   // vorwärts
  player.ang = player.yaw;
  const rx = -fy, ry = fx;                                      // seitwärts

  let fwd = 0, side = 0;
  if (player.stun <= 0) {
    if (Input.held('KeyW', 'ArrowUp')) fwd += 1;                // vorwärts
    if (Input.held('KeyS', 'ArrowDown')) fwd -= 1;              // rückwärts
    if (Input.held('KeyD', 'ArrowRight')) side += 1;            // seitlich
    if (Input.held('KeyA', 'ArrowLeft')) side -= 1;
  }
  // Y und Shift sprinten. Auf QWERTZ liefert die Y-Taste den Code 'KeyZ',
  // auf QWERTY 'KeyY' - deshalb beide.
  const sprint = Input.held('ShiftLeft', 'ShiftRight', 'KeyY', 'KeyZ') && fwd > 0;
  const spd = sprint ? RUN : WALK;
  let mx = fx * fwd + rx * side;
  let my = fy * fwd + ry * side;
  const len = Math.hypot(mx, my);

  if (len > 0) {
    mx /= len; my /= len;
    const s = spd * (fwd < 0 ? 0.62 : side !== 0 && fwd === 0 ? 0.85 : 1);
    player.vx = lerp(player.vx, mx * s, player.z > 0 ? 0.06 : 0.3);
    player.vy = lerp(player.vy, my * s, player.z > 0 ? 0.06 : 0.3);
    player.step += s * 0.22;
    if (player.z === 0) player.bob += s * 0.17;
  } else if (player.z === 0) {
    player.vx *= 0.7; player.vy *= 0.7;
    player.bob *= 0.9;
  }

  // *** Springen mit der Leertaste ***
  if (Input.hit('Space') && player.z === 0 && player.stun <= 0) {
    player.vz = JUMP_V;
    Sfx.jump();
    burst(player.x, player.y, 0, 6, 'rgba(230,225,210,.7)', 1.6, 0.6);
  }
  if (player.z > 0 || player.vz > 0) {
    player.vz -= GRAV;
    player.z += player.vz;
    if (player.z <= 0) {
      player.z = 0; player.vz = 0;
      burst(player.x, player.y, 0, 7, 'rgba(230,225,210,.75)', 2, 0.8);
      Sfx.land();
    }
  }

  player.x += player.vx;
  player.y += player.vy;
  player.hit = false;
  collide(player, PED_R, player.z > FLY_H);
  if (player.hit && player.z <= FLY_H) { player.vx *= 0.2; player.vy *= 0.2; }
}

/* ------------------------- Fahndung & Schaden ------------------------- */

function addWanted(n) {
  const before = player.wanted;
  player.wanted = clamp(player.wanted + n, 0, 5);
  player.crimeCd = 60 * 25;
  player.starCd = 60 * 8;
  if (player.wanted > before) Sfx.wanted();
}

function hurtPlayer(amount, knock) {
  if (player.hurtCd > 0) return;
  player.health -= amount;
  player.hurtCd = 24;
  Sfx.hurt();
  shake = Math.min(12, shake + 4);
  if (knock) {
    player.stun = 26;
    player.vx = -Math.cos(player.ang) * 4;
    player.vy = -Math.sin(player.ang) * 4;
  }
  if (player.health <= 0) {
    player.health = 0;
    state = 'dead';
    showOverlay('WASTED', 'R drücken für Neustart');
  }
}

/* ------------------------------ Aufträge ------------------------------ */

function newMission() {
  const p = randRoadPoint();
  mission = { stage: 'pickup', x: p.x, y: p.y, reward: 400 + ((rng() * 600) | 0) };
}

function updateMission() {
  if (!mission) return;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  if (dist2(px, py, mission.x, mission.y) < 34 * 34) {
    if (mission.stage === 'pickup') {
      mission.stage = 'drop';
      const d = randRoadPoint();
      mission.x = d.x; mission.y = d.y;
      Sfx.pickup();
      burst(px, py, 10, 16, '#ffd23f', 3, 2);
    } else {
      player.cash += mission.reward;
      Sfx.deliver();
      burst(px, py, 10, 22, '#2bff88', 3.5, 2.5);
      mission = null;
      setTimeout(newMission, 900);
    }
  }
}

/* ------------------------------ Ein-/Aussteigen ---------------------- */

function nearestCar(maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of cars) {
    if (c.dead || c.driver) continue;
    const d = dist2(c.x, c.y, player.x, player.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function toggleCar() {
  if (player.inside) return;
  if (player.car) {
    const c = player.car;
    if (c.z > 0) return;                              // nicht im Sprung aussteigen
    const off = c.ang + Math.PI / 2;
    player.x = c.x + Math.cos(off) * 34;
    player.y = c.y + Math.sin(off) * 34;
    player.z = 0; player.vz = 0; player.vx = player.vy = 0;
    collide(player, PED_R, false);
    c.driver = false;
    c.kind = 'parked'; c.spd *= 0.3;
    player.car = null;
  } else {
    const c = nearestCar(52);
    if (!c) return;
    if (c.kind === 'cop' || c.kind === 'traffic') addWanted(1);   // Autodiebstahl
    c.driver = true;
    player.car = c;
    Sfx.tone(300, 500, 0.1, 'square', 0.25);
  }
}

/* --------------------------- Häuser betreten --------------------------- */

/** Nächstes betretbares Haus, dessen Tür in Reichweite ist. */
function nearestDoor(maxD) {
  let best = null, bd = maxD * maxD;
  for (const b of World.buildings) {
    if (!b.door) continue;
    const d = dist2(b.door.x, b.door.y, player.x, player.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function exitBuilding() {
  const it = player.inside;
  if (!it) return;
  player.inside = null;
  player.x = it.outPos.x; player.y = it.outPos.y;
  player.z = 0; player.vz = 0; player.vx = player.vy = 0;
  collide(player, PED_R, false);
  Sfx.tone(520, 300, 0.12, 'sine', 0.22);
  setCamera();
}

function toggleBuilding() {
  if (player.car) return;
  if (player.inside) {
    const it = player.inside;
    if (dist2(player.x, player.y, it.inPos.x, it.inPos.y) > 46 * 46) {
      flashHint('Zum grünen Ausgang gehen');
      return;
    }
    exitBuilding();
  } else {
    const b = nearestDoor(46);
    if (!b) return;
    let it = interiors.get(b.id);
    if (!it) { it = makeInterior(b); interiors.set(b.id, it); }
    player.inside = it;
    player.x = it.inPos.x; player.y = it.inPos.y;
    player.z = 0; player.vz = 0; player.vx = player.vy = 0;
    Sfx.tone(300, 520, 0.12, 'sine', 0.22);
  }
  setCamera();
}

/** Kasse ausrauben - Geld gegen Fahndungsstufe. */
function robRegister() {
  const it = player.inside;
  if (!it || !it.register || it.register.looted) return false;
  if (dist2(player.x, player.y, it.register.x, it.register.y) > 40 * 40) return false;
  it.register.looted = true;
  player.cash += it.register.cash;
  burst(it.register.x, it.register.y, 34, 18, '#2bff88', 2.5, 2.5);
  Sfx.deliver();
  addWanted(2);
  flashHint('Kasse geplündert: $' + it.register.cash);
  return true;
}

/* ------------------------------- Update ------------------------------- */

/** Kamera sitzt im Kopf bzw. auf dem Fahrersitz. */
function setCamera() {
  if (player.car) {
    const c = player.car;
    cam.x = c.x - Math.cos(c.ang) * 2;
    cam.y = c.y - Math.sin(c.ang) * 2;
    cam.z = CAR_EYE + c.z;
    cam.roll = 0;
  } else {
    cam.x = player.x; cam.y = player.y;
    cam.z = EYE + player.z + Math.sin(player.bob) * 0.85;
    cam.roll = Math.sin(player.bob * 0.5) * 0.012;
  }
  cam.yaw = player.yaw;
  cam.pitch = clamp(player.pitch + player.recoil, -PITCH_MAX, PITCH_MAX);
  if (player.scoped) {                       // ruhige Hand, aber keine Statue
    player.sway += 0.019;
    cam.yaw += Math.sin(player.sway) * 0.0022;
    cam.pitch += Math.sin(player.sway * 0.73 + 1.2) * 0.0016;
  }
}


function update() {
  time += FRAME; frames++;

  // Waffenwechsel
  if (Input.hit('KeyQ')) switchWeapon((player.weapon + 1) % WEAPONS.length);
  if (Input.hit('Digit1')) switchWeapon(0);
  if (Input.hit('Digit2')) switchWeapon(SNIPER);

  // Zielfernrohr: rechte Maustaste halten, nur zu Fuß mit dem Sniper
  const canScope = player.weapon === SNIPER && !player.car;
  player.scoped = canScope && mouse.right;
  player.zoom = lerp(player.zoom, player.scoped ? WEAPONS[SNIPER].zoom : 1, 0.32);

  // Umsehen: horizontal frei, vertikal begrenzt
  if (player.car) {
    player.lookOff = clamp(player.lookOff + mouse.dx * MOUSE_SENS / player.zoom, -2.2, 2.2);
    player.yaw = player.car.ang + player.lookOff;
  } else {
    player.yaw += mouse.dx * MOUSE_SENS / player.zoom;
    if (player.yaw > Math.PI) player.yaw -= TAU;
    if (player.yaw < -Math.PI) player.yaw += TAU;
  }
  player.pitch = clamp(player.pitch - mouse.dy * MOUSE_SENS / player.zoom, -PITCH_MAX, PITCH_MAX);
  mouse.dx = mouse.dy = 0;
  player.recoil *= 0.86;                                   // Rückstoß federt zurück
  if (player.recoil < 0.0005) player.recoil = 0;

  if (player.car) updatePlayerCar(player.car);
  else updatePlayerOnFoot();
  setCamera();

  // Linke Maustaste: schießen
  if (player.fireCd > 0) player.fireCd--;
  if (player.muzzle > 0) player.muzzle--;
  if (mouse.left && player.fireCd === 0 && player.stun <= 0) playerShoot();
  updateBullets();

  // Rechte Maustaste (oder E): ein-/aussteigen; drinnen ist E die Kasse.
  // Mit gezogenem Sniper gehört die rechte Maustaste dem Zielfernrohr.
  const useHit = (mouse.rightHit && !canScope) || Input.hit('KeyE');
  mouse.rightHit = false;
  if (useHit) { if (!player.inside || !robRegister()) toggleCar(); }
  if (Input.hit('KeyB')) toggleBuilding();
  if (Input.hit('KeyH')) Sfx.horn();
  if (player.inside) {
    // Wer durch die Türöffnung nach draußen läuft, steht auch draußen
    const dr = player.inside.door;
    if ((player.x - dr.x) * dr.nx + (player.y - dr.y) * dr.ny > 1) exitBuilding();
    else updateInterior(player.inside);
  }
  updateStalker();

  // Fahndungslevel abbauen
  if (player.crimeCd > 0) player.crimeCd--;
  else if (player.wanted > 0 && --player.starCd <= 0) { player.wanted--; player.starCd = 60 * 8; }

  if (player.hurtCd > 0) player.hurtCd--;
  if (player.health < 100 && player.hurtCd === 0 && frames % 6 === 0) player.health = Math.min(100, player.health + 0.5);

  // Verkehr & Polizei
  for (const c of cars) {
    if (c.dead || c.driver) continue;
    if (c.kind === 'traffic') { if (dist2(c.x, c.y, player.x, player.y) < 1600 * 1600) updateTraffic(c); else c.dead = true; }
    else if (c.kind === 'cop') updateCop(c);
    if (c.kind !== 'cop' && dist2(c.x, c.y, player.x, player.y) > 1900 * 1900) c.dead = true;
  }
  for (const p of peds) if (!p.dead) updatePed(p);

  // Nachschub
  const traffic = cars.filter(c => c.kind === 'traffic' && !c.dead).length;
  if (traffic < 22 && frames % 20 === 0) spawnTraffic(1);
  const alivePeds = peds.filter(p => !p.dead && p.kind === 'civ').length;
  if (alivePeds < 34 && frames % 15 === 0) spawnPeds(2);

  const copCars = cars.filter(c => c.kind === 'cop' && !c.dead).length;
  if (copCars < player.wanted && frames % 45 === 0) spawnCop();
  const footCops = peds.filter(p => p.kind === 'cop' && !p.dead).length;
  if (player.wanted >= 2 && footCops < player.wanted - 1 && frames % 120 === 0) spawnFootCop();
  if (player.wanted === 0) {
    for (const p of peds) if (p.kind === 'cop') p.dead = true;
    for (const c of cars) if (c.kind === 'cop' && !inView(c.x, c.y, 300)) c.dead = true;
  }

  // Kugeln als kurze Leuchtspuren
  ctx.lineCap = 'round';
  for (const b of bullets) {
    ctx.strokeStyle = b.friendly ? 'rgba(255,236,160,.95)' : 'rgba(255,120,120,.95)';
    ctx.lineWidth = b.friendly ? 2.6 : 2.2;
    ctx.beginPath();
    ctx.moveTo(b.px - cam.x, b.py - cam.y);
    ctx.lineTo(b.x - cam.x, b.y - cam.y);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // Partikel
  for (const q of parts) {
    q.x += q.vx; q.y += q.vy; q.z += q.vz; q.vz -= 0.25;
    if (q.z < 0) { q.z = 0; q.vz *= -0.35; q.vx *= 0.6; q.vy *= 0.6; }
    q.vx *= 0.96; q.vy *= 0.96;
    q.life--;
  }
  if (frames % 30 === 0) {
    cars = cars.filter(c => !c.dead);
    peds = peds.filter(p => !p.dead);
  }
  parts = parts.filter(q => q.life > 0);

  updateMission();

  // Erschütterung wirkt nur auf das Bild, nicht auf das Zielen
  if (shake > 0) {
    cam.yaw += (rng() - 0.5) * shake * 0.006;
    cam.pitch += (rng() - 0.5) * shake * 0.004;
    shake *= 0.88;
  }

  // Hinweistext
  let h = '';
  if (flashCd > 0) { flashCd--; setHint(flashText); return; }
  if (player.inside) {
    const it = player.inside;
    if (it.register && !it.register.looted && dist2(player.x, player.y, it.register.x, it.register.y) < 40 * 40)
      h = '[E]  Kasse ausrauben';
    else if (dist2(player.x, player.y, it.inPos.x, it.inPos.y) < 46 * 46) h = '[B]  hinausgehen';
  }
  else if (!player.car && nearestDoor(46)) h = '[B]  Haus betreten';
  else if (!player.car && nearestCar(56))
    h = player.weapon === SNIPER ? '[E]  einsteigen' : '[RECHTSKLICK]  einsteigen';
  else if (player.car) h = '[RECHTSKLICK]  aussteigen   ·   [LEERTASTE]  Hüpfer   ·   [LINKSKLICK]  Drive-by';
  else if (player.z === 0) h = '';
  setHint(h);
}

/* ------------------------------ Rendering ------------------------------ */

function render() {
  ctx.save();
  if (cam.roll) { ctx.translate(VW / 2, VH / 2); ctx.rotate(cam.roll); ctx.translate(-VW / 2, -VH / 2); }

  setFov(FOV / player.zoom);
  if (player.inside) renderInterior(ctx, player.inside, VW, VH, time, frames);
  else render3d(ctx, VW, VH, time, frames);

  // Innenraum bzw. Waffe im Vordergrund
  if (player.car) drawDashboard(ctx, VW, VH, player.car, player.car.steerVis || 0);
  if (player.zoom < 1.35) {                     // im Zoom stört das Waffenmodell
    const mz = drawWeapon(ctx, VW, VH, player.bob, player.muzzle > 0 ? 1 : 0, !!player.car, player.weapon);
    if (player.muzzle > 0) drawMuzzleFlash(ctx, mz);
  }
  ctx.restore();

  // Dunst und Abendstimmung (vorgerendert)
  ctx.drawImage(overlayCv, 0, 0, VW, VH);

  drawDreadOverlay(ctx, VW, VH);

  if (player.hurtCd > 18) {
    ctx.fillStyle = `rgba(180,0,40,${(player.hurtCd - 18) * 0.04})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  if (player.zoom > 1.35) drawScope(ctx, VW, VH, player.zoom, WEAPONS[SNIPER].zoom, player.fireCd);
  else drawCrosshair(ctx, VW, VH, player.fireCd > 4 ? 6 : 0);
  if (!player.inside) drawCompass();
  drawMinimap();
  updateHud();
}

/** Auftragsrichtung als Peilung am oberen Bildrand. */
function drawCompass() {
  if (!mission) return;
  const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
  const rel = angDiff(cam.yaw, Math.atan2(mission.y - py, mission.x - px));
  const col = mission.stage === 'pickup' ? '#ffd23f' : '#2bff88';
  const half = VW * 0.34;
  const fv = currentFov();
  const x = clamp(VW / 2 + rel / (fv / 2) * (VW / 2), VW / 2 - half, VW / 2 + half);
  const y = 92;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = col;
  ctx.beginPath();
  if (Math.abs(rel) > fv / 2) {                       // außerhalb des Blickfelds: Pfeil zur Seite
    const dir = rel > 0 ? 1 : -1;
    ctx.moveTo(x + dir * 13, y); ctx.lineTo(x - dir * 6, y - 9); ctx.lineTo(x - dir * 6, y + 9);
  } else {
    ctx.moveTo(x, y + 10); ctx.lineTo(x - 9, y - 6); ctx.lineTo(x + 9, y - 6);
  }
  ctx.closePath(); ctx.fill();
  const d = Math.round(dist(px, py, mission.x, mission.y) / 10);
  ctx.font = 'bold 13px Verdana,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText(d + ' m', x, y - 14);
  ctx.restore();
}

/* ------------------------------ Minimap ------------------------------ */

function drawMinimap() {
  if (player.inside) { drawInteriorMap(); return; }
  const S = mini.width, R = S / 2, range = 900;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath(); mctx.arc(R, R, R - 2, 0, TAU); mctx.clip();
  mctx.fillStyle = '#3a3a48'; mctx.fillRect(0, 0, S, S);
  mctx.translate(R, R);
  mctx.rotate(-cam.yaw - Math.PI / 2);                 // vorne ist oben
  mctx.translate(-R, -R);

  const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
  const k = R / range;
  const m = (wx, wy) => [R + (wx - px) * k, R + (wy - py) * k];

  for (const c of World.cells) {
    if (Math.abs(c.x - px) > range + CS || Math.abs(c.y - py) > range + CS) continue;
    const [x, y] = m(c.x, c.y);
    mctx.fillStyle = c.kind === 'park' ? '#3f8f5c' : c.kind === 'beach' ? '#e0c48f' : '#6b6b80';
    mctx.fillRect(x, y, c.s * k, c.s * k);
  }
  if (WORLD - py < range) { const [, wy] = m(0, WORLD); mctx.fillStyle = '#1d7a99'; mctx.fillRect(0, wy, S, S - wy); }

  for (const c of cars) {
    if (c.dead || c.driver) continue;
    const [x, y] = m(c.x, c.y);
    if (x < 0 || y < 0 || x > S || y > S) continue;
    mctx.fillStyle = c.kind === 'cop' ? '#3b7bff' : 'rgba(230,230,240,.6)';
    mctx.fillRect(x - 2, y - 2, 4, 4);
  }
  if (stalkerPresent() && stalker.near > 0.35 && frames % 20 < 12) {
    const [x, y] = m(stalker.x, stalker.y);
    mctx.fillStyle = 'rgba(255,40,60,.9)';
    mctx.beginPath(); mctx.arc(x, y, 5, 0, TAU); mctx.fill();
  }
  if (mission) {
    const [x, y] = m(mission.x, mission.y);
    mctx.fillStyle = mission.stage === 'pickup' ? '#ffd23f' : '#2bff88';
    mctx.beginPath();
    mctx.arc(x, y, 5, 0, TAU);
    mctx.fill();
  }
  mctx.restore();
  // Blickrichtung zeigt auf der Karte immer nach oben
  mctx.save();
  mctx.translate(R, R);
  mctx.fillStyle = 'rgba(255,255,255,.13)';
  mctx.beginPath();
  mctx.moveTo(0, 0);
  mctx.arc(0, 0, R * 0.9, -Math.PI / 2 - currentFov() / 2, -Math.PI / 2 + currentFov() / 2);
  mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.moveTo(0, -8); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill();
  mctx.restore();
}

/** Grundriss des betretenen Hauses. */
function drawInteriorMap() {
  const it = player.inside, S = mini.width, R = S / 2;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath(); mctx.arc(R, R, R - 2, 0, TAU); mctx.clip();
  mctx.fillStyle = '#1a1826'; mctx.fillRect(0, 0, S, S);
  mctx.translate(R, R);
  mctx.rotate(-cam.yaw - Math.PI / 2);
  const k = Math.min(1.5, (R * 1.5) / Math.max(it.b.w, it.b.h));
  mctx.scale(k, k);
  mctx.translate(-player.x, -player.y);

  mctx.fillStyle = '#575269';
  mctx.fillRect(it.b.x, it.b.y, it.b.w, it.b.h);
  mctx.fillStyle = '#8f8aa6';
  mctx.fillRect(it.x0, it.y0, it.x1 - it.x0, it.y1 - it.y0);
  mctx.fillStyle = '#3f3b50';
  for (const p of it.solids) if (p.z1 > 12) mctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  mctx.fillStyle = '#2bff88';                                   // Ausgang
  mctx.beginPath(); mctx.arc(it.inPos.x, it.inPos.y, 7 / k, 0, TAU); mctx.fill();
  if (it.register && !it.register.looted) {
    mctx.fillStyle = '#ffd23f';
    mctx.beginPath(); mctx.arc(it.register.x, it.register.y, 6 / k, 0, TAU); mctx.fill();
  }
  mctx.fillStyle = 'rgba(255,90,120,.9)';
  for (const p of it.peds) if (!p.dead) { mctx.beginPath(); mctx.arc(p.x, p.y, 5 / k, 0, TAU); mctx.fill(); }
  mctx.restore();

  mctx.save();
  mctx.translate(R, R);
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.moveTo(0, -8); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill();
  mctx.restore();
}

/* -------------------------------- HUD -------------------------------- */

const el = {
  hud: document.getElementById('hud'),
  stars: document.getElementById('stars'),
  health: document.querySelector('#healthbar i'),
  cash: document.getElementById('cash'),
  weapon: document.getElementById('weapon'),
  mission: document.getElementById('mission'),
  hint: document.getElementById('hint'),
  speedo: document.getElementById('speedo'),
  kmh: document.getElementById('kmh'),
  overlay: document.getElementById('overlay'),
  menu: document.getElementById('menu')
};
let lastHud = {};

function setHint(t) {
  if (t === hintText) return;
  hintText = t;
  el.hint.textContent = t;
  el.hint.classList.toggle('on', !!t);
}

function updateHud() {
  const stars = '★'.repeat(player.wanted) + '☆'.repeat(5 - player.wanted);
  if (stars !== lastHud.stars) { el.stars.textContent = player.wanted ? stars : ''; lastHud.stars = stars; }
  const hp = Math.round(player.health);
  if (hp !== lastHud.hp) { el.health.style.width = hp + '%'; lastHud.hp = hp; }
  if (player.cash !== lastHud.cash) { el.cash.textContent = '$' + player.cash.toLocaleString('de-DE'); lastHud.cash = player.cash; }
  if (player.weapon !== lastHud.weapon) {
    el.weapon.textContent = WEAPONS[player.weapon].name;
    el.weapon.classList.toggle('sniper', player.weapon === SNIPER);
    lastHud.weapon = player.weapon;
  }

  const mt = !mission ? 'Auftrag wird geladen …'
    : mission.stage === 'pickup' ? '📦 Paket abholen (gelber Marker)'
      : `🏁 Abliefern — $${mission.reward}`;
  if (mt !== lastHud.mt) { el.mission.textContent = mt; lastHud.mt = mt; }

  const drv = !!player.car;
  el.speedo.classList.toggle('on', drv);
  if (drv) {
    const kmh = Math.round(Math.abs(player.car.spd) * 22);
    if (kmh !== lastHud.kmh) { el.kmh.textContent = kmh; lastHud.kmh = kmh; }
  }
}

function showOverlay(big, sub) {
  el.overlay.querySelector('.big').textContent = big;
  el.overlay.querySelector('.sub').textContent = sub;
  el.overlay.classList.remove('hidden');
}
function hideOverlay() { el.overlay.classList.add('hidden'); }

/* ------------------------------- Ablauf ------------------------------- */

function resetGame(full) {
  if (full) {
    World.generate();
    cars = []; peds = []; parts = []; bullets = [];
    spawnParked();
  } else {
    cars = cars.filter(c => c.kind === 'parked');
    peds = []; parts = []; bullets = [];
  }
  const start = { x: CS * 2, y: CS * 2 + CS / 2 };
  player.x = start.x; player.y = start.y;
  player.z = player.vz = player.vx = player.vy = 0;
  player.health = 100; player.wanted = 0; player.stun = 0; player.hurtCd = 0;
  player.car = null;
  player.inside = null;
  player.weapon = 0; player.scoped = false; player.zoom = 1; player.recoil = 0;
  stalker.active = false; stalker.cd = ST_FIRST; stalker.near = 0; stalker.inside = null;
  if (full) stalker.banished = 0;
  if (full) { player.cash = 0; player.kills = 0; interiors.clear(); }
  player.yaw = -Math.PI / 2; player.pitch = 0; player.lookOff = 0; player.bob = 0;
  setCamera();
  lastHud = {};
  spawnTraffic(18);
  spawnPeds(30);
  newMission();
  hideOverlay();
}

let acc = 0, last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(now - last, 100);
  last = now;
  if (state === 'menu') { Input.endFrame(); return; }

  // Pause und Neustart gelten in jedem Spielzustand
  if (state !== 'dead' && Input.hit('KeyP')) {
    if (state === 'play') { state = 'pause'; showOverlay('PAUSE', 'Klicken zum Weiterspielen'); document.exitPointerLock(); }
    else { state = 'play'; hideOverlay(); requestLock(); }
  }
  if (Input.hit('KeyR')) { resetGame(false); state = 'play'; }

  if (state === 'play') {
    acc += dt;
    let steps = 0;
    while (acc >= FRAME && steps < 5) { update(); acc -= FRAME; steps++; }
    render();
    // Tastendrücke erst verwerfen, wenn wirklich ein Schritt lief
    // (sonst schluckt ein 144-Hz-Monitor Eingaben)
    if (steps > 0) Input.endFrame();
  } else {
    render();
    Input.endFrame();
  }
}

function start() {
  Sfx.init(); Sfx.resume();
  el.menu.classList.add('hidden');
  el.hud.classList.remove('hidden');
  resetGame(true);
  state = 'play';
  requestLock();
}

/* -------------------------- Maus & Zeigersperre -------------------------- */

function requestLock() {
  if (canvas.requestPointerLock) canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === canvas;
  if (!mouse.locked) {
    mouse.left = mouse.right = false;
    if (state === 'play') { state = 'pause'; showOverlay('PAUSE', 'Klicken zum Weiterspielen'); }
  } else if (state === 'pause') { state = 'play'; hideOverlay(); }
});

addEventListener('mousemove', e => {
  if (!mouse.locked) return;
  mouse.dx += e.movementX || 0;
  mouse.dy += e.movementY || 0;
});

addEventListener('mousedown', e => {
  if (state === 'menu') return;
  if (!mouse.locked) { requestLock(); e.preventDefault(); return; }   // erst zurück ins Spiel
  if (state !== 'play') return;
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) { mouse.right = true; mouse.rightHit = true; e.preventDefault(); }
});
addEventListener('mouseup', e => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
addEventListener('contextmenu', e => { if (state !== 'menu') e.preventDefault(); });
addEventListener('blur', () => { mouse.left = mouse.right = false; mouse.dx = mouse.dy = 0; });

document.getElementById('startbtn').addEventListener('click', start);
addEventListener('keydown', e => { if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) start(); });

resize();
Input.init();
World.generate();
requestAnimationFrame(loop);
