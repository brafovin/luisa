'use strict';

/* ------------------------------------------------------------------ *
 *  ZWEI JÄGER
 *  Beide erstarren, solange man sie ansieht - und genau darin liegt
 *  die Klemme: hinsehen kann man immer nur bei einem.
 *
 *  DER FREMDE   hager, über drei Meter, bleiches Gesicht, glimmende Augen
 *  DER SCHATTEN geduckt, schnell, eine schwarze Masse mit kalten Augen
 * ------------------------------------------------------------------ */

const ST_GIVEUP = 1500;      // ab dieser Entfernung lassen sie ab

const STALKER_TYPES = [
  {
    key: 'fremde', name: 'DER FREMDE', form: 'tall',
    height: 34, speed: 4.9, hp: 240, touch: 24, reward: 1500,
    stareMax: 60 * 4, first: 60 * 40, ret: 60 * 75,
    body: '#12101c', bodyHit: '#43304f', head: '#cfc7d8',
    eye: [255, 96, 52], dread: [64, 0, 18]
  },
  {
    key: 'schatten', name: 'DER SCHATTEN', form: 'hunched',
    height: 25, speed: 5.7, hp: 150, touch: 22, reward: 900,
    stareMax: 60 * 3, first: 60 * 78, ret: 60 * 60,
    body: '#07080e', bodyHit: '#2f4652', head: null,
    eye: [130, 255, 236], dread: [0, 34, 46]
  }
];

function makeStalker(type, idx) {
  return {
    type, idx, active: false, x: 0, y: 0, hp: type.hp,
    cd: type.first, stared: 0, seen: false, near: 0,
    hunt: 0, inside: null, phase: idx * 2.1, hitFlash: 0, banished: 0
  };
}
const stalkers = STALKER_TYPES.map(makeStalker);

/** Tatsächlicher Aufenthaltsort: im Auto zählt der Wagen, nicht die alte Position. */
function preyX() { return player.car ? player.car.x : player.x; }
function preyY() { return player.car ? player.car.y : player.y; }

/* ---------------------------- Auftritt ---------------------------- */

/** Punkt außerhalb des Blickfelds, in mittlerer Entfernung. */
function stalkerSpawnSpot() {
  if (player.inside) {
    const it = player.inside;
    let best = null, bd = -1;
    for (let k = 0; k < 24; k++) {                    // Ecke möglichst weit weg
      const x = it.x0 + 18 + rng() * Math.max(1, it.x1 - it.x0 - 36);
      const y = it.y0 + 18 + rng() * Math.max(1, it.y1 - it.y0 - 36);
      const d = dist2(x, y, preyX(), preyY());
      if (d > bd) { bd = d; best = { x, y }; }
    }
    return best;
  }
  for (let k = 0; k < 40; k++) {
    const a = rng() * TAU, r = 220 + rng() * 220;
    const x = clamp(preyX() + Math.cos(a) * r, 30, WORLD - 30);
    const y = clamp(preyY() + Math.sin(a) * r, 30, WORLD - 30);
    if (bulletBlocked(x, y, 15)) continue;            // nicht in einer Wand
    const rel = Math.abs(angDiff(cam.yaw, Math.atan2(y - preyY(), x - preyX())));
    if (rel < currentFov() * 0.75) continue;          // nicht vor der Nase erscheinen
    return { x, y };
  }
  return { x: preyX() - Math.cos(cam.yaw) * 260, y: preyY() - Math.sin(cam.yaw) * 260 };
}

function spawnStalker(s) {
  const spot = stalkerSpawnSpot();
  s.x = spot.x; s.y = spot.y;
  s.active = true;
  s.hp = s.type.hp;
  s.stared = 0; s.hunt = 0; s.near = 0;
  s.inside = player.inside;
  Sfx.dread();
  Sfx.whisper(1);
}

/** Aus den Augen verlieren und im Rücken wieder auftauchen. */
function relocateStalker(s) {
  const back = cam.yaw + Math.PI + (rng() - 0.5) * 1.2;
  const r = 150 + rng() * 120;
  let x = preyX() + Math.cos(back) * r, y = preyY() + Math.sin(back) * r;
  if (player.inside) {
    const it = player.inside;
    x = clamp(x, it.x0 + 14, it.x1 - 14);
    y = clamp(y, it.y0 + 14, it.y1 - 14);
  } else {
    x = clamp(x, 30, WORLD - 30); y = clamp(y, 30, WORLD - 30);
  }
  s.x = x; s.y = y;
  s.stared = 0;
  Sfx.whisper(0.9);
}

