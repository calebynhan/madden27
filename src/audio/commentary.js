// Broadcast booth. Every finished play becomes a spoken play-by-play call, and now and then
// a second voice adds color from the game's own box score: stat lines, the score, what a
// conversion or a stop means. All lines are original templates filled with the names,
// yardage and field position from the play itself. Pure logic (no DOM) so it can be tested
// headless; speaking is done by the Voices class in audio.js.

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const ordWord = (n) => ORD[n] || `${n}th`;
const yds = (n) => (n === 1 ? 'a yard' : `${n} yards`);
const DOWN = ['', 'First', 'Second', 'Third', 'Fourth'];

export class Booth {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.mode = 'all'; // 'all' | 'big' | 'off'
    this.lastIdx = new Map();
    this.pre = null;
    this.sinceColor = 3;
    this.lastSituation = null;
  }

  // Pick a template from a group, never the same one twice in a row.
  pick(key, arr) {
    let i = Math.floor(this.rng() * arr.length);
    if (arr.length > 1 && this.lastIdx.get(key) === i) i = (i + 1 + Math.floor(this.rng() * (arr.length - 1))) % arr.length;
    this.lastIdx.set(key, i);
    return arr[i];
  }
  chance(p) { return this.rng() < p; }

  // ------------------------------------------------------------ helpers
  nick(g, t) { return g.teams[t].def.name; }
  city(g, t) { return g.teams[t].def.city; }
  last(e) { return e && e.p ? e.p.last : 'the ball carrier'; }
  full(e) { return e && e.p ? `${e.p.first} ${e.p.last}` : 'the ball carrier'; }
  // "the Boston 35", "midfield", "the 3"
  spot(g, team, x) {
    const yl = g.yardLineOf(team, x);
    if (Math.abs(yl - 50) < 0.5) return 'midfield';
    if (yl < 50) { const n = Math.round(yl); return n <= 0 ? 'the goal line' : `the ${this.city(g, team)} ${n}`; }
    const n = Math.round(100 - yl);
    if (n <= 0) return 'the goal line';
    return n <= 5 ? `the ${n}` : `the ${this.city(g, 1 - team)} ${n}`;
  }
  scoreLine(g, team) {
    const a = g.score[team], b = g.score[1 - team];
    if (a === b) return this.pick('tied', [`And we're all even at ${a}.`, `That ties it up at ${a}.`, `All square, ${a} apiece.`]);
    if (a > b) return this.pick('lead', [`The ${this.nick(g, team)} lead it, ${a} to ${b}.`, `That makes it ${a} to ${b}, ${this.nick(g, team)}.`, `${this.nick(g, team)} in front, ${a} to ${b}.`]);
    return this.pick('trail', [`The ${this.nick(g, team)} still trail, ${b} to ${a}.`, `That cuts it to ${b} to ${a}.`, `It's ${b} to ${a}, and the ${this.nick(g, team)} are within ${b - a}.`]);
  }

  // ------------------------------------------------------------ situation
  // Captured at the snap: down, distance and field position before the play ran.
  snap(g) {
    const s = g.sim;
    if (!s) return;
    const off = g.possession;
    const goal = g.oppGoal ? g.oppGoal(off) : null;
    this.pre = {
      kind: s.kind, down: g.down, off,
      togo: Math.abs(g.lineToGain - g.ballX),
      goalToGo: goal !== null && Math.abs(g.lineToGain - goal) < 0.01,
      yl: g.yardLineOf(off, g.ballX),
      quarter: g.quarter, clock: g.clock,
    };
  }

  // Spoken at the play-call screen on the downs that matter (optional line).
  situation(g) {
    if (this.mode !== 'all' || !g.sim || g.sim.kind !== 'scrimmage' || g.conversion) return null;
    const off = g.possession, d = g.down;
    const key = `${g.quarter}:${Math.round(g.clock)}:${d}:${Math.round(g.ballX)}`;
    if (this.lastSituation === key) return null;
    const togo = Math.abs(g.lineToGain - g.ballX);
    const goal = g.oppGoal(off);
    const gtg = Math.abs(g.lineToGain - goal) < 0.01;
    const dist = gtg ? 'goal' : togo < 0.6 ? 'inches' : `${Math.round(togo)}`;
    const where = this.spot(g, off, g.ballX);
    const diff = g.score[off] - g.score[1 - off];
    let line = null;
    if (g.quarter >= 4 && g.clock <= 120 && diff < 0 && diff >= -8 && this.chance(0.6)) {
      line = this.pick('late', [
        `${Math.ceil(g.clock / 60) <= 1 ? 'Under a minute to go' : 'Inside two minutes'}, and the ${this.nick(g, off)} need a score.`,
        `Clock is the enemy now. ${this.nick(g, off)} down ${-diff}, ${DOWN[d].toLowerCase()} and ${dist}.`,
      ]);
    } else if (d === 4) {
      line = `Fourth and ${dist}${gtg ? ' from' : ' at'} ${where}.`;
    } else if (d === 3 && this.chance(0.55)) {
      line = this.pick('third', [`Third and ${dist}${gtg ? ' from' : ' at'} ${where}.`, `Big third down here. Third and ${dist}.`, `Third and ${dist} for the ${this.nick(g, off)}.`]);
    } else if (d === 1 && gtg && this.chance(0.7)) {
      line = `First and goal from ${where}.`;
    }
    if (line) this.lastSituation = key;
    return line;
  }

  // ------------------------------------------------------------ the call
  // Returns { pbp, color, big } for a finished play, or null when there's nothing to say
  // (e.g. a penalty wiped the play out; the flag itself is announced separately).
  call(g, s, r) {
    if (this.mode === 'off' || !s || !r) return null;
    const text = g.lastText || '';
    if (/^PENALTY/.test(text)) return null;
    let out = null;
    if (/two-point/i.test(text)) out = this.conversion(g, s, r, text);
    else if (s.kind === 'scrimmage') out = this.scrimmage(g, s, r, text);
    else if (s.kind === 'kickoff' || s.kind === 'onside') out = this.kickoff(g, s, r, text);
    else if (s.kind === 'punt') out = this.punt(g, s, r, text);
    else if (s.kind === 'fg' || s.kind === 'xp') out = this.kick(g, s, r, text);
    if (!out || !out.pbp) return null;
    if (this.mode === 'big' && !out.big) return null;
    if (out.color) this.sinceColor = 0; else this.sinceColor++;
    return out;
  }

  conversion(g, s, r, text) {
    const off = s.offIdx;
    if (/GOOD/.test(text)) return { pbp: this.pick('2pt', [`The two-point try is good! ${this.nick(g, off)} get two.`, `They convert! Two-point conversion is good.`]), color: this.scoreLine(g, off), big: true };
    if (/returned/.test(text)) return { pbp: 'The try fails, and the defense takes it all the way back for two!', color: null, big: true };
    return { pbp: this.pick('2ptno', ['The two-point try falls short.', 'They don\'t get it. The conversion fails.']), color: null, big: true };
  }

  scrimmage(g, s, r, text) {
    const off = s.offIdx, def = 1 - off, dir = s.dir;
    const byId = (id) => (id === null || id === undefined ? null : s.ents.find((e) => e.id === id));
    const pre = this.pre && this.pre.kind === 'scrimmage' ? this.pre : null;
    let gain = r.turnover ? 0 : (r.endX - s.losX) * dir;
    if (r.td === off) gain = (g.oppGoal(off) - s.losX) * dir;
    const n = Math.round(gain), an = Math.abs(n);
    const pt = r.playType;
    const passer = byId(r.stats.passer), recv = byId(r.stats.receiver), target = byId(r.stats.target);
    const first = /FIRST DOWN/.test(text), downs = /Turnover on downs/.test(text);
    const endSpot = this.spot(g, off, r.endX);
    const moves = r.events.filter((e) => e.type === 'evade' || e.type === 'brokentackle');
    let pbp = '', color = null, big = false;
    const T = this.nick(g, off), D = this.nick(g, def);

    if (pt === 'kneel') return { pbp: this.pick('kneel', [`${this.last(s.qb)} takes a knee.`, 'And they\'ll just take a knee.']), color: null, big: false };
    if (pt === 'spike') return { pbp: `${this.last(s.qb)} spikes it to stop the clock.`, color: null, big: false };

    const fumLost = !!(r.stats.fumbleBy && r.turnover && !r.stats.intBy);
    if (fumLost) {
      // Ball out and the defense has it (possibly all the way back for six)
      const fb = byId(r.stats.fumbleBy), ff = byId(r.stats.forcedBy);
      const who = this.last(fb);
      if (pt === 'sack') pbp = `${ff ? this.last(ff) : 'The rush'} strips ${who}! The ball is loose, and the ${D} have it!`;
      else pbp = this.pick('fum', [`${who} is hit${ff ? ` by ${this.last(ff)}` : ''}, and the ball comes loose! The ${D} recover!`, `Fumble! ${who} puts it on the ground, and the ${D} come up with it!`]);
      if (r.td === def) { pbp += ' And they take it all the way back! Touchdown!'; color = this.scoreLine(g, def); }
      else if (this.chance(0.5)) color = this.pick('fumc', ['Huge momentum swing.', 'You cannot put the ball on the ground there.']);
      return { pbp, color, big: true };
    }

    if (pt === 'sack') {
      const sk = byId(r.stats.sackBy);
      const qb = this.last(s.qb), who = this.last(sk);
      pbp = this.pick('sack', [
        `${qb} is sacked! ${who} gets home, and that's a loss of ${an}.`,
        `${who} comes free and drops ${qb} for a loss of ${an}.`,
        `Nowhere to go. ${qb} goes down, sacked by ${who}.`,
        `Pressure, and ${qb} is taken down by ${who}. Loss of ${an}.`,
      ]);
      big = true;
      if (r.stats.fumbleBy) pbp += ' The ball comes out, but they hang on to it.';
      const st = sk && g.box.players.get(sk.id);
      if (st && st.sacks >= 2 && this.chance(0.7)) color = `That's sack number ${st.sacks} today for ${this.full(sk)}.`;
    } else if (s.thrown && passer) {
      const q = this.last(passer);
      if (r.stats.intBy) {
        const ip = byId(r.stats.intBy), d = this.last(ip);
        big = true;
        if (r.td === def) {
          pbp = this.pick('pick6', [`${q} throws... intercepted! ${d} has it, and he is gone! Pick six!`, `Picked off by ${d}, and there's nobody between him and the end zone. Touchdown, ${D}!`]);
          color = this.scoreLine(g, def);
        } else {
          const ret = this.spot(g, def, r.endX);
          pbp = this.pick('int', [
            `${q} throws... and it's intercepted! ${d} picks it off.`,
            `Picked off! ${d} jumps the route and takes it back to ${ret}.`,
            `${q} under pressure, and ${d} steps in front of it. Interception!`,
            `Intercepted by ${d}! ${D} take over at ${ret}.`,
          ]);
          const st = ip && g.box.players.get(ip.id);
          if (st && st.defint >= 2) color = `That's his ${ordWord(st.defint)} interception of the game!`;
          else if (this.chance(0.5)) color = this.pick('intc', ['What a time for a mistake.', `${q} would love to have that one back.`, 'He never saw the defender sitting there.']);
        }
      } else if (recv) {
        const c = this.last(recv);
        const air = Math.round(r.stats.airYards || 0);
        const catchType = r.events.find((e) => e.type === 'catchtype');
        if (r.td === off) {
          big = true;
          pbp = an >= 25
            ? this.pick('ptdlong', [`${q} lets it fly, ${c} has a step... touchdown, ${T}!`, `${q} deep for ${c}... he's got it, and he's in! A ${an}-yard touchdown!`])
            : this.pick('ptd', [`${q} finds ${c} in the end zone! Touchdown, ${T}!`, `${q} fires... caught by ${c}! Touchdown!`, `${c} makes the grab for the score! Touchdown, ${T}!`]);
          color = this.scoreLine(g, off);
        } else {
          if (an >= 25) {
            big = true;
            pbp = gain - air >= 12 && air < 12
              ? this.pick('yac', [`${q} hits ${c} short, and he turns it up field! ${an} yards, all the way to ${endSpot}.`, `Short pass to ${c}, he makes a man miss, and he's off for ${an}!`])
              : this.pick('deep', [`${q} goes deep... caught by ${c}! A gain of ${an}!`, `${q} lets it fly, and ${c} hauls it in at ${endSpot}!`, `Big strike! ${q} to ${c} for ${an} yards.`]);
          } else if (an >= 10) {
            pbp = this.pick('mid', [`${q} finds ${c} over the middle for ${an}.`, `${q} to ${c}, a gain of ${an}.`, `${c} makes the catch at ${endSpot}. ${an} yards.`, `${q} fires to ${c} for ${an}.`]);
          } else if (n > 0) {
            pbp = this.pick('short', [`${q} dumps it off to ${c} for ${yds(an)}.`, `Quick throw to ${c}, ${yds(an)}.`, `${q} hits ${c} for ${yds(an)}.`, `${c} catches it and is brought down after ${yds(an)}.`]);
          } else if (n === 0) {
            pbp = `${q} to ${c}, and he's stopped right there. No gain.`;
          } else {
            pbp = `${q} throws to ${c}, but he's dropped behind the line for a loss of ${an}.`;
          }
          if (catchType && catchType.mode === 'aggr' && an >= 8) pbp = `${c} goes up and takes it away! ` + pbp;
          if (r.oob && !first) pbp += this.pick('oobp', [' He gets out of bounds.', ' And he steps out to stop the clock.']);
        }
        if (!color && r.td === null) {
          const st = g.box.players.get(recv.id);
          if (st && st.rec >= 4 && this.chance(0.45)) color = `That's catch number ${st.rec} for ${this.full(recv)}, ${st.recyds} yards on the day.`;
          else if (this.chance(0.25)) {
            const qs = g.box.players.get(passer.id);
            if (qs && qs.att >= 8) color = `${q} is now ${qs.cmp} of ${qs.att} for ${qs.pyds} yards.`;
          }
        }
      } else {
        // Incomplete
        const why = r.events.find((e) => e.type === 'incomplete');
        const dfd = why && why.by ? byId(why.by) : null;
        const t = target ? this.last(target) : null;
        if (s.thrownAway || r.events.some((e) => e.type === 'throwaway')) {
          pbp = this.pick('away', [`Nothing open, and ${q} throws it away.`, `${q} under pressure, gets rid of it out of bounds.`, `${q} lives to fight another down. Thrown away.`]);
        } else if (dfd) {
          pbp = this.pick('pbu', [`${q} looking for ${t || 'his man'}... broken up by ${this.last(dfd)}!`, `Knocked away! Great play on the ball by ${this.last(dfd)}.`, `${q} throws for ${t || 'the receiver'}, and ${this.last(dfd)} gets a hand on it. Incomplete.`]);
        } else if (why && why.why === 'overthrown') {
          pbp = this.pick('over', [`${q} fires for ${t || 'the receiver'}, but it sails high. Incomplete.`, `Overthrown. ${t || 'The receiver'} couldn't get to it.`]);
        } else if (why && why.why === 'oob') {
          pbp = `${q} throws to the sideline for ${t || 'his receiver'}, but it's out of bounds. Incomplete.`;
        } else {
          pbp = this.pick('inc', [`${q}'s pass for ${t || 'the receiver'} falls incomplete.`, `Incomplete, intended for ${t || 'the receiver'}.`, `${q} throws... and it hits the turf.`]);
        }
      }
    } else {
      // Run / scramble
      const ru = byId(r.stats.rusher) || (s.qb && s.qb.qbRunner ? s.qb : s.carrier);
      const R = this.last(ru);
      const side = (r.endY - s.ballY0) * dir;
      const where = Math.abs(side) > 6 ? (side > 0 ? 'right' : 'left') : 'middle';
      const scramble = pt === 'scramble';
      const pitch = r.events.find((e) => e.type === 'pitch');
      const keeper = !scramble && ru && s.qb && ru.id === s.qb.id && !r.events.some((e) => e.type === 'handoff');
      const flair = moves.length && an >= 8 ? (moves[0].type === 'brokentackle'
        ? this.pick('btk', [`${R} breaks one tackle... `, `${R} shakes off a hit... `])
        : this.pick('evd', [`${R} makes a man miss... `, `Nice move by ${R}... `])) : '';
      if (r.td === off) {
        big = true;
        pbp = an >= 20
          ? this.pick('rtdlong', [`${flair}${R} breaks into the clear... nobody's catching him! Touchdown, ${T}!`, `${R} finds a crease, and he's gone! ${an} yards for the touchdown!`])
          : this.pick('rtd', [`${R} punches it in! Touchdown, ${T}!`, `${R} dives across the goal line! Touchdown!`, `${R} walks in untouched. Touchdown, ${T}!`]);
        color = this.scoreLine(g, off);
      } else if (an >= 20 && n > 0) {
        big = true;
        pbp = flair + this.pick('rbig', [`${R} breaks into the open! He's finally caught at ${endSpot}. A gain of ${an}!`, `${R} bursts through the line and rumbles for ${an}!`, `Huge run by ${R}, ${an} yards on the play!`]);
      } else if (scramble && n > 0) {
        pbp = this.pick('scr', [`${R} tucks it and runs, picks up ${yds(an)}.`, `${R} escapes the pocket and takes off for ${yds(an)}.`]);
      } else if (pitch && n > 0) {
        pbp = this.pick('pitch', [`${this.last(s.qb)} pitches it out to ${R}, and he picks up ${yds(an)}.`, `Pitch to ${R} on the option, ${yds(an)}.`]);
      } else if (keeper && n >= 3) {
        pbp = this.pick('keep', [`${R} keeps it himself and picks up ${an}.`, `Keeper! ${R} pulls it and gets ${an}.`]);
      } else if (n >= 8) {
        pbp = flair + this.pick('rgood', [where === 'middle' ? `${R} hits the hole up the middle for ${an}.` : `${R} gets around the ${where} side for ${an}.`, `Nice run by ${R}, ${an} yards.`, `${R} cuts it back and picks up ${an}.`]);
      } else if (n >= 3) {
        pbp = this.pick('rmid', [where === 'middle' ? `${R} up the middle for ${an}.` : `${R} off the ${where} side for ${an}.`, `${R} drives forward for ${an}.`, `${R} picks up ${an}.`]);
      } else if (n > 0) {
        pbp = this.pick('rshort', [`${R} fights for ${yds(an)}.`, `Just ${yds(an)} for ${R}.`, `${R} gets stacked up after ${yds(an)}.`]);
      } else if (n === 0) {
        pbp = this.pick('rzero', [`${R} is stopped at the line. No gain.`, `Nowhere to go for ${R}. No gain on the play.`]);
      } else {
        pbp = this.pick('rloss', [`${R} is dropped in the backfield for a loss of ${an}.`, `Trouble! ${R} is swallowed up behind the line, a loss of ${an}.`]);
      }
      if (r.oob && !first && r.td === null && an >= 3) pbp += ' Pushed out of bounds.';
      if (r.stats.fumbleBy) pbp += ' He puts it on the ground, but they fall on it.';
      if (!color && ru && r.td === null) {
        const st = g.box.players.get(ru.id);
        if (st && st.ratt >= 6 && st.ryds > 0 && this.chance(0.35)) color = `${this.full(ru)} has ${st.ryds} yards on ${st.ratt} carries.`;
      }
    }

    // Situation: conversions, stops, fourth downs, turnovers
    if (r.td === null) {
      if (downs) { big = true; pbp += this.pick('downs', [' And they come up short! Turnover on downs.', ' Stopped! The defense holds on fourth down.']); color = color || `What a stand by the ${D}.`; }
      else if (first && pre && pre.down === 4) { big = true; pbp += ' And they get it! First down.'; color = color || this.pick('4th', ['Gutsy call, and it pays off.', 'They rolled the dice and it worked.']); }
      else if (first && pre && pre.down === 3) { pbp += this.pick('3rdconv', [' That moves the chains on third down.', ' And that\'s a first down.', ' Third down converted.']); }
      else if (first && this.chance(0.35)) pbp += ' First down.';
      else if (pre && pre.down === 3 && !first && !r.turnover && pt !== 'kneel' && this.chance(0.5)) color = color || this.pick('3rdstop', ['Good stop by the defense on third down.', `The ${D} get off the field on third down.`, 'They come up short, and that will bring up fourth down.']);
      if (r.turnover && !r.stats.intBy && !r.stats.fumbleBy && !downs) big = true;
      if (r.safety !== null && r.safety !== undefined) { big = true; pbp += ' Brought down in the end zone. That\'s a safety!'; }
    }
    if (r.td === off && g.lastDrive && g.lastDrive.team === off && g.lastDrive.result === 'Touchdown' && g.lastDrive.plays >= 5 && this.chance(0.5)) {
      const dr = g.lastDrive;
      color = `${color ? color + ' ' : ''}That caps a ${dr.plays}-play, ${dr.yards}-yard drive.`;
    }
    // Color only every so often (score lines after scores always play)
    if (color && r.td === null && this.sinceColor < 2 && !big) color = null;
    return { pbp: pbp.trim(), color, big };
  }

  kickoff(g, s, r, text) {
    const kt = s.kickTeam, rt = s.recvTeam;
    const byId = (id) => (id === null || id === undefined ? null : s.ents.find((e) => e.id === id));
    const ret = byId(s.stats && s.stats.returner);
    const R = this.last(ret);
    if (r.reason === 'onside') {
      return r.possession === kt
        ? { pbp: `Onside kick... and the ${this.nick(g, kt)} recover! What a gamble!`, color: null, big: true }
        : { pbp: `Onside attempt, but the ${this.nick(g, rt)} come up with it.`, color: null, big: true };
    }
    if (r.td === rt) return { pbp: this.pick('krtd', [`${R} takes the kick... he finds a seam... he is gone! Kickoff return touchdown!`, `${R} brings it out, and nobody can touch him! All the way for the score!`]), color: this.scoreLine(g, rt), big: true };
    if (r.td === kt) return { pbp: `The ball is out on the return, and the ${this.nick(g, kt)} take it in for a touchdown!`, color: this.scoreLine(g, kt), big: true };
    if (/Touchback/.test(text)) {
      const at = /Ball at the (\d+)/.exec(text);
      return this.mode === 'all' && this.chance(0.5) ? { pbp: this.pick('ktb', ['Into the end zone. Touchback.', `Touchback, and the ${this.nick(g, rt)} will start at the ${at ? at[1] : '35'}.`]), color: null, big: false } : null;
    }
    if (/short of the landing zone/.test(text)) return { pbp: 'The kick comes down short of the landing zone. They\'ll start at the 40.', color: null, big: false };
    if (/out of bounds/.test(text)) return { pbp: 'Kickoff out of bounds. Ball at the 40.', color: null, big: false };
    if (r.possession === kt) return { pbp: `The returner coughs it up! The ${this.nick(g, kt)} recover!`, color: null, big: true };
    if (ret) {
      const yl = g.yardLineOf(rt, r.endX), from = g.yardLineOf(rt, s.catchX ?? r.endX);
      const ry = Math.max(0, Math.round(yl - from));
      const to = this.spot(g, rt, r.endX);
      if (ry >= 35) return { pbp: this.pick('kbig', [`${R} breaks a big return! He's brought down at ${to}.`, `Great return by ${R}, all the way out to ${to}!`]), color: null, big: true };
      return { pbp: this.pick('kret', [`${R} brings it out to ${to}.`, `${R} returns the kick to ${to}.`]), color: null, big: false };
    }
    return null;
  }

  punt(g, s, r, text) {
    const kt = s.kickTeam ?? s.offIdx, rt = 1 - kt;
    const byId = (id) => (id === null || id === undefined ? null : s.ents.find((e) => e.id === id));
    const ret = byId(s.stats && s.stats.returner);
    const R = this.last(ret);
    const m = /punts (\d+) yards/.exec(text);
    const len = m ? +m[1] : null;
    const at = this.spot(g, rt, r.endX);
    if (/BLOCKED/.test(text)) return { pbp: 'The punt is blocked!', color: null, big: true };
    if (r.td === rt) return { pbp: `${R} fields it... makes the first man miss... he's gone! Punt return touchdown!`, color: this.scoreLine(g, rt), big: true };
    if (r.td === kt) return { pbp: `Muffed in the end zone, and the ${this.nick(g, kt)} fall on it for a touchdown!`, color: this.scoreLine(g, kt), big: true };
    if (/Muffed/.test(text)) return { pbp: `He muffs it! The ${this.nick(g, kt)} recover!`, color: null, big: true };
    if (/SAFETY/.test(text)) return { pbp: 'Brought down in the end zone. That\'s a safety!', color: null, big: true };
    const boom = len && len >= 50 ? this.pick('boom', [`What a boot, ${len} yards.`, `He got all of that one, ${len} yards.`]) : len ? `A ${len}-yard punt.` : 'The punt is away.';
    if (/Touchback/.test(text)) return { pbp: `${boom} Into the end zone for a touchback.`, color: null, big: false };
    if (/Fair catch/.test(text)) return { pbp: `${boom} Fair catch at ${at}.`, color: null, big: false };
    if (/downed/.test(text)) return { pbp: `${boom} Downed at ${at}.`, color: null, big: false };
    if (/out of bounds/.test(text)) return { pbp: `${boom} It rolls out of bounds at ${at}.`, color: null, big: false };
    if (ret && r.possession === rt) return { pbp: `${boom} ${R} returns it to ${at}.`, color: null, big: false };
    return { pbp: `${boom} It comes to rest at ${at}.`, color: null, big: false };
  }

  kick(g, s, r, text) {
    const kt = s.kickTeam ?? s.offIdx;
    const m = /(\d+)-yard field goal/.exec(text);
    const dist = m ? +m[1] : null;
    if (s.kind === 'xp') {
      if (r.fg) return this.mode === 'all' && this.chance(0.35) ? { pbp: 'The extra point is good.', color: null, big: false } : null;
      return { pbp: this.pick('xpno', ['The extra point is no good!', 'And he misses the extra point!']), color: null, big: true };
    }
    if (/BLOCKED/.test(text)) return { pbp: 'The kick is blocked!', color: null, big: true };
    const dy = dist ? `${dist}-yard ` : '';
    if (r.fg) return { pbp: this.pick('fg', [`The ${dy}attempt is up... and it's good!`, dist ? `From ${dist} yards... right down the middle. It's good!` : 'Right down the middle. It\'s good!', dist ? `${dist} yards, and he drills it.` : 'And he drills it.']), color: this.scoreLine(g, kt), big: true };
    const short = r.events.some((e) => e.type === 'fg_miss' && e.short);
    return { pbp: short ? `The ${dy}try doesn't have the distance. No good.` : this.pick('fgno', [`The ${dy}attempt is... no good!`, `He pushes it wide. The ${dy}kick is no good.`]), color: null, big: true };
  }

  // Lines for game events (welcome, two-minute warning, halftime, overtime, final).
  event(g, type, data = {}) {
    if (this.mode === 'off') return null;
    const H = g.teams[0].def, A = g.teams[1].def;
    switch (type) {
      case 'welcome': {
        const wx = g.weather && g.weather.kind;
        const sky = wx === 'snow' ? 'Snow is coming down' : wx === 'rain' ? 'It\'s a wet one' : wx === 'wind' ? 'The wind is swirling' : g.settings.time === 'night' ? 'The lights are on' : 'A beautiful day for football';
        return `${sky} here in ${H.city}. The ${A.name} take on the ${H.name}.`;
      }
      case 'twominute': return this.pick('2min', ['That brings us to the two-minute warning.', 'Two-minute warning.']);
      case 'halftime': return `That will do it for the first half. ${g.score[0] === g.score[1] ? `Tied at ${g.score[0]}.` : `${g.score[0] > g.score[1] ? H.name : A.name} lead it, ${Math.max(...g.score)} to ${Math.min(...g.score)}.`}`;
      case 'overtime': return 'We are headed to overtime!';
      case 'penalty': return this.mode === 'all' || /pass interference|roughing/i.test(data.text || '') ? `Flag on the play. ${data.text || ''}`.trim() : null;
      case 'final': {
        if (g.score[0] === g.score[1]) return `And that's the ball game. It ends in a tie, ${g.score[0]} apiece.`;
        const w = g.score[0] > g.score[1] ? H : A;
        return `That's the ball game! The ${w.name} win it, ${Math.max(...g.score)} to ${Math.min(...g.score)}.`;
      }
      case 'drill': return `Two-minute drill. The ${H.name} trail by four.`;
      default: return null;
    }
  }
}
