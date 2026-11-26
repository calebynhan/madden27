// Box score / player stat tracking and play-by-play text.

export function newTeamStats() {
  return { plays: 0, yards: 0, passYds: 0, rushYds: 0, firstDowns: 0, third: 0, thirdConv: 0, fourth: 0, fourthConv: 0, turnovers: 0, penalties: 0, penYds: 0, top: 0, sacks: 0, sackYds: 0, passAtt: 0, passCmp: 0, rushAtt: 0, ints: 0, fumLost: 0, punts: 0, puntYds: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0, twoAtt: 0, twoConv: 0, redZone: 0, redZoneTD: 0, krYds: 0, kr: 0, prYds: 0, pr: 0, touchbacks: 0 };
}

export function newPlayerStats() {
  return { att: 0, cmp: 0, pyds: 0, ptd: 0, int: 0, sk: 0, ratt: 0, ryds: 0, rtd: 0, rlong: 0, tgt: 0, rec: 0, recyds: 0, rectd: 0, reclong: 0, tkl: 0, sacks: 0, defint: 0, pd: 0, ff: 0, fr: 0, deftd: 0, fgm: 0, fga: 0, fglong: 0, xpm: 0, xpa: 0, punts: 0, puntyds: 0, kr: 0, kryds: 0, pr: 0, pryds: 0, rettd: 0, fum: 0 };
}

export class BoxScore {
  constructor() {
    this.team = [newTeamStats(), newTeamStats()];
    this.players = new Map(); // id -> stats
    this.meta = new Map(); // id -> {team, name, pos, num}
    this.quarters = [[0, 0, 0, 0], [0, 0, 0, 0]];
  }
  p(id, ent) {
    if (!this.players.has(id)) this.players.set(id, newPlayerStats());
    if (ent && !this.meta.has(id)) this.meta.set(id, { team: ent.team, name: `${ent.p.first[0]}. ${ent.p.last}`, pos: ent.p.pos, num: ent.p.num });
    return this.players.get(id);
  }
  addScore(team, quarter, pts) {
    const qi = Math.min(quarter, 5) - 1;
    while (this.quarters[team].length <= qi) { this.quarters[0].push(0); this.quarters[1].push(0); }
    this.quarters[team][qi] += pts;
  }
  // Player of the game: a simple impact score from the box score, with a bonus for the winner.
  playerOfGame(score) {
    const win = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null;
    let best = null;
    for (const [id, s] of this.players) {
      const m = this.meta.get(id);
      if (!m) continue;
      const v = s.pyds * 0.045 + s.ptd * 4 - s.int * 4.5 + s.ryds * 0.1 + s.rtd * 6 + s.recyds * 0.1 + s.rectd * 6 + s.rec * 0.4
        + s.tkl * 0.9 + s.sacks * 3.5 + s.defint * 5 + s.ff * 3 + s.fr * 2 + s.deftd * 6 + s.pd * 1.2 + (s.rettd || 0) * 6 + (s.kryds || 0) * 0.03 + (s.fgm || 0) * 1.5
        - (s.fum || 0) * 2 + (m.team === win ? 3 : 0);
      if (!best || v > best.v) best = { id, s, m, v };
    }
    if (!best) return null;
    const s = best.s, parts = [];
    if (s.att) parts.push(`${s.cmp}/${s.att}, ${s.pyds} yds, ${s.ptd} TD${s.int ? `, ${s.int} INT` : ''}`);
    if (s.ratt) parts.push(`${s.ratt} car, ${s.ryds} yds${s.rtd ? `, ${s.rtd} TD` : ''}`);
    if (s.rec) parts.push(`${s.rec} rec, ${s.recyds} yds${s.rectd ? `, ${s.rectd} TD` : ''}`);
    if (s.tkl || s.sacks || s.defint) parts.push([s.tkl ? `${s.tkl} tkl` : '', s.sacks ? `${s.sacks} sack${s.sacks > 1 ? 's' : ''}` : '', s.defint ? `${s.defint} INT` : '', s.ff ? `${s.ff} FF` : ''].filter(Boolean).join(', '));
    if (s.fgm) parts.push(`${s.fgm} FG`);
    return { ...best.m, line: parts.filter(Boolean).join(' · ') };
  }

  leaders(team) {
    let pass = null, rush = null, rec = null;
    for (const [id, s] of this.players) {
      const m = this.meta.get(id);
      if (!m || m.team !== team) continue;
      if (s.att && (!pass || s.pyds > pass.s.pyds)) pass = { id, s, m };
      if (s.ratt && (!rush || s.ryds > rush.s.ryds)) rush = { id, s, m };
      if (s.rec && (!rec || s.recyds > rec.s.recyds)) rec = { id, s, m };
    }
    return { pass, rush, rec };
  }
}

export function entName(e) { return e ? `#${e.num} ${e.p.first[0]}. ${e.p.last}` : ''; }

export function yardText(y) {
  const n = Math.round(y);
  if (n === 0) return 'no gain';
  if (n < 0) return `a loss of ${-n}`;
  return `${n} yard${n === 1 ? '' : 's'}`;
}