function despawnStalker(s, cdFrames) {
  s.active = false;
  s.cd = cdFrames;
  s.near = 0;
  s.stared = 0;
}

function banishStalker(s) {
  burst(s.x, s.y, 18, 40, 'rgba(20,16,30,.95)', 4, 4);
  burst(s.x, s.y, 24, 16, `rgb(${s.type.eye[0]},${s.type.eye[1]},${s.type.eye[2]})`, 3.5, 3);
  Sfx.banish();
  shake = Math.min(20, shake + 12);
  player.cash += s.type.reward;
  s.banished++;
  flashHint(s.type.name + ' IST FORT  —  $' + s.type.reward.toLocaleString('de-DE'));
  despawnStalker(s, s.type.ret);
}

/** Treffer einstecken. Gibt true zurück, wenn die Kugel verbraucht ist. */
function hitStalker(x, y, z, dmg) {
  for (const s of stalkers) {
    if (!s.active || s.inside !== (player.inside || null)) continue;
    if (dist2(x, y, s.x, s.y) > 15 * 15) continue;
    if (z < 0 || z > s.type.height + 4) continue;
    s.hp -= dmg;
    s.hitFlash = 8;
    burst(x, y, z, 8, 'rgba(30,20,45,.9)', 2.4, 1.8);
    Sfx.tone(140, 60, 0.16, 'sawtooth', 0.24);
    if (s.hp <= 0) banishStalker(s);
    return true;
  }
  return false;
}

/* ----------------------------- Verhalten ----------------------------- */

/** Sieht der Spieler die Gestalt gerade an - im Blickfeld und frei? */
function stalkerObserved(s) {
  const dx = s.x - preyX(), dy = s.y - preyY();
  const rel = Math.abs(angDiff(cam.yaw, Math.atan2(dy, dx)));
  if (rel > currentFov() * 0.48) return false;
  const d = Math.hypot(dx, dy);
  const steps = Math.min(60, Math.max(4, d / 14));
  for (let i = 1; i < steps; i++) {                   // Sichtlinie prüfen
    const t = i / steps;
    const bx = preyX() + dx * t, by = preyY() + dy * t;
    if (player.inside ? blockedInside(player.inside, bx, by, 15) : bulletBlocked(bx, by, 15)) return false;
  }
  return true;
}

function updateOneStalker(s) {
  s.phase += 0.03;
  if (s.hitFlash > 0) s.hitFlash--;

  if (!s.active) {
    if (--s.cd <= 0) spawnStalker(s);
    return;
  }

  s.hunt++;
  const sameSpace = s.inside === (player.inside || null);
  const d = dist(s.x, s.y, preyX(), preyY());

  if (!sameSpace) {                                   // folgt beim nächsten Blickabwenden nach
    if (s.hunt > 60 * 6) { s.inside = player.inside || null; relocateStalker(s); }
    s.near = 0;
    return;
  }
  if (d > ST_GIVEUP) { despawnStalker(s, s.type.ret * 0.6); return; }

  s.seen = stalkerObserved(s);
  if (s.seen) {
    s.stared++;
    if (s.stared > s.type.stareMax) relocateStalker(s);  // hält Blicke nicht ewig aus
  } else {
    s.stared = Math.max(0, s.stared - 2);
    const a = Math.atan2(preyY() - s.y, preyX() - s.x);
    s.x += Math.cos(a) * s.type.speed;
    s.y += Math.sin(a) * s.type.speed;
    s.hit = false;
    if (player.inside) collideInside(player.inside, s, 10, false);
    else collide(s, 10, false);
  }

  s.near = clamp(1 - (d - s.type.touch) / 320, 0, 1);

  // Berührung
  if (d < s.type.touch && !player.car) {
    if (frames % 12 === 0) hurtPlayer(s.type.form === 'tall' ? 9 : 7, false);
    shake = Math.min(18, shake + 3);
    if (frames % 48 === 0) Sfx.scream();
  }
}

/** Wie bedrängt ist der Spieler gerade - der nächste Jäger gibt den Ton an. */
function worstStalker() {
  let best = null;
  for (const s of stalkers) {
    if (!s.active || s.inside !== (player.inside || null)) continue;
    if (!best || s.near > best.near) best = s;
  }
  return best;
}

