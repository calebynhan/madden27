// Offensive playbook. Plays reference formation slot tags.
//
// Pass play: { type:'pass', drop, routes:{tag: route|[route,{opts}]}, reads:[tags], tags:[...] }
// Run play:  { type:'run', run:{ scheme, ball:'RB'|'QB'|'FB', side, gap } }
// drop: 'q' quick (1-step/3-step), 'm' (5-step), 'd' (7-step), 'pa' play action, 'boot' bootleg, 'screen'
// side for runs/boots: +1 = right, -1 = left (mirrored when a play is flipped)

const P = (form, name, routes, opts = {}) => ({ form, name, type: opts.type || 'pass', drop: opts.drop || 'm', routes, reads: opts.reads, tags: opts.tags || [], side: opts.side || 1, screen: opts.screen, rbFake: opts.rbFake });
const R = (form, name, scheme, side, opts = {}) => ({ form, name, type: 'run', run: { scheme, ball: opts.ball || 'RB', side, lead: opts.lead }, routes: opts.routes || {}, tags: opts.tags || [], side, rpo: opts.rpo || null });

const B = 'block';

export const OFF_PLAYS = [
  // ----------------------------- I-FORM PRO -----------------------------
  R('i_pro', 'HB Iso', 'iso', 1, { tags: ['inside', 'short'] }),
  R('i_pro', 'Power O', 'power', 1, { tags: ['inside', 'short'] }),
  R('i_pro', 'HB Toss', 'toss', 1, { tags: ['outside'] }),
  R('i_pro', 'HB Stretch', 'oz', -1, { tags: ['outside'] }),
  R('i_pro', 'Counter Trey', 'counter', 1, { tags: ['inside'] }),
  R('i_pro', 'HB Dive', 'dive', -1, { tags: ['inside', 'short'] }),
  P('i_pro', 'PA Boot Over', { X: 'over', Z: 'go', Y: 'flat', FB: 'flat', RB: B }, { type: 'pa', drop: 'boot', side: -1, reads: ['X', 'Y', 'Z', 'FB'], tags: ['pa', 'medium'] }),
  P('i_pro', 'PA Post Shot', { X: 'post', Z: 'dig', Y: B, FB: B, RB: B }, { type: 'pa', drop: 'pa', reads: ['X', 'Z'], tags: ['pa', 'deep'] }),
  P('i_pro', 'Curl Flats', { X: 'curl', Z: 'curl', Y: 'flat', FB: 'flat', RB: B }, { drop: 'm', reads: ['Z', 'Y', 'X', 'FB'], tags: ['medium', 'zone'] }),
  P('i_pro', 'Slants', { X: 'slant', Z: 'slant', Y: 'drag', FB: B, RB: 'flat' }, { drop: 'q', reads: ['X', 'Z', 'Y', 'RB'], tags: ['short', 'quick', 'man'] }),
  P('i_pro', 'Smash', { X: 'hitch', Z: 'hitch', Y: 'corner', FB: B, RB: 'swing' }, { drop: 'm', reads: ['Y', 'Z', 'X', 'RB'], tags: ['medium', 'zone', 'redzone'] }),
  // ----------------------------- STRONG I -----------------------------
  R('strong_i', 'Power O Strong', 'power', 1, { tags: ['inside', 'short'] }),
  R('strong_i', 'HB Iso Strong', 'iso', 1, { tags: ['inside', 'short'] }),
  R('strong_i', 'Toss Strong', 'toss', 1, { tags: ['outside'] }),
  R('strong_i', 'Off Tackle', 'oz', 1, { tags: ['outside'] }),
  P('strong_i', 'PA Crossers', { X: 'cross', Z: 'post', Y: 'shallow', FB: 'flat', RB: B }, { type: 'pa', drop: 'pa', reads: ['X', 'Y', 'Z', 'FB'], tags: ['pa', 'medium'] }),
  P('strong_i', 'Flood', { X: 'post', Z: 'go', Y: 'out', FB: 'flat', RB: B }, { drop: 'm', reads: ['Y', 'FB', 'Z', 'X'], tags: ['medium', 'zone'] }),
  P('strong_i', 'TE Leak', { X: 'go', Z: 'curl', Y: 'leak', FB: B, RB: B }, { type: 'pa', drop: 'boot', side: -1, reads: ['Y', 'Z', 'X'], tags: ['pa', 'medium'] }),
  // ----------------------------- WEAK I -----------------------------
  R('weak_i', 'HB Weak Iso', 'iso', -1, { tags: ['inside', 'short'] }),
  R('weak_i', 'Weak Stretch', 'oz', -1, { tags: ['outside'] }),
  R('weak_i', 'Counter Weak', 'counter', -1, { tags: ['inside'] }),
  R('weak_i', 'HB Dive Weak', 'dive', -1, { tags: ['inside', 'short'] }),
  P('weak_i', 'PA Scissors', { X: 'corner', Z: 'post', Y: 'drag', FB: 'flat', RB: B }, { type: 'pa', drop: 'pa', reads: ['Z', 'X', 'Y', 'FB'], tags: ['pa', 'deep'] }),
  P('weak_i', 'Quick Outs', { X: 'quick_out', Z: 'quick_out', Y: 'stick', FB: B, RB: 'swing' }, { drop: 'q', reads: ['Z', 'Y', 'X', 'RB'], tags: ['short', 'quick', 'sideline'] }),
  // ----------------------------- SINGLEBACK ACE -----------------------------
  R('ace', 'Inside Zone', 'iz', 1, { tags: ['inside'] }),
  R('ace', 'Outside Zone', 'oz', 1, { tags: ['outside'] }),
  R('ace', 'Counter', 'counter', -1, { tags: ['inside'] }),
  R('ace', 'HB Dive', 'dive', 1, { tags: ['inside', 'short'] }),
  P('ace', 'PA Boot Flood', { X: 'go', Z: 'out', Y: 'flat', H: 'leak', RB: B }, { type: 'pa', drop: 'boot', side: 1, reads: ['Z', 'Y', 'H', 'X'], tags: ['pa', 'medium'] }),
  P('ace', 'Four Verticals', { X: 'go', Z: 'go', Y: 'seam', H: 'seam', RB: 'swing' }, { drop: 'm', reads: ['Y', 'H', 'X', 'Z', 'RB'], tags: ['deep', 'zone'] }),
  P('ace', 'Y-Stick', { X: 'go', Z: 'quick_out', Y: 'stick', H: 'flat', RB: B }, { drop: 'q', reads: ['Y', 'H', 'Z', 'X'], tags: ['short', 'quick', 'redzone'] }),
  P('ace', 'TE Seams PA', { X: 'dig', Z: 'go', Y: 'seam', H: 'seam', RB: B }, { type: 'pa', drop: 'pa', reads: ['Y', 'H', 'X', 'Z'], tags: ['pa', 'deep'] }),
  // ----------------------------- SINGLEBACK DOUBLES -----------------------------
  R('sb_doubles', 'Inside Zone', 'iz', 1, { tags: ['inside'] }),
  R('sb_doubles', 'Outside Zone', 'oz', -1, { tags: ['outside'] }),
  R('sb_doubles', 'HB Draw', 'draw', 1, { tags: ['inside', 'draw'] }),
  P('sb_doubles', 'Mesh', { X: 'go', SL: 'drag', Z: 'curl', Y: 'drag', RB: 'flat' }, { drop: 'm', reads: ['SL', 'Y', 'RB', 'Z', 'X'], tags: ['short', 'man'] }),
  P('sb_doubles', 'Smash', { X: 'hitch', SL: 'corner', Z: 'hitch', Y: 'corner', RB: B }, { drop: 'm', reads: ['SL', 'Y', 'X', 'Z'], tags: ['medium', 'zone'] }),
  P('sb_doubles', 'Slant Flat', { X: 'slant', SL: 'flat', Z: 'slant', Y: 'flat', RB: B }, { drop: 'q', reads: ['X', 'SL', 'Z', 'Y'], tags: ['short', 'quick'] }),
  P('sb_doubles', 'Dagger', { X: 'go', SL: 'seam', Z: 'dig', Y: 'drag', RB: B }, { drop: 'd', reads: ['SL', 'Z', 'X', 'Y'], tags: ['deep', 'zone'] }),
  P('sb_doubles', 'PA Deep Cross', { X: 'post', SL: 'drag', Z: 'cross', Y: B, RB: B }, { type: 'pa', drop: 'pa', reads: ['Z', 'X', 'SL'], tags: ['pa', 'deep'] }),
  // ----------------------------- SINGLEBACK BUNCH -----------------------------
  R('sb_bunch', 'Inside Zone', 'iz', -1, { tags: ['inside'] }),
  R('sb_bunch', 'Stretch Bunch', 'oz', 1, { tags: ['outside'] }),
  P('sb_bunch', 'Bunch Spot', { X: 'slant', Y: 'snag', Z: 'flat', SL: 'corner', RB: B }, { drop: 'q', reads: ['Y', 'SL', 'Z', 'X'], tags: ['short', 'zone', 'redzone'] }),
  P('sb_bunch', 'Bunch Drive', { X: 'go', Y: 'drag', Z: 'dig', SL: 'flat', RB: 'block' }, { drop: 'm', reads: ['Y', 'Z', 'SL', 'X'], tags: ['short', 'man'] }),
  P('sb_bunch', 'PA Bunch Shot', { X: 'post', Y: 'flat', Z: 'go', SL: 'corner', RB: B }, { type: 'pa', drop: 'pa', reads: ['SL', 'X', 'Z', 'Y'], tags: ['pa', 'deep'] }),
  // ----------------------------- GOAL LINE -----------------------------
  R('goal_line', 'QB Sneak', 'sneak', 1, { ball: 'QB', tags: ['inside', 'short', 'sneak'] }),
  R('goal_line', 'HB Dive', 'dive', 1, { tags: ['inside', 'short'] }),
  R('goal_line', 'Power O', 'power', -1, { tags: ['inside', 'short'] }),
  R('goal_line', 'FB Dive', 'dive', -1, { ball: 'FB', tags: ['inside', 'short'] }),
  R('goal_line', 'HB Toss', 'toss', 1, { tags: ['outside', 'short'] }),
  P('goal_line', 'PA TE Flat', { Y: 'flat', H: 'drag', X: 'corner', FB: B, RB: B }, { type: 'pa', drop: 'pa', reads: ['Y', 'X', 'H'], tags: ['pa', 'short', 'redzone'] }),
  P('goal_line', 'PA Boot TE', { Y: 'drag', H: 'flat', X: 'flat', FB: 'flat', RB: B }, { type: 'pa', drop: 'boot', side: -1, reads: ['H', 'X', 'FB', 'Y'], tags: ['pa', 'short', 'redzone'] }),
  // ----------------------------- PISTOL ACE -----------------------------
  R('pistol_ace', 'Inside Zone', 'iz', 1, { tags: ['inside'] }),
  R('pistol_ace', 'Outside Zone', 'oz', -1, { tags: ['outside'] }),
  R('pistol_ace', 'Power', 'power', 1, { tags: ['inside', 'short'] }),
  R('pistol_ace', 'Zone Read', 'read', 1, { tags: ['inside', 'option'] }),
  R('pistol_ace', 'Speed Option', 'option', -1, { ball: 'QB', tags: ['outside', 'option'] }),
  P('pistol_ace', 'PA Boot', { X: 'over', Z: 'go', Y: 'flat', H: 'drag', RB: B }, { type: 'pa', drop: 'boot', side: -1, reads: ['X', 'H', 'Y', 'Z'], tags: ['pa', 'medium'] }),
  P('pistol_ace', 'Y-Cross', { X: 'go', Z: 'curl', Y: 'cross', H: 'flat', RB: B }, { drop: 'd', reads: ['Y', 'Z', 'H', 'X'], tags: ['medium', 'zone'] }),
  // ----------------------------- GUN DOUBLES -----------------------------
  R('gun_doubles', 'Inside Zone', 'iz', 1, { tags: ['inside'] }),
  R('gun_doubles', 'HB Draw', 'draw', -1, { tags: ['inside', 'draw'] }),
  R('gun_doubles', 'Zone Read', 'read', 1, { tags: ['inside', 'option'] }),
  // RPOs: the QB reads the overhang defender — hand off, or pull it and throw.
  R('gun_doubles', 'RPO Bubble', 'iz', 1, { rpo: { tag: 'SL', route: 'bubble' }, tags: ['inside', 'rpo'] }),
  R('gun_doubles', 'RPO Slant', 'iz', 1, { rpo: { tag: 'X', route: 'slant' }, tags: ['inside', 'rpo'] }),
  P('gun_doubles', 'Mesh Spot', { X: 'go', SL: 'drag', Z: 'snag', Y: 'drag', RB: 'flat' }, { drop: 'q', reads: ['SL', 'Y', 'Z', 'RB', 'X'], tags: ['short', 'man'] }),
  P('gun_doubles', 'Stick', { X: 'fade', SL: 'stick', Z: 'go', Y: 'stick', RB: 'flat' }, { drop: 'q', reads: ['Y', 'SL', 'RB', 'Z', 'X'], tags: ['short', 'quick', 'zone'] }),
  P('gun_doubles', 'Four Verticals', { X: 'go', SL: 'seam', Z: 'go', Y: 'seam', RB: 'swing' }, { drop: 'm', reads: ['SL', 'Y', 'X', 'Z', 'RB'], tags: ['deep', 'zone'] }),
  P('gun_doubles', 'Dagger', { X: 'dig', SL: 'seam', Z: 'go', Y: 'drag', RB: B }, { drop: 'd', reads: ['SL', 'X', 'Y', 'Z'], tags: ['deep', 'zone'] }),
  P('gun_doubles', 'Smash', { X: 'hitch', SL: 'corner', Z: 'hitch', Y: 'corner', RB: 'flat' }, { drop: 'm', reads: ['SL', 'Y', 'X', 'Z', 'RB'], tags: ['medium', 'zone', 'redzone'] }),
  P('gun_doubles', 'Slants', { X: 'slant', SL: 'slant', Z: 'slant', Y: 'flat', RB: B }, { drop: 'q', reads: ['SL', 'X', 'Z', 'Y'], tags: ['short', 'quick', 'man'] }),
  P('gun_doubles', 'HB Screen', { X: 'go', SL: 'go', Z: 'go', Y: 'drag', RB: 'rb_screen' }, { drop: 'screen', screen: 'RB', reads: ['RB'], tags: ['screen'] }),
  P('gun_doubles', 'Bubble Screen', { X: 'run_block', SL: 'bubble', Z: 'go', Y: 'drag', RB: B }, { drop: 'q', screen: 'SL', reads: ['SL'], tags: ['screen', 'quick'] }),
  // ----------------------------- GUN TRIPS TE -----------------------------
  R('gun_trips', 'Inside Zone', 'iz', -1, { tags: ['inside'] }),
  R('gun_trips', 'RPO Glance', 'iz', -1, { rpo: { tag: 'Z', route: 'glance' }, tags: ['inside', 'rpo'] }),
  R('gun_trips', 'Zone Read', 'read', 1, { tags: ['inside', 'option'] }),
  R('gun_trips', 'Counter', 'counter', 1, { tags: ['inside'] }),
  R('gun_trips', 'HB Draw', 'draw', 1, { tags: ['inside', 'draw'] }),
  P('gun_trips', 'Y-Cross', { X: 'post', Z: 'go', SL: 'curl', Y: 'cross', RB: 'flat' }, { drop: 'd', reads: ['Y', 'SL', 'RB', 'X'], tags: ['medium', 'zone'] }),
  P('gun_trips', 'Sail', { X: 'curl', Z: 'go', SL: 'out', Y: 'flat', RB: B }, { drop: 'm', reads: ['SL', 'Y', 'Z', 'X'], tags: ['medium', 'zone', 'sideline'] }),
  P('gun_trips', 'Spacing', { X: 'hitch', Z: 'hitch', SL: 'snag', Y: 'stick', RB: 'flat' }, { drop: 'q', reads: ['SL', 'Y', 'RB', 'Z', 'X'], tags: ['short', 'quick', 'zone'] }),
  P('gun_trips', 'Verticals', { X: 'go', Z: 'go', SL: 'seam', Y: 'seam', RB: 'flat' }, { drop: 'm', reads: ['SL', 'Y', 'X', 'Z', 'RB'], tags: ['deep', 'zone'] }),
  P('gun_trips', 'Levels', { X: 'slant', Z: 'dig', SL: 'in', Y: 'go', RB: B }, { drop: 'm', reads: ['SL', 'Z', 'X', 'Y'], tags: ['medium', 'man'] }),
  P('gun_trips', 'WR Screen', { X: 'go', Z: 'run_block', SL: 'wr_screen', Y: 'run_block', RB: B }, { drop: 'q', screen: 'SL', reads: ['SL'], tags: ['screen', 'quick'] }),
  // ----------------------------- GUN BUNCH -----------------------------
  R('gun_bunch', 'Inside Zone', 'iz', -1, { tags: ['inside'] }),
  R('gun_bunch', 'HB Draw', 'draw', 1, { tags: ['inside', 'draw'] }),
  P('gun_bunch', 'Snag', { X: 'slant', Y: 'snag', Z: 'flat', SL: 'corner', RB: 'swing' }, { drop: 'q', reads: ['Y', 'SL', 'Z', 'X', 'RB'], tags: ['short', 'zone', 'redzone'] }),
  P('gun_bunch', 'Bunch Mesh', { X: 'dig', Y: 'drag', Z: 'go', SL: 'drag', RB: 'flat' }, { drop: 'm', reads: ['SL', 'Y', 'RB', 'X', 'Z'], tags: ['short', 'man'] }),
  P('gun_bunch', 'Drive', { X: 'go', Y: 'dig', Z: 'drag', SL: 'flat', RB: B }, { drop: 'm', reads: ['Z', 'Y', 'SL', 'X'], tags: ['short', 'man'] }),
  P('gun_bunch', 'Flood Corner', { X: 'post', Y: 'out', Z: 'corner', SL: 'flat', RB: B }, { drop: 'm', reads: ['Z', 'Y', 'SL', 'X'], tags: ['medium', 'zone'] }),
  // ----------------------------- GUN SPREAD -----------------------------
  R('gun_spread', 'Inside Zone', 'iz', 1, { tags: ['inside'] }),
  R('gun_spread', 'HB Draw', 'draw', -1, { tags: ['inside', 'draw'] }),
  R('gun_spread', 'QB Draw', 'qb_draw', 1, { ball: 'QB', tags: ['inside', 'draw'] }),
  P('gun_spread', 'Four Verticals', { X: 'go', SL2: 'seam', Z: 'go', SL: 'seam', RB: 'flat' }, { drop: 'm', reads: ['SL', 'SL2', 'X', 'Z', 'RB'], tags: ['deep', 'zone'] }),
  P('gun_spread', 'Mesh', { X: 'go', SL2: 'drag', Z: 'curl', SL: 'drag', RB: 'flat' }, { drop: 'm', reads: ['SL', 'SL2', 'RB', 'Z', 'X'], tags: ['short', 'man'] }),
  P('gun_spread', 'Shallow Cross', { X: 'dig', SL2: 'shallow', Z: 'go', SL: 'sit', RB: B }, { drop: 'm', reads: ['SL2', 'X', 'SL', 'Z'], tags: ['short', 'man'] }),
  P('gun_spread', 'All Curls', { X: 'curl', SL2: 'curl', Z: 'curl', SL: 'curl', RB: 'flat' }, { drop: 'm', reads: ['SL', 'SL2', 'Z', 'X', 'RB'], tags: ['medium', 'zone'] }),
  P('gun_spread', 'Quick Slants', { X: 'slant', SL2: 'flat', Z: 'slant', SL: 'flat', RB: B }, { drop: 'q', reads: ['Z', 'X', 'SL', 'SL2'], tags: ['short', 'quick', 'man'] }),
  P('gun_spread', 'Post Wheel', { X: 'post', SL2: 'wheel', Z: 'curl', SL: 'drag', RB: B }, { drop: 'd', reads: ['SL2', 'X', 'Z', 'SL'], tags: ['deep', 'man'] }),
  P('gun_spread', 'Double Moves', { X: 'sluggo', SL2: 'out_up', Z: 'hitch_go', SL: 'sit', RB: B }, { drop: 'd', reads: ['X', 'Z', 'SL2', 'SL'], tags: ['deep', 'man'] }),
  P('gun_spread', 'Bubble Screen', { X: 'go', SL2: 'run_block', Z: 'run_block', SL: 'bubble', RB: B }, { drop: 'q', screen: 'SL', reads: ['SL'], tags: ['screen', 'quick'] }),
  // ----------------------------- GUN TRIPS OPEN -----------------------------
  R('gun_trips_open', 'Inside Zone', 'iz', -1, { tags: ['inside'] }),
  R('gun_trips_open', 'HB Draw', 'draw', 1, { tags: ['inside', 'draw'] }),
  P('gun_trips_open', 'Trips Verticals', { X: 'go', Z: 'go', SL: 'seam', SL2: 'seam', RB: 'flat' }, { drop: 'm', reads: ['SL2', 'SL', 'X', 'Z', 'RB'], tags: ['deep', 'zone'] }),
  P('gun_trips_open', 'Levels', { X: 'slant', Z: 'go', SL: 'dig', SL2: 'in', RB: B }, { drop: 'm', reads: ['SL2', 'SL', 'X', 'Z'], tags: ['medium', 'man'] }),
  P('gun_trips_open', 'Stick Nod', { X: 'fade', Z: 'go', SL: 'stick', SL2: 'flat', RB: 'block' }, { drop: 'q', reads: ['SL', 'SL2', 'X', 'Z'], tags: ['short', 'quick'] }),
  P('gun_trips_open', 'Flood', { X: 'dig', Z: 'go', SL: 'out', SL2: 'flat', RB: B }, { drop: 'm', reads: ['SL', 'SL2', 'X', 'Z'], tags: ['medium', 'zone', 'sideline'] }),
  P('gun_trips_open', 'Tunnel Screen', { X: 'go', Z: 'wr_screen', SL: 'run_block', SL2: 'run_block', RB: B }, { drop: 'q', screen: 'Z', reads: ['Z'], tags: ['screen', 'quick'] }),
  // ----------------------------- GUN EMPTY -----------------------------
  R('gun_empty', 'QB Draw', 'qb_draw', 1, { ball: 'QB', tags: ['inside', 'draw'] }),
  P('gun_empty', 'Quick Slants', { X: 'slant', SL2: 'slant', Z: 'slant', SL: 'slant', Y: 'flat' }, { drop: 'q', reads: ['SL', 'SL2', 'Z', 'X', 'Y'], tags: ['short', 'quick', 'man'] }),
  P('gun_empty', 'Spacing', { X: 'hitch', SL2: 'stick', Z: 'hitch', SL: 'snag', Y: 'flat' }, { drop: 'q', reads: ['SL', 'SL2', 'Y', 'Z', 'X'], tags: ['short', 'quick', 'zone'] }),
  P('gun_empty', 'Verticals', { X: 'go', SL2: 'seam', Z: 'go', SL: 'seam', Y: 'sit' }, { drop: 'm', reads: ['SL', 'SL2', 'Y', 'X', 'Z'], tags: ['deep', 'zone'] }),
  P('gun_empty', 'Mesh Wheel', { X: 'dig', SL2: 'drag', Z: 'go', SL: 'drag', Y: 'wheel' }, { drop: 'm', reads: ['SL', 'SL2', 'Y', 'X'], tags: ['short', 'man'] }),
  P('gun_empty', 'Hail Mary', { X: 'go', SL2: 'go', Z: 'go', SL: 'go', Y: 'go' }, { drop: 'd', reads: ['SL', 'SL2', 'X', 'Z', 'Y'], tags: ['hailmary', 'deep'] }),
];

