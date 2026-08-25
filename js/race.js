'use strict';

/* ------------------------------------------------------------------ *
 *  Straßenrennen: Route über Kreuzungen, drei Rivalen, Preisgeld.
 *  Start mit [N] aus dem fahrenden Auto heraus - die Strecke wird von
 *  der aktuellen Position und Blickrichtung aus gewürfelt.
 * ------------------------------------------------------------------ */

const CP_R      = 56;                       // Torradius (Straße ist 104 breit)
const CP_HEIGHT = 70;                       // Torhöhe
const RACE_PRIZE = [3000, 1500, 700, 250];  // Preisgeld nach Platz
const RIVAL_COLORS = ['#ff2e63', '#7cff5a', '#8a7bff'];
const RACE_TIMEOUT = 60 * 240;              // vier Minuten, dann ist Schluss

const Race = {
  phase: 'off',        // off | countdown | run
  cps: [],             // Tore der Reihe nach
  rest: [],            // Streckenrest ab Tor k
  idx: 0,              // nächstes Tor des Spielers
  startPt: null,       // Startlinie - Bezugspunkt für das erste Segment
  racers: [],
  t: 0,                // Rennzeit in Frames
  count: 0,            // Countdown in Frames
  finished: 0,         // Rivalen, die schon durch das Ziel sind
  resultCd: 0, resultBig: '', resultSub: '', resultWin: false,

  get active() { return this.phase === 'countdown' || this.phase === 'run'; },
  /** Während des Countdowns steht das Spielerauto still. */
  frozen() { return this.phase === 'countdown'; },

  /* ------------------------------ Start ------------------------------ */

  toggle() {
    if (this.active) { this.abort('RENNEN ABGEBROCHEN'); return; }
    if (player.inside) { flashHint('Im Haus fährt niemand Rennen.'); return; }
    if (!player.car) { flashHint('Erst ein Auto besorgen — [RECHTSKLICK] einsteigen, dann [N]'); return; }
    this.begin();
  },

  begin() {
    const c = player.car;
    const route = this.buildRoute(c.x, c.y, c.ang);
    if (route.cps.length < 3) { flashHint('Hier ist kein Platz für eine Strecke.'); return; }
    this.cps = route.cps;
    this.startPt = route.start;
    this.rest = this.cps.map((_, k) => {          // Streckenrest ab Tor k
      let d = 0;
      for (let n = k; n < this.cps.length - 1; n++)
        d += dist(this.cps[n].x, this.cps[n].y, this.cps[n + 1].x, this.cps[n + 1].y);
      return d;
    });
    this.idx = 0; this.t = 0; this.finished = 0;
    this.count = 3 * 60 + 30;
    this.resultCd = 0;
    this.phase = 'countdown';
    c.spd = 0;
    this.spawnRivals(route);
    flashHint('STRASSENRENNEN — ' + this.cps.length + ' Tore, drei Rivalen');
  },

  /**
   * Strecke als Folge von Kreuzungen: geradeaus wird bevorzugt, Kehrtwenden
   * gibt es nie. Zwischen zwei Toren liegt damit immer eine gerade Straße -
   * auch beim ersten, denn die Startlinie wird auf die Straßenachse gelegt,
   * auf der der Spieler gerade fährt.
   */
  buildRoute(sx, sy, ang) {
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    const alongX = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
    let i, j, dir, start;
    if (alongX) {
      dir = Math.cos(ang) > 0 ? 0 : 2;
      j = clamp(Math.round(sy / CS), 1, GRID - 1);
      i = clamp(dir === 0 ? Math.floor(sx / CS) + 1 : Math.ceil(sx / CS) - 1, 1, GRID - 1);
      start = { x: sx, y: j * CS, ang, dir };
    } else {
      dir = Math.sin(ang) > 0 ? 1 : 3;
      i = clamp(Math.round(sx / CS), 1, GRID - 1);
      j = clamp(dir === 1 ? Math.floor(sy / CS) + 1 : Math.ceil(sy / CS) - 1, 1, GRID - 1);
      start = { x: i * CS, y: sy, ang, dir };
    }

    // Erstes Tor: die nächste Kreuzung voraus, danach frei gewürfelt
    const cps = [{ x: i * CS, y: j * CS, ang: Math.atan2(DY[dir], DX[dir]), last: false }];
    const n = 8 + ((rng() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const opts = [];
      for (const nd of [dir, (dir + 1) % 4, (dir + 3) % 4]) {
        for (const len of [1, 2]) {
          const ni = i + DX[nd] * len, nj = j + DY[nd] * len;
          if (ni < 1 || nj < 1 || ni > GRID - 1 || nj > GRID - 1) continue;
          opts.push({ nd, len, ni, nj, w: nd === dir ? 3 : 1 });
        }
      }
      if (!opts.length) break;
      let total = 0;
      for (const o of opts) total += o.w;
      let r = rng() * total, pick = opts[opts.length - 1];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      i = pick.ni; j = pick.nj; dir = pick.nd;
      cps.push({ x: i * CS, y: j * CS, ang: Math.atan2(DY[dir], DX[dir]), last: false });
    }
    if (cps.length) cps[cps.length - 1].last = true;
    return { cps, start };
  },

  /** Startaufstellung auf der Straßenachse, gestaffelt hinter dem Spieler. */
  spawnRivals(route) {
    this.racers = [];
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    const fx = DX[route.start.dir], fy = DY[route.start.dir];
    const ox = -fy, oy = fx;
    const slots = [[-32, -58], [32, -58], [0, -112]];      // quer, längs - alle hinter dem Spieler
    slots.forEach((s, k) => {
      const x = route.start.x + ox * s[0] + fx * s[1];
      const y = route.start.y + oy * s[0] + fy * s[1];
      const c = makeCar(x, y, Math.atan2(fy, fx), 'racer');
      c.color = RIVAL_COLORS[k];
      // an der Karre des Spielers ausgerichtet - im Van ist das Feld langsamer
      const base = clamp(player.car ? player.car.max : 8.4, 6.8, 9.4);
      c.max = base * (0.96 + rng() * 0.1);
      c.acc = 0.25 + rng() * 0.06;
      c.spd = 0; c.cp = 0; c.finish = 0; c.num = k + 1;
      c.lane = (rng() - 0.5) * 26;                          // eigene Ideallinie
      c.hit = false;
      collide(c, 18, false);                                // nicht in einer Wand starten
      cars.push(c);
      this.racers.push(c);
    });
  },

  /* ----------------------------- Ablauf ----------------------------- */

  update() {
    if (this.resultCd > 0) this.resultCd--;
    if (!this.active) return;

    if (!player.car || player.car.dead || player.inside) { this.abort('RENNEN ABGEBROCHEN'); return; }

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.count / 60);
      this.count--;
      const now = Math.ceil(this.count / 60);
      if (now !== before) { if (now > 0) Sfx.raceBeep(); else Sfx.raceGo(); }
      if (this.count <= 0) this.phase = 'run';
      return;
    }

    this.t++;
    if (this.t > RACE_TIMEOUT) { this.abort('ZEIT ABGELAUFEN'); return; }

    const c = player.car, cp = this.cps[this.idx];
    if (cp && dist2(c.x, c.y, cp.x, cp.y) < CP_R * CP_R) {
      this.idx++;
      burst(cp.x, cp.y, 16, 14, '#ffb02e', 3, 3);
      if (this.idx >= this.cps.length) { this.finishPlayer(); return; }
      Sfx.checkpoint();
    }
  },

  finishPlayer() {
    const place = 1 + this.racers.filter(r => r.finish).length;
    const prize = RACE_PRIZE[Math.min(place, RACE_PRIZE.length) - 1];
    player.cash += prize;
    this.resultBig = 'PLATZ ' + place;
    this.resultSub = 'Zeit ' + this.clock() + '   ·   Preisgeld $' + prize.toLocaleString('de-DE');
    this.resultWin = place === 1;
    this.resultCd = 60 * 5;
    if (place === 1) Sfx.fanfare(); else Sfx.deliver();
    burst(player.car.x, player.car.y, 12, 30, place === 1 ? '#ffd23f' : '#2bff88', 4, 3.5);
    this.stop();
  },

  abort(msg) {
    if (!this.active) return;
    this.resultBig = msg;
    this.resultSub = 'Tor ' + Math.min(this.idx + 1, this.cps.length) + ' von ' + this.cps.length;
    this.resultWin = false;
    this.resultCd = 60 * 3;
    Sfx.raceFail();
    this.stop();
  },

  /** Rennbetrieb beenden - die Rivalen rollen aus und bleiben als Beute stehen. */
  stop() {
    for (const r of this.racers) if (!r.dead) { r.kind = 'parked'; r.spd *= 0.35; }
    this.racers = [];
    this.cps = []; this.rest = [];
    this.idx = 0;
    this.phase = 'off';
  },

  reset() {
    for (const r of this.racers) r.dead = true;
    this.racers = []; this.cps = []; this.rest = []; this.idx = 0;
    this.phase = 'off'; this.resultCd = 0; this.t = 0;
  },

  /* ---------------------------- Rivalen-KI ---------------------------- */

  /** Restdistanz bis ins Ziel - Sortierschlüssel für Platzierung und Gummiband. */
  remaining(x, y, cpIdx) {
    const cp = this.cps[cpIdx];
    if (!cp) return 0;
    return dist(x, y, cp.x, cp.y) + this.rest[cpIdx];
  },

  updateRacer(c) {
    if (this.phase === 'countdown') { c.spd *= 0.6; return; }
    if (this.phase !== 'run' || c.finish) {              // ausrollen lassen
      c.spd *= 0.94;
      c.x += Math.cos(c.ang) * c.spd;
      c.y += Math.sin(c.ang) * c.spd;
      return;
    }

    const b = this.cps[c.cp];
    if (!b) { c.finish = ++this.finished; return; }
    const a = c.cp === 0 ? this.startPt : this.cps[c.cp - 1];

    // Ideallinie: ein Stück voraus auf der Verbindung zweier Tore - das
    // hält die Rivalen auf der Straße statt quer durch die Häuserblocks.
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const s = clamp((c.x - a.x) * ux + (c.y - a.y) * uy + 95, 0, L);
    const tx = a.x + ux * s - uy * c.lane;
    const ty = a.y + uy * s + ux * c.lane;

    const d = angDiff(c.ang, Math.atan2(ty - c.y, tx - c.x));
    c.ang += clamp(d, -0.062, 0.062);

    // Vorausschau: wer auf ein Heck aufläuft, geht vom Gas und zieht daneben
    const pc = player.car;
    let blocked = 0;
    const fx2 = c.x + Math.cos(c.ang) * 46, fy2 = c.y + Math.sin(c.ang) * 46;
    if (pc && dist2(fx2, fy2, pc.x, pc.y) < 34 * 34) blocked = 1;
    for (const o of this.racers) {
      if (o === c || o.dead) continue;
      if (dist2(fx2, fy2, o.x, o.y) < 32 * 32) { blocked = 1; break; }
    }
    if (blocked) c.lane = clamp(c.lane + (c.lane >= 0 ? 0.9 : -0.9), -34, 34);

    // Gummiband: wer abgehängt ist, holt auf; wer führt, wird nicht unfair schnell
    const gap = this.remaining(c.x, c.y, c.cp) - this.remaining(player.car.x, player.car.y, this.idx);
    const rubber = clamp(1 + gap * 0.00035, 0.88, 1.15);
    const corner = Math.abs(d) > 0.5 ? 0.55 : Math.abs(d) > 0.22 ? 0.8 : 1;
    c.spd = lerp(c.spd, c.max * corner * rubber * (blocked ? 0.6 : 1), 0.055);

    const px = c.x, py = c.y;
    c.x += Math.cos(c.ang) * c.spd;
    c.y += Math.sin(c.ang) * c.spd;
    c.hit = false;
    collide(c, 18, false);
    if (c.hit) { c.spd *= 0.6; if (rng() < 0.06) { c.x = px; c.y = py; c.ang += 0.7; } }

    // Rempeln: kostet beide Tempo, tut aber niemandem weh. Der Mindestabstand
    // wird hart durchgesetzt, sonst klebt ein Rivale vor der Windschutzscheibe.
    const MIN = 44;
    if (pc && dist2(c.x, c.y, pc.x, pc.y) < MIN * MIN) {
      const dd = dist(c.x, c.y, pc.x, pc.y) || 0.01;
      const push = Math.atan2(c.y - pc.y, c.x - pc.x);
      const gapFix = MIN - dd;
      c.x += Math.cos(push) * gapFix * 0.8;
      c.y += Math.sin(push) * gapFix * 0.8;
      pc.x -= Math.cos(push) * gapFix * 0.2;
      pc.y -= Math.sin(push) * gapFix * 0.2;
      const rel = Math.abs(c.spd) + Math.abs(pc.spd);
      if (rel > 7) { shake = Math.min(12, shake + rel * 0.5); Sfx.crash(); }
      c.spd *= 0.82; pc.spd *= 0.94;
      c.hit = false;
      collide(c, 18, false);
    }

    if (dist2(c.x, c.y, b.x, b.y) < CP_R * CP_R) c.cp++;
  },

  /* ------------------------------ Anzeige ------------------------------ */

  /** Nächstes Tor - Kompass und Minimap peilen es an. */
  target() { return this.active ? this.cps[this.idx] : null; },

  /** Die nächsten Tore für den 3D-Aufbau, mit Farbe und Höhe. */
  gates(out) {
    out.length = 0;
    if (!this.active) return out;
    for (let k = this.idx; k < Math.min(this.idx + 3, this.cps.length); k++) {
      const cp = this.cps[k];
      const next = k === this.idx;
      out.push({
        x: cp.x, y: cp.y, ang: cp.ang, h3: CP_HEIGHT, next,
        color: cp.last ? '#2bff88' : next ? '#ff9f43' : '#2bd9ff',
        alpha: next ? 0.85 + Math.sin(frames * 0.12) * 0.14 : 0.42 - (k - this.idx) * 0.12
      });
    }
    return out;
  },

  placeNow() {
    if (!player.car) return 1;
    const pr = this.remaining(player.car.x, player.car.y, this.idx);
    let place = 1;
    for (const r of this.racers) if (!r.dead && this.remaining(r.x, r.y, r.cp) < pr) place++;
    return place;
  },

  clock() {
    const s = this.t / 60;
    const m = (s / 60) | 0;
    const rest = s - m * 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(1);
  },

  hudText() {
    if (!this.active) return '';
    const field = 1 + this.racers.filter(r => !r.dead).length;
    if (this.phase === 'countdown') return '🏁 GLEICH GEHT ES LOS — ' + this.cps.length + ' TORE';
    return '🏁 P' + this.placeNow() + '/' + field +
      '   ·   TOR ' + Math.min(this.idx + 1, this.cps.length) + '/' + this.cps.length +
      '   ·   ' + this.clock();
  },

  /** Countdown und Ergebnis groß in die Bildmitte. */
  drawOverlay(ctx, vw, vh) {
    ctx.save();
    ctx.textAlign = 'center';
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.count / 60);
      const txt = n > 0 ? String(Math.min(3, n)) : 'LOS!';
      const frac = 1 - (this.count % 60) / 60;
      ctx.globalAlpha = clamp(1.15 - frac * 0.5, 0, 1);
      ctx.font = 'bold ' + (n > 0 ? 150 : 104) + 'px Impact,"Arial Black",sans-serif';
      ctx.fillStyle = n > 0 ? '#ffd23f' : '#2bff88';
      ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 24;
      ctx.fillText(txt, vw / 2, vh / 2 + 30);
    } else if (this.resultCd > 0) {
      ctx.globalAlpha = clamp(this.resultCd / 45, 0, 1);
      ctx.font = 'bold 78px Impact,"Arial Black",sans-serif';
      ctx.fillStyle = this.resultWin ? '#ffd23f' : '#ff6ec7';
      ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 22;
      ctx.fillText(this.resultBig, vw / 2, vh * 0.36);
      ctx.font = 'bold 20px Verdana,sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillText(this.resultSub, vw / 2, vh * 0.36 + 36);
    }
    ctx.restore();
  },

  /** Strecke, Tore und Rivalen auf der Minimap. */
  drawMap(mctx, m) {
    if (!this.active) return;
    mctx.save();
    mctx.strokeStyle = 'rgba(255,159,67,.75)';
    mctx.lineWidth = 2.5;
    mctx.beginPath();
    const s = m(this.startPt.x, this.startPt.y);
    mctx.moveTo(s[0], s[1]);
    for (const cp of this.cps) { const p = m(cp.x, cp.y); mctx.lineTo(p[0], p[1]); }
    mctx.stroke();
    this.cps.forEach((cp, k) => {
      const p = m(cp.x, cp.y);
      mctx.fillStyle = cp.last ? '#2bff88' : k === this.idx ? '#ffb02e' : 'rgba(255,255,255,.55)';
      mctx.beginPath(); mctx.arc(p[0], p[1], k === this.idx ? 5 : 3, 0, TAU); mctx.fill();
    });
    mctx.restore();
  }
};