function updateStalkers() {
  for (const s of stalkers) updateOneStalker(s);

  // Herzschlag und Flüstern richten sich nach dem nächsten der beiden
  const w = worstStalker();
  const near = w ? w.near : 0;
  if (near > 0.12) {
    const iv = Math.round(lerp(52, 16, near));
    if (frames % iv === 0) Sfx.heartbeat(0.35 + near * 0.65);
    if (frames % 190 === 0) Sfx.whisper(near * 0.8);
  }
}

/** Alle Gestalten, die gerade im selben Raum wie der Spieler stehen. */
function presentStalkers() {
  const out = [];
  for (const s of stalkers) if (s.active && s.inside === (player.inside || null)) out.push(s);
  return out;
}

/* ----------------------------- Darstellung ----------------------------- */

function drawStalker3(ctx, s, d) {
  const t = s.type;
  const base = project(s.x, s.y, 0);
  const float = Math.sin(s.phase) * 0.8;
  const top = project(s.x, s.y, t.height + float);
  if (!base || !top) return;
  const h = base.y - top.y;
  if (h < 2) return;
  const w = h * (t.form === 'tall' ? 0.20 : 0.38);
  const cx = base.x, ty = top.y;

  // Dunkler Hof
  ctx.save();
  // Radius begrenzen: aus der Nähe kosten große Verläufe unnötig viel Füllfläche
  const hr = clamp(w * (t.form === 'tall' ? 3 : 1.7), 10, 150);
  const halo = ctx.createRadialGradient(cx, ty + h * 0.45, 0, cx, ty + h * 0.45, hr);
  halo.addColorStop(0, 'rgba(8,4,16,.55)');
  halo.addColorStop(1, 'rgba(8,4,16,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, ty + h * 0.45, hr, 0, TAU); ctx.fill();
  ctx.restore();

  drawShadow3(ctx, s.x + 2, s.y + 2, t.form === 'tall' ? 11 : 15, 8, 0.4);

  const body = s.hitFlash > 0 ? t.bodyHit : t.body;
  const eg = 0.55 + 0.45 * Math.sin(s.phase * 2.1);

  if (t.form === 'tall') {
    ctx.fillStyle = body;                              // Beine
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, ty + h * 0.52);
    ctx.lineTo(cx - w * 0.20, base.y);
    ctx.lineTo(cx - w * 0.02, base.y);
    ctx.lineTo(cx - w * 0.04, ty + h * 0.52);
    ctx.moveTo(cx + w * 0.34, ty + h * 0.52);
    ctx.lineTo(cx + w * 0.20, base.y);
    ctx.lineTo(cx + w * 0.02, base.y);
    ctx.lineTo(cx + w * 0.04, ty + h * 0.52);
    ctx.fill();
    ctx.beginPath();                                   // Rumpf
    ctx.moveTo(cx - w * 0.52, ty + h * 0.16);
    ctx.quadraticCurveTo(cx - w * 0.62, ty + h * 0.38, cx - w * 0.34, ty + h * 0.58);
    ctx.lineTo(cx + w * 0.34, ty + h * 0.58);
    ctx.quadraticCurveTo(cx + w * 0.62, ty + h * 0.38, cx + w * 0.52, ty + h * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = body;                            // überlange Arme
    ctx.lineWidth = Math.max(1, w * 0.17);
    ctx.lineCap = 'round';
    const arm = Math.sin(s.phase * 0.8) * h * 0.015;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.48, ty + h * 0.20);
    ctx.quadraticCurveTo(cx - w * 0.85, ty + h * 0.48, cx - w * 0.66, ty + h * 0.80 + arm);
    ctx.moveTo(cx + w * 0.48, ty + h * 0.20);
    ctx.quadraticCurveTo(cx + w * 0.85, ty + h * 0.48, cx + w * 0.66, ty + h * 0.80 - arm);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = s.hitFlash > 0 ? '#efe6f5' : t.head;   // bleicher Kopf
    ctx.beginPath();
    ctx.ellipse(cx, ty + h * 0.085, w * 0.30, h * 0.085, 0, 0, TAU);
    ctx.fill();
    drawStalkerEyes(ctx, cx, ty + h * 0.075, w * 0.11, Math.max(0.8, w * 0.075), t.eye, eg, d);

  } else {
    // Geduckte Masse: Buckel hinten oben, Kopf tief nach vorn geschoben
    const lurch = Math.sin(s.phase * 1.6) * h * 0.035;
    const sideways = Math.sin(s.phase * 0.9) * w * 0.06;

    ctx.strokeStyle = body;                            // Arme zuerst, sie ragen seitlich heraus
    ctx.lineWidth = Math.max(1, w * 0.15);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, ty + h * 0.22);
    ctx.quadraticCurveTo(cx - w * 0.82, ty + h * 0.46, cx - w * 0.60, base.y - h * 0.02 + lurch);
    ctx.moveTo(cx + w * 0.26, ty + h * 0.22);
    ctx.quadraticCurveTo(cx + w * 0.82, ty + h * 0.46, cx + w * 0.60, base.y - h * 0.02 - lurch);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.fillStyle = body;                              // Rumpf mit Buckel
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.46, base.y);
    ctx.quadraticCurveTo(cx - w * 0.52, ty + h * 0.40, cx - w * 0.30 + sideways, ty + h * 0.14);
    ctx.quadraticCurveTo(cx + sideways, ty - h * 0.02, cx + w * 0.34 + sideways, ty + h * 0.18);
    ctx.quadraticCurveTo(cx + w * 0.50, ty + h * 0.46, cx + w * 0.46, base.y);
    ctx.closePath();
    ctx.fill();

    // Kopf: eigener, minimal hellerer Klumpen tief vor dem Buckel
    const hy = ty + h * 0.40 + lurch;
    ctx.fillStyle = s.hitFlash > 0 ? t.bodyHit : '#14161f';
    ctx.beginPath();
    ctx.ellipse(cx, hy, w * 0.30, h * 0.115, 0, 0, TAU);
    ctx.fill();
    // Nacken zum Buckel
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.22, hy - h * 0.02);
    ctx.lineTo(cx - w * 0.14, ty + h * 0.20);
    ctx.lineTo(cx + w * 0.16, ty + h * 0.20);
    ctx.lineTo(cx + w * 0.22, hy - h * 0.02);
    ctx.closePath(); ctx.fill();
    // kein Gesicht, nur zwei kalte Lichter im Dunkeln
    drawStalkerEyes(ctx, cx, hy, w * 0.14, Math.max(0.9, w * 0.055), t.eye, eg, d);
  }
}