// Clock-management specials (not shown in normal formations list).
export const SPECIAL_OFF = {
  kneel: { form: 'i_pro', name: 'QB Kneel', type: 'kneel', routes: {}, tags: ['kneel'], side: 1 },
  spike: { form: 'gun_doubles', name: 'QB Spike', type: 'spike', routes: {}, tags: ['spike'], side: 1 },
};

OFF_PLAYS.forEach((p, i) => { p.id = `o${i}`; });
SPECIAL_OFF.kneel.id = 'kneel';
SPECIAL_OFF.spike.id = 'spike';

// Formations available to each offensive style (order = display order).
export const STYLE_FORMATIONS = {
  westcoast: ['gun_doubles', 'gun_bunch', 'sb_doubles', 'sb_bunch', 'i_pro', 'weak_i', 'ace', 'gun_trips', 'gun_spread', 'gun_empty', 'goal_line'],
  spread: ['gun_spread', 'gun_doubles', 'gun_trips', 'gun_trips_open', 'gun_empty', 'gun_bunch', 'pistol_ace', 'sb_doubles', 'goal_line'],
  power: ['i_pro', 'strong_i', 'weak_i', 'ace', 'pistol_ace', 'sb_doubles', 'gun_doubles', 'gun_trips', 'goal_line'],
  airraid: ['gun_spread', 'gun_trips_open', 'gun_empty', 'gun_trips', 'gun_doubles', 'gun_bunch', 'sb_doubles', 'goal_line'],
  vertical: ['sb_doubles', 'ace', 'i_pro', 'strong_i', 'gun_doubles', 'gun_trips', 'gun_spread', 'pistol_ace', 'goal_line'],
  balanced: ['i_pro', 'strong_i', 'ace', 'sb_doubles', 'sb_bunch', 'gun_doubles', 'gun_trips', 'gun_spread', 'pistol_ace', 'goal_line'],
};

// Run/pass lean per style on standard downs (probability of calling a run).
export const STYLE_RUN_RATE = { westcoast: 0.46, spread: 0.44, power: 0.57, airraid: 0.37, vertical: 0.46, balanced: 0.5 };

export const OFF_STYLE_NAMES = { westcoast: 'West Coast', spread: 'Spread', power: 'Power Run', airraid: 'Air Raid', vertical: 'Vertical', balanced: 'Balanced' };

export function offensivePlaybook(style) {
  const forms = STYLE_FORMATIONS[style] || STYLE_FORMATIONS.balanced;
  return forms.map((form) => ({ form, plays: OFF_PLAYS.filter((p) => p.form === form) }));
}

export const playById = new Map([...OFF_PLAYS, SPECIAL_OFF.kneel, SPECIAL_OFF.spike].map((p) => [p.id, p]));
