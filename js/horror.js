'use strict';

/* ------------------------------------------------------------------ *
 *  DER FREMDE
 *  Eine hagere Gestalt, die den Spieler durch Neo Miami verfolgt.
 *  Sie erstarrt, solange man sie ansieht, und holt auf, sobald man
 *  wegschaut. Wer zu lange starrt, verliert sie aus den Augen - dann
 *  steht sie im Rücken.
 * ------------------------------------------------------------------ */

const ST_HEIGHT   = 34;      // Körperhöhe (Passanten: 18)
const ST_SPEED    = 4.9;     // schneller als Sprinten (4,3), langsamer als jedes Auto
const ST_TOUCH    = 24;      // ab hier greift sie an
const ST_HP       = 240;     // Pistole 12, Sniper 4 Treffer
const ST_STARE    = 60 * 4;  // so lange hält sie das Angestarrtwerden aus
const ST_FIRST    = 60 * 40; // erster Auftritt nach 40 Sekunden
const ST_RETURN   = 60 * 75; // Rückkehr nach dem Vertreiben
const ST_GIVEUP   = 1500;    // ab dieser Entfernung lässt sie ab

const stalker = {
  active: false, x: 0, y: 0, hp: ST_HP,
  cd: ST_FIRST,          // Frames bis zum nächsten Auftritt
  stared: 0,             // wie lange sie schon angesehen wird
  seen: false,           // im Blickfeld und nicht verdeckt
  near: 0,               // 0..1 Nähegefühl, treibt Herzschlag und Bildeffekt
  hunt: 0,               // Frames seit dem Auftritt
  inside: null,          // Innenraum, in dem sie steht (null = draußen)
  phase: 0,              // Schwebeanimation
  hitFlash: 0,
  banished: 0            // Zähler der vertriebenen Auftritte
};

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

function spawnStalker() {
  const s = stalkerSpawnSpot();
  stalker.x = s.x; stalker.y = s.y;
  stalker.active = true;
  stalker.hp = ST_HP;
  stalker.stared = 0;
  stalker.hunt = 0;
  stalker.near = 0;
  stalker.inside = player.inside;
  Sfx.dread();
  Sfx.whisper(1);
}

/** Aus den Augen verlieren und im Rücken wieder auftauchen. */
function relocateStalker() {
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
  stalker.x = x; stalker.y = y;
  stalker.stared = 0;
  Sfx.whisper(0.9);
}

function despawnStalker(cdFrames) {
  stalker.active = false;
  stalker.cd = cdFrames;
  stalker.near = 0;
  stalker.stared = 0;
}

function banishStalker() {
  burst(stalker.x, stalker.y, 18, 40, 'rgba(20,16,30,.95)', 4, 4);
  burst(stalker.x, stalker.y, 24, 16, '#8f4bd8', 3.5, 3);
  Sfx.banish();
  shake = Math.min(20, shake + 12);
  player.cash += 1500;
  stalker.banished++;
  flashHint('DER FREMDE IST FORT  —  $1.500');
  despawnStalker(ST_RETURN);
}

/** Treffer einstecken. Gibt true zurück, wenn die Kugel verbraucht ist. */
function hitStalker(x, y, z, dmg) {
  if (!stalker.active) return false;
  if (stalker.inside !== (player.inside || null)) return false;
  if (dist2(x, y, stalker.x, stalker.y) > 15 * 15) return false;
  if (z < 0 || z > ST_HEIGHT + 4) return false;
  stalker.hp -= dmg;
  stalker.hitFlash = 8;
  burst(x, y, z, 8, 'rgba(30,20,45,.9)', 2.4, 1.8);
  Sfx.tone(140, 60, 0.16, 'sawtooth', 0.24);
  if (stalker.hp <= 0) banishStalker();
  return true;
}

/* ----------------------------- Verhalten ----------------------------- */

