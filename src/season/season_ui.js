// Season / franchise screens.
import { TEAMS, CONFERENCES, DIVISIONS, teamFullName } from '../data/teams.js';
import { OFF_STYLE_NAMES } from '../data/playbook_offense.js';
import { DEF_STYLE_NAMES } from '../data/playbook_defense.js';
import { DIFFICULTIES, RATING_LABELS } from '../core/constants.js';
import { RNG } from '../core/rng.js';
import { badgeHTML } from '../ui/ui.js';
import * as L from './league.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const rec = (r) => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;

export class SeasonUI {
  constructor(app) {
    this.app = app;
    this.s = null;
    this.tab = 'home';
    this.rng = new RNG((Math.random() * 1e9) >>> 0);
  }

  open() { this.app.openSeason = () => this.open(); this.entry(); }

  entry() {
    const ui = this.app.ui;
    const saved = L.loadSeason();
    const el = h('div', 'screen');
    el.innerHTML = `<div class="title" style="font-size:64px">Season</div><div class="subtitle">17 games · 14-team playoff · multi-year franchise</div>`;
    const menu = h('div', 'menu');
    const items = [];
    if (saved) {
      const t = TEAMS[saved.userTeam];
      items.push([`Continue — ${t.city} ${t.name}`, `${saved.year} · ${saved.phase === 'regular' ? `Week ${saved.week + 1}` : saved.phase === 'playoffs' ? 'Playoffs' : saved.phase === 'champion' ? 'Season complete' : 'Offseason'}`, () => { this.s = saved; this.app.seasonLeague = L.teamStates(this.s); this.hub(); }]);
    }
    items.push(['New Season', 'Pick a franchise and start a new season', () => this.pickTeam()]);
    if (saved) items.push(['Delete Saved Season', 'Press twice to confirm', (b) => { if (b.dataset.armed) { L.deleteSeason(); this.entry(); } else { b.dataset.armed = '1'; b.innerHTML = 'Really delete?<small>Press again to permanently delete this season</small>'; } }]);
    items.push(['Back', '', () => { this.app.seasonLeague = null; ui.showMainMenu(); }]);
    const btns = items.map(([t, s, fn]) => { const b = h('button', 'mbtn', `${t}${s ? `<small>${s}</small>` : ''}`); b.onclick = () => fn(b); menu.appendChild(b); return b; });
    el.appendChild(menu);
    ui.setScreen(el, ui.listNav(btns, () => ui.showMainMenu()));
  }

  pickTeam() {
    const ui = this.app.ui;
    const lg = this.app.league();
    const el = h('div', 'screen');
    const p = h('div', 'panel season');
    const st = { team: 0, difficulty: this.app.settings.difficulty, quarterLen: this.app.settings.quarterLen };
    const top = h('div', 'season-top', '<b style="letter-spacing:.2em">CHOOSE YOUR FRANCHISE</b>');
    const body = h('div', 'season-body');
    p.appendChild(top); p.appendChild(body);
    el.appendChild(p);
    const paint = () => {
      body.innerHTML = '';
      const grid = h('div', 'cards');
      TEAMS.forEach((t, i) => {
        const r = lg[i].ratings;
        const c = h('div', 'card', `<div class="row">${badgeHTML(t, 'small')}<div><b>${t.city} ${t.name}</b><br><small style="color:var(--dim)">${CONFERENCES[t.conf]} ${DIVISIONS[t.div]} · ${OFF_STYLE_NAMES[t.offStyle]}</small></div><div style="margin-left:auto;text-align:right"><b style="font-size:20px">${r.ovr}</b><br><small style="color:var(--dim)">${r.off}/${r.def}</small></div></div>`);
        c.style.cursor = 'pointer';
        if (i === st.team) c.style.borderColor = 'var(--accent)';
        c.onclick = () => { st.team = i; paint(); };
        grid.appendChild(c);
      });
      const opts = h('div', 'row', '');
      opts.style.margin = '0 0 14px';
      opts.innerHTML = `<button class="btn" id="sd">Difficulty: ${DIFFICULTIES[st.difficulty]}</button><button class="btn" id="sq">Quarter: ${st.quarterLen} min</button><span style="flex:1"></span><button class="btn" id="sb">Back</button><button class="btn primary" id="sg">Start Season with ${TEAMS[st.team].name}</button>`;
      body.appendChild(opts);
      body.appendChild(grid);
      opts.querySelector('#sd').onclick = () => { st.difficulty = (st.difficulty + 1) % 4; paint(); };
      opts.querySelector('#sq').onclick = () => { const q = [2, 3, 4, 5, 6, 8, 10, 12, 15]; st.quarterLen = q[(q.indexOf(st.quarterLen) + 1) % q.length] || 5; paint(); };
      opts.querySelector('#sb').onclick = () => this.entry();
      opts.querySelector('#sg').onclick = () => {
        this.s = L.newSeason(st.team, { difficulty: st.difficulty, quarterLen: st.quarterLen });
        this.app.seasonLeague = L.teamStates(this.s);
        L.saveSeason(this.s);
        this.tab = 'home';
        this.hub();
      };
    };
    paint();
    ui.setScreen(el, (nav) => {
      if (nav === 'left') st.team = (st.team + 31) % 32;
      else if (nav === 'right') st.team = (st.team + 1) % 32;
      else if (nav === 'up') st.team = (st.team + 28) % 32;
      else if (nav === 'down') st.team = (st.team + 4) % 32;
      else if (nav === 'confirm') { body.querySelector('#sg').click(); return; }
      else if (nav === 'back') { this.entry(); return; }
      paint();
    });
  }