function drawStalkerEyes(ctx, cx, cy, gap, r, eye, eg, d) {
  ctx.fillStyle = `rgba(${eye[0]},${Math.round(eye[1] * (0.55 + eg * 0.45))},${eye[2]},${0.8 + eg * 0.2})`;
  ctx.beginPath(); ctx.arc(cx - gap, cy, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + gap, cy, r, 0, TAU); ctx.fill();
  if (d < 320) {
    const gr = clamp(r * 9, 4, 70);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
    g.addColorStop(0, `rgba(${eye[0]},${eye[1]},${eye[2]},${0.30 * eg})`);
    g.addColorStop(1, `rgba(${eye[0]},${eye[1]},${eye[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, gr, 0, TAU); ctx.fill();
  }
}

/*
 * Bildstörung, wenn einer nah ist - eingefärbt nach dem, der drückt.
 * Der Verlauf wird je Typ einmal vorgerendert; pro Frame bleibt ein Blit.
 * Das Zulaufen der Ränder entsteht durch leichtes Aufskalieren.
 */
const _dreadCv = [];
function dreadLayer(i, vw, vh) {
  let cv = _dreadCv[i];
  if (cv && cv.width === vw && cv.height === vh) return cv;
  cv = _dreadCv[i] = document.createElement('canvas');
  cv.width = Math.max(1, vw); cv.height = Math.max(1, vh);
  const c = STALKER_TYPES[i].dread;
  const g2 = cv.getContext('2d');
  const v = g2.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.30,
    vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},1)`);
  g2.fillStyle = v;
  g2.fillRect(0, 0, vw, vh);
  return cv;
}

function drawDreadOverlay(ctx, vw, vh) {
  const w = worstStalker();
  if (!w || w.near <= 0.05) return;
  const n = w.near, c = w.type.dread;
  const pulse = 0.5 + 0.5 * Math.sin(w.phase * 3.1);
  const k = 1 + n * 0.34;                            // Ränder laufen zu
  ctx.save();
  ctx.globalAlpha = clamp(0.35 + 0.5 * n, 0, 1) * clamp(0.3 + n, 0, 1);
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(k, k);
  ctx.drawImage(dreadLayer(w.idx, vw, vh), -vw / 2, -vh / 2);
  ctx.restore();
  if (n > 0.55) {                                    // Herzschlag im Bild
    ctx.fillStyle = `rgba(${c[0] + 60},${c[1]},${c[2] + 10},${(n - 0.55) * 0.4 * pulse})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}