/** Sieht der Spieler die Gestalt gerade an - im Blickfeld und frei? */
function stalkerObserved() {
  const dx = stalker.x - preyX(), dy = stalker.y - preyY();
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

function updateStalker() {
  stalker.phase += 0.03;
  if (stalker.hitFlash > 0) stalker.hitFlash--;

  if (!stalker.active) {
    if (--stalker.cd <= 0) spawnStalker();
    return;
  }

  stalker.hunt++;
  // Wechselt der Spieler zwischen drinnen und draußen, folgt sie beim nächsten Blickabwenden
  const sameSpace = stalker.inside === (player.inside || null);
  const d = dist(stalker.x, stalker.y, preyX(), preyY());

  if (!sameSpace) {
    if (stalker.hunt > 60 * 6) { stalker.inside = player.inside || null; relocateStalker(); }
    stalker.near = 0;
    return;
  }
  if (d > ST_GIVEUP) { despawnStalker(ST_RETURN * 0.6); return; }

  stalker.seen = stalkerObserved();
  if (stalker.seen) {
    stalker.stared++;
    if (stalker.stared > ST_STARE) relocateStalker();  // hält Blicke nicht ewig aus
  } else {
    stalker.stared = Math.max(0, stalker.stared - 2);
    // Unbeobachtet holt sie auf - zu Fuß entkommt man ihr nicht, mit dem Wagen schon
    const a = Math.atan2(preyY() - stalker.y, preyX() - stalker.x);
    const sp = ST_SPEED;
    stalker.x += Math.cos(a) * sp;
    stalker.y += Math.sin(a) * sp;
    stalker.hit = false;
    if (player.inside) collideInside(player.inside, stalker, 10, false);
    else collide(stalker, 10, false);
  }

  // Nähe treibt Herzschlag, Flüstern und Bildstörung
  stalker.near = clamp(1 - (d - ST_TOUCH) / 320, 0, 1);
  if (stalker.near > 0.12) {
    const iv = Math.round(lerp(52, 16, stalker.near));
    if (frames % iv === 0) Sfx.heartbeat(0.35 + stalker.near * 0.65);
    if (frames % 190 === 0) Sfx.whisper(stalker.near * 0.8);
  }

  // Berührung
  if (d < ST_TOUCH && !player.car) {
    if (frames % 12 === 0) hurtPlayer(9, false);
    shake = Math.min(18, shake + 3);
    if (frames % 48 === 0) Sfx.scream();
  }
}

/* ----------------------------- Darstellung ----------------------------- */

/** Steht die Gestalt gerade im selben Raum wie der Spieler? */
function stalkerPresent() {
  return stalker.active && stalker.inside === (player.inside || null);
}

function drawStalker3(ctx, d) {
  const base = project(stalker.x, stalker.y, 0);
  const float = Math.sin(stalker.phase) * 0.8;
  const top = project(stalker.x, stalker.y, ST_HEIGHT + float);
  if (!base || !top) return;
  const h = base.y - top.y;
  if (h < 2) return;
  const w = h * 0.20;
  const cx = base.x, ty = top.y;

  // Dunkler Hof um die Gestalt
  ctx.save();
  const halo = ctx.createRadialGradient(cx, ty + h * 0.45, 0, cx, ty + h * 0.45, Math.max(w * 3, 10));
  halo.addColorStop(0, 'rgba(8,4,16,.55)');
  halo.addColorStop(1, 'rgba(8,4,16,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, ty + h * 0.45, Math.max(w * 3, 10), 0, TAU); ctx.fill();
  ctx.restore();

  drawShadow3(ctx, stalker.x + 2, stalker.y + 2, 11, 8, 0.4);

  const body = stalker.hitFlash > 0 ? '#43304f' : '#12101c';
  // Beine
  ctx.fillStyle = body;
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
  // Rumpf, nach unten schmal auslaufend
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.52, ty + h * 0.16);
  ctx.quadraticCurveTo(cx - w * 0.62, ty + h * 0.38, cx - w * 0.34, ty + h * 0.58);
  ctx.lineTo(cx + w * 0.34, ty + h * 0.58);
  ctx.quadraticCurveTo(cx + w * 0.62, ty + h * 0.38, cx + w * 0.52, ty + h * 0.16);
  ctx.closePath();
  ctx.fill();
  // Überlange Arme
  ctx.strokeStyle = body;
  ctx.lineWidth = Math.max(1, w * 0.17);
  ctx.lineCap = 'round';
  const arm = Math.sin(stalker.phase * 0.8) * h * 0.015;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.48, ty + h * 0.20);
  ctx.quadraticCurveTo(cx - w * 0.85, ty + h * 0.48, cx - w * 0.66, ty + h * 0.80 + arm);
  ctx.moveTo(cx + w * 0.48, ty + h * 0.20);
  ctx.quadraticCurveTo(cx + w * 0.85, ty + h * 0.48, cx + w * 0.66, ty + h * 0.80 - arm);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Kopf: bleich und ohne Züge
  ctx.fillStyle = stalker.hitFlash > 0 ? '#efe6f5' : '#cfc7d8';
  ctx.beginPath();
  ctx.ellipse(cx, ty + h * 0.085, w * 0.30, h * 0.085, 0, 0, TAU);
  ctx.fill();
  // Augen
  const eg = 0.55 + 0.45 * Math.sin(stalker.phase * 2.1);
  ctx.fillStyle = `rgba(255,${60 + eg * 60},${40 + eg * 30},${0.8 + eg * 0.2})`;
  const er = Math.max(0.8, w * 0.075);
  ctx.beginPath(); ctx.arc(cx - w * 0.11, ty + h * 0.075, er, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + w * 0.11, ty + h * 0.075, er, 0, TAU); ctx.fill();
  if (d < 320) {                                     // Glimmen der Augen
    const g = ctx.createRadialGradient(cx, ty + h * 0.075, 0, cx, ty + h * 0.075, er * 9);
    g.addColorStop(0, `rgba(255,90,50,${0.30 * eg})`);
    g.addColorStop(1, 'rgba(255,90,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, ty + h * 0.075, er * 9, 0, TAU); ctx.fill();
  }
}

/** Bildstörung, wenn sie nah ist: Puls, Entsättigung, dunkle Ränder. */
function drawDreadOverlay(ctx, vw, vh) {
  const n = stalker.near;
  if (n <= 0.05) return;
  const pulse = 0.5 + 0.5 * Math.sin(stalker.phase * 3.1);
  ctx.save();
  const v = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * (0.34 - n * 0.16),
    vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(${Math.round(20 + 40 * n)},0,${Math.round(10 + 20 * n)},${0.35 + 0.5 * n})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, vw, vh);
  if (n > 0.55) {                                    // Herzschlag im Bild
    ctx.fillStyle = `rgba(120,0,20,${(n - 0.55) * 0.4 * pulse})`;
    ctx.fillRect(0, 0, vw, vh);
  }
  ctx.restore();
}