  // ------------------------------------------------------------------ hub
  hub(message) {
    const ui = this.app.ui;
    const s = this.s;
    this.app.seasonLeague = L.teamStates(s);
    const el = h('div', 'screen');
    const p = h('div', 'panel season');
    const t = TEAMS[s.userTeam];
    const recs = L.standings(s);
    const me = recs[s.userTeam];
    const tabs = [['home', 'Home'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['leaders', 'Leaders'], ['roster', 'Roster'], ...(s.playoffs ? [['playoffs', 'Playoffs']] : []), ['history', 'History']];
    const top = h('div', 'season-top', `${badgeHTML(t, 'small')}<div><b>${t.city} ${t.name}</b><br><small style="color:var(--dim)">${s.year} season · ${rec(me)} · ${s.phase === 'regular' ? `Week ${Math.min(s.week + 1, 17)} of 17` : s.phase === 'playoffs' ? s.playoffs.names[s.playoffs.round] : s.phase === 'champion' ? 'Season complete' : ''}</small></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}<button data-t="exit">Save & Exit</button></div>`);
    const body = h('div', 'season-body');
    p.appendChild(top); p.appendChild(body);
    el.appendChild(p);
    top.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      if (b.dataset.t === 'exit') { L.saveSeason(s); this.app.seasonLeague = null; ui.showMainMenu(); return; }
      this.tab = b.dataset.t; this.hub();
    }));
    const renders = { home: () => this.home(body, message), schedule: () => this.schedule(body), standings: () => this.standingsTab(body), leaders: () => this.leadersTab(body), roster: () => this.roster(body), playoffs: () => this.playoffsTab(body), history: () => this.historyTab(body) };
    (renders[this.tab] || renders.home)();
    const tabKeys = tabs.map((x) => x[0]);
    ui.setScreen(el, (nav) => {
      const i = tabKeys.indexOf(this.tab);
      if (nav === 'left') { this.tab = tabKeys[(i + tabKeys.length - 1) % tabKeys.length]; this.hub(); }
      else if (nav === 'right') { this.tab = tabKeys[(i + 1) % tabKeys.length]; this.hub(); }
      else if (nav === 'confirm') { const b = body.querySelector('.btn.primary'); if (b) b.click(); }
      else if (nav === 'back') { L.saveSeason(s); this.app.seasonLeague = null; ui.showMainMenu(); }
    });
  }

  home(body, message) {
    const s = this.s;
    const recs = L.standings(s);
    const g = L.userGameThisWeek(s);
    let html = '';
    if (message) html += `<div class="card" style="margin-bottom:12px;border-color:var(--accent)">${message}</div>`;
    html += '<div class="cards">';
    if (s.phase === 'champion') {
      const c = TEAMS[s.champion];
      html += `<div class="card"><h4>Champions</h4><div class="row">${badgeHTML(c)}<div><b style="font-size:22px">${c.city} ${c.name}</b><br>${s.year} Gridiron Champions</div></div><div class="row" style="margin-top:12px"><button class="btn primary" id="adv">Advance to ${s.year + 1} Offseason</button></div></div>`;
    } else if (g) {
      const home = g.h === s.userTeam;
      const opp = TEAMS[home ? g.a : g.h];
      const ro = recs[home ? g.a : g.h];
      const oppR = this.app.seasonLeague[home ? g.a : g.h].ratings;
      html += `<div class="card"><h4>${s.phase === 'playoffs' ? s.playoffs.names[s.playoffs.round] : `Week ${s.week + 1}`}</h4>
        <div class="row">${badgeHTML(opp)}<div><b style="font-size:20px">${home ? 'vs' : '@'} ${opp.city} ${opp.name}</b><br><small style="color:var(--dim)">${rec(ro)} · OVR ${oppR.ovr} (OFF ${oppR.off} / DEF ${oppR.def})</small></div></div>
        <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="play">Play Game</button><button class="btn" id="sim">Sim Game</button>${s.phase === 'regular' ? '<button class="btn" id="simall">Sim to Playoffs</button>' : ''}</div></div>`;
    } else if (s.phase === 'playoffs') {
      html += `<div class="card"><h4>${s.playoffs.names[s.playoffs.round]}</h4><div>Your season is over. Watch the rest of the playoffs unfold.</div><div class="row" style="margin-top:12px"><button class="btn primary" id="simround">Sim ${s.playoffs.names[s.playoffs.round]}</button><button class="btn" id="simall">Sim to Champion</button></div></div>`;
    }
    // Division snapshot
    const div = L.divisionStandings(s).find((d) => d.teams.some((r) => r.i === s.userTeam));
    html += `<div class="card"><h4>${div.name}</h4><table>${div.teams.map((r) => `<tr class="${r.i === s.userTeam ? 'me' : ''}"><td class="l">${TEAMS[r.i].abbr} ${TEAMS[r.i].name}</td><td>${rec(r)}</td><td>${r.pf}-${r.pa}</td></tr>`).join('')}</table></div>`;
    // Recent results
    const mine = [];
    s.schedule.forEach((wk, wi) => wk.forEach((x) => { if (x.played && (x.h === s.userTeam || x.a === s.userTeam)) mine.push({ x, wi }); }));
    html += `<div class="card"><h4>Recent Results</h4>${mine.slice(-6).reverse().map(({ x, wi }) => { const home = x.h === s.userTeam; const us = home ? x.hs : x.as, them = home ? x.as : x.hs; const res = us > them ? 'W' : us < them ? 'L' : 'T'; return `<div class="game-row me"><span style="color:var(--dim)">W${wi + 1}</span>${home ? 'vs' : '@'} ${TEAMS[home ? x.a : x.h].abbr}<span class="res" style="color:${res === 'W' ? 'var(--good)' : res === 'L' ? 'var(--bad)' : 'var(--dim)'}">${res} ${us}-${them}</span></div>`; }).join('') || '<div style="color:var(--dim)">No games played yet.</div>'}</div>`;
    html += '</div>';
    body.innerHTML = html;
    const q = (id) => body.querySelector('#' + id);
    if (q('play')) q('play').onclick = () => this.playUserGame();
    if (q('sim')) q('sim').onclick = () => { this.simUserGame(); };
    if (q('simall')) q('simall').onclick = () => this.simMany();
    if (q('simround')) q('simround').onclick = () => { L.simWeek(s, this.rng); L.saveSeason(s); this.hub(); };
    if (q('adv')) q('adv').onclick = () => this.offseason();
  }

  simUserGame() {
    const s = this.s;
    const g = L.userGameThisWeek(s);
    const before = g ? { h: g.h, a: g.a } : null;
    L.simWeek(s, this.rng);
    L.saveSeason(s);
    let msg = '';
    if (before) {
      const played = this.findPlayed(before);
      if (played) { const home = played.h === s.userTeam; const us = home ? played.hs : played.as, them = home ? played.as : played.hs; msg = `${us > them ? 'Win' : us < them ? 'Loss' : 'Tie'}: ${TEAMS[s.userTeam].abbr} ${us} – ${TEAMS[home ? played.a : played.h].abbr} ${them}`; }
    }
    this.hub(msg);
  }

  findPlayed(m) {
    const s = this.s;
    for (const wk of s.schedule) for (const g of wk) if (g.h === m.h && g.a === m.a && g.played) return g;
    if (s.playoffs) for (const r of s.playoffs.rounds) for (const g of r) if (g.h === m.h && g.a === m.a && g.played) return g;
    return null;
  }

  simMany() {
    const s = this.s;
    let guard = 0;
    if (s.phase === 'regular') { while (s.phase === 'regular' && guard++ < 30) L.simWeek(s, this.rng); }
    else { while (s.phase === 'playoffs' && guard++ < 10) L.simWeek(s, this.rng); }
    L.saveSeason(s);
    this.hub(s.phase === 'playoffs' ? 'Regular season complete — the playoff field is set.' : s.phase === 'champion' ? `${TEAMS[s.champion].city} ${TEAMS[s.champion].name} win the championship!` : '');
  }

  playUserGame() {
    const s = this.s;
    const g = L.userGameThisWeek(s);
    if (!g) return;
    const T = L.teamStates(s);
    const userHome = g.h === s.userTeam;
    const humans = userHome ? [this.app.input.keyboard, null] : [null, this.app.input.keyboard];
    if (this.app.input.pads.length) { if (userHome) humans[0] = this.app.input.pads[0]; else humans[1] = this.app.input.pads[0]; }
    this.current = { h: g.h, a: g.a };
    this.app.startGame({ teams: [T[g.h], T[g.a]], home: g.h, away: g.a, humans, settings: { difficulty: s.difficulty, quarterLen: s.quarterLen, accel: true, weather: 'random', time: this.rng.chance(0.35) ? 'night' : 'day', playoff: s.phase === 'playoffs' }, season: { h: g.h, a: g.a } });
  }

  onUserGameFinal(game) {
    const s = this.s;
    const m = this.current;
    let g = null;
    if (s.phase === 'regular') g = s.schedule[s.week].find((x) => x.h === m.h && x.a === m.a);
    else if (s.phase === 'playoffs') g = s.playoffs.rounds[s.playoffs.round].find((x) => x.h === m.h && x.a === m.a);
    if (g && !g.played) {
      g.hs = game.score[0]; g.as = game.score[1]; g.played = true; g.ot = !!game.ot;
      if (s.phase === 'playoffs' && g.hs === g.as) g.hs += 1; // safety: playoffs can't tie
      L.addBoxStats(s, game.box);
    }
    // Finish the rest of the week
    L.simWeek(s, this.rng);
    L.saveSeason(s);
    const us = m.h === s.userTeam ? game.score[0] : game.score[1];
    const them = m.h === s.userTeam ? game.score[1] : game.score[0];
    const ui = this.app.ui;
    ui.hideInGame();
    ui.showBoxScore(game, { title: us > them ? 'Victory' : us < them ? 'Defeat' : 'Tie', buttons: [['Continue Season', () => { this.app.game = null; this.app.humans = [null, null]; this.app.startAttract(); this.hub(`${us > them ? 'Win' : us < them ? 'Loss' : 'Tie'}: ${us}-${them}`); }, 'primary']] });
  }

  offseason() {
    const s = this.s;
    const report = L.runOffseason(s, this.rng);
    L.saveSeason(s);
    this.tab = 'home';
    const drafted = report.drafted.map((d) => `R${d.round}: ${d.pos} ${d.name} (${d.ovr})`).join('<br>');
    const prog = report.progressed.filter((x) => x.team === TEAMS[s.userTeam].abbr).map((x) => `${x.pos} ${x.name}: ${x.from} → ${x.to}`).join('<br>');
    this.hub(`<b>Welcome to ${s.year}!</b> ${report.retired} players retired league-wide.<br><b>Your draft class:</b><br>${drafted || '—'}${prog ? `<br><b>Breakout players:</b><br>${prog}` : ''}`);
  }

  // ------------------------------------------------------------------ tabs
  schedule(body) {
    const s = this.s;
    let html = '<table><tr><th class="l">Week</th><th class="l">Matchup</th><th>Result</th></tr>';
    s.schedule.forEach((wk, wi) => {
      const g = wk.find((x) => x.h === s.userTeam || x.a === s.userTeam);
      const home = g.h === s.userTeam;
      const opp = TEAMS[home ? g.a : g.h];
      let res = '';
      if (g.played) { const us = home ? g.hs : g.as, them = home ? g.as : g.hs; res = `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}${g.ot ? ' (OT)' : ''}`; }
      html += `<tr class="${wi === s.week && s.phase === 'regular' ? 'me' : ''}"><td class="l">${wi + 1}</td><td class="l">${home ? 'vs' : '@'} ${opp.city} ${opp.name}</td><td>${res}</td></tr>`;
    });
    html += '</table>';
    // League scoreboard for last completed week
    const lw = s.phase === 'regular' ? s.week - 1 : 16;
    if (lw >= 0) html += `<h3 style="font-size:12px;letter-spacing:.2em;color:var(--dim);margin:16px 0 6px">WEEK ${lw + 1} SCORES</h3><div class="cards">${s.schedule[lw].map((g) => `<div class="game-row ${g.h === s.userTeam || g.a === s.userTeam ? 'me' : ''}">${TEAMS[g.a].abbr} @ ${TEAMS[g.h].abbr}<span class="res">${g.played ? `${g.as}-${g.hs}` : '—'}</span></div>`).join('')}</div>`;
    body.innerHTML = html;
  }

  standingsTab(body) {
    const s = this.s;
    const divs = L.divisionStandings(s);
    let html = '<div class="cards">';
    for (const d of divs) {
      html += `<div class="card"><h4>${d.name}</h4><table><tr><th class="l">Team</th><th>W-L</th><th>PF</th><th>PA</th><th>Strk</th></tr>${d.teams.map((r) => `<tr class="${r.i === s.userTeam ? 'me' : ''}"><td class="l">${TEAMS[r.i].abbr}</td><td>${rec(r)}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.streak}</td></tr>`).join('')}</table></div>`;
    }
    html += '</div>';
    const seeds = L.playoffSeeds(s);
    html += `<h3 style="font-size:12px;letter-spacing:.2em;color:var(--dim);margin:16px 0 6px">PLAYOFF PICTURE</h3><div class="cards">${seeds.map((list, c) => `<div class="card"><h4>${CONFERENCES[c]}</h4>${list.map((ti, k) => `<div class="game-row ${ti === s.userTeam ? 'me' : ''}"><b>${k + 1}</b> ${TEAMS[ti].city} ${TEAMS[ti].name}<span class="res">${rec(L.standings(s)[ti])}</span></div>`).join('')}</div>`).join('')}</div>`;
    body.innerHTML = html;
  }

  leadersTab(body) {
    const s = this.s;
    const ld = L.leaders(s);
    const T = this.app.seasonLeague;
    const tbl = (title, list, key, label) => `<div class="card"><h4>${title}</h4><table>${list.map((x) => `<tr class="${x.m.ti === s.userTeam ? 'me' : ''}"><td class="l">${x.m.p.first[0]}. ${x.m.p.last} <small style="color:var(--dim)">${TEAMS[x.m.ti].abbr} ${x.m.p.pos}</small></td><td>${x.s[key]} ${label}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>`;
    body.innerHTML = `<div class="cards">${tbl('Passing yards', ld.pass, 'pyds', 'yds')}${tbl('Passing TD', ld.ptd, 'ptd', 'TD')}${tbl('Rushing yards', ld.rush, 'ryds', 'yds')}${tbl('Receiving yards', ld.rec, 'recyds', 'yds')}${tbl('Sacks', ld.sacks, 'sacks', '')}${tbl('Interceptions', ld.ints, 'defint', '')}${tbl('Tackles', ld.tkl, 'tkl', '')}</div>`;
    void T;
  }

  roster(body) {
    const s = this.s;
    const ts = L.teamStates(s)[s.userTeam];
    const order = ['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS', 'K', 'P'];
    const key = { QB: ['thp', 'sac', 'dac'], HB: ['spd', 'btk', 'elu'], FB: ['rbk', 'str', 'car'], WR: ['spd', 'cth', 'rte'], TE: ['cth', 'rbk', 'spd'], OT: ['pbk', 'rbk', 'str'], OG: ['rbk', 'pbk', 'str'], C: ['rbk', 'pbk', 'awr'], DE: ['fmv', 'pmv', 'bsh'], DT: ['bsh', 'pmv', 'str'], OLB: ['tak', 'pur', 'zcv'], MLB: ['tak', 'prc', 'pur'], CB: ['mcv', 'zcv', 'spd'], FS: ['zcv', 'spd', 'prc'], SS: ['zcv', 'tak', 'pow'], K: ['kpw', 'kac', 'awr'], P: ['kpw', 'kac', 'awr'] };
    let html = `<div style="font-size:12px;color:var(--dim);margin-bottom:8px">Depth chart is ordered by overall rating and updates automatically. Ratings: ${ts.ratings.ovr} OVR · ${ts.ratings.off} OFF · ${ts.ratings.def} DEF</div><div class="cards">`;
    for (const pos of order) {
      const ids = ts.depth[pos] || [];
      const k = key[pos];
      html += `<div class="card"><h4>${pos}</h4><table><tr><th class="l">Player</th><th>OVR</th><th>Age</th>${k.map((x) => `<th title="${RATING_LABELS[x]}">${x.toUpperCase()}</th>`).join('')}</tr>${ids.map((id, i) => { const p = ts.byId.get(id); if (!p) return ''; return `<tr class="${i === 0 ? 'me' : ''}"><td class="l">#${p.num} ${p.first[0]}. ${p.last}${p.dev !== 'Normal' ? ` <small style="color:var(--accent2)">${p.dev === 'Superstar' ? '★★' : '★'}</small>` : ''}${p.rookie ? ' <small style="color:var(--good)">R</small>' : ''}</td><td><b>${p.ovr}</b></td><td>${p.age}</td>${k.map((x) => `<td>${p.r[x]}</td>`).join('')}</tr>`; }).join('')}</table></div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  }

  playoffsTab(body) {
    const s = this.s;
    const po = s.playoffs;
    let html = '<div class="bracket">';
    po.names.forEach((name, ri) => {
      const round = po.rounds[ri] || [];
      html += `<div><h4 style="font-size:12px;letter-spacing:.15em;color:var(--accent)">${name}</h4>${round.map((g) => `<div class="card" style="margin-bottom:8px">${[[g.a, g.seedA, g.as], [g.h, g.seedH, g.hs]].map(([t, sd, sc]) => `<div class="game-row ${t === s.userTeam ? 'me' : ''}"><small style="color:var(--dim)">${sd}</small> ${TEAMS[t].abbr} ${TEAMS[t].name}<span class="res">${g.played ? sc : ''}</span></div>`).join('')}</div>`).join('') || '<div style="color:var(--dim)">TBD</div>'}</div>`;
    });
    html += '</div>';
    if (s.champion !== null) html += `<div class="card" style="margin-top:12px;text-align:center"><h4>Champion</h4>${badgeHTML(TEAMS[s.champion])}<b>${TEAMS[s.champion].city} ${TEAMS[s.champion].name}</b></div>`;
    body.innerHTML = html;
  }

  historyTab(body) {
    const s = this.s;
    body.innerHTML = s.history.length ? `<table><tr><th class="l">Season</th><th class="l">Champion</th><th class="l">Runner-up</th></tr>${s.history.map((x) => `<tr><td class="l">${x.year}</td><td class="l">${TEAMS[x.champion].city} ${TEAMS[x.champion].name}</td><td class="l">${TEAMS[x.runnerUp].city} ${TEAMS[x.runnerUp].name}</td></tr>`).join('')}</table>` : '<div style="color:var(--dim)">No completed seasons yet. Win it all and your title will be recorded here.</div>';
  }
}

export { teamFullName, DEF_STYLE_NAMES };
