// Defensive playbook.
// Assignment shorthand (S = strong side, W = weak side, resolved at the snap):
//   'rush'           interior pass rush / run fit
//   'contain'        edge rush keeping outside leverage
//   'b:A_S'          blitz through a gap (A, B, C, E=edge) on a side
//   'm:S1'           man coverage on a receiver (#1 strong, #2 weak, RB, ...)
//   'z:deep_half_W'  zone drop (see ZONES in sim/defense.js)
//   'spy'            QB spy

const D = (form, name, cover, assign, opts = {}) => ({ form, name, cover, assign, tags: opts.tags || [], press: !!opts.press, show: opts.show });

const DL4 = { LE: 'contain', DT1: 'rush', DT2: 'rush', RE: 'contain' };
const DL3 = { LE: 'rush', DT1: 'rush', RE: 'rush' };

export const DEF_PLAYS = [
  // ----------------------------- 4-3 OVER -----------------------------
  D('d43_over', 'Cover 1 Robber', 'Cover 1', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', SLB: 'm:S3', WLB: 'm:RB', MLB: 'z:hole', FS: 'z:deep_mid' }, { tags: ['man'] }),
  D('d43_over', 'Cover 2 Zone', 'Cover 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', WLB: 'z:curl_W', MLB: 'z:hook_M', SLB: 'z:curl_S', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone'] }),
  D('d43_over', 'Tampa 2', 'Tampa 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', WLB: 'z:curl_W', MLB: 'z:tampa', SLB: 'z:curl_S', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone', 'deep'] }),
  D('d43_over', 'Cover 2 Man', 'Cover 2 Man', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', WLB: 'm:W2', MLB: 'm:RB', SLB: 'm:S2', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['man'], press: true }),
  D('d43_over', 'Cover 3 Sky', 'Cover 3', { ...DL4, CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:curl_S', SLB: 'z:hook_S', MLB: 'z:hook_W', WLB: 'z:curl_W' }, { tags: ['zone', 'base'] }),
  D('d43_over', 'Cover 4 Quarters', 'Cover 4', { ...DL4, CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM', WLB: 'z:curl_W', MLB: 'z:hook_M', SLB: 'z:curl_S' }, { tags: ['zone', 'deep'] }),
  D('d43_over', 'Cover 6', 'Cover 6', { ...DL4, CB1: 'z:flat_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_half_W', SS: 'z:deep_qtr_SM', WLB: 'z:curl_W', MLB: 'z:hook_M', SLB: 'z:curl_S' }, { tags: ['zone'] }),
  D('d43_over', 'Mike Blitz 1', 'Cover 1', { ...DL4, MLB: 'b:A_S', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', SLB: 'm:S3', WLB: 'm:RB', FS: 'z:deep_mid' }, { tags: ['man', 'blitz'] }),
  D('d43_over', 'Sam Fire 3', 'Fire Zone', { LE: 'contain', DT1: 'rush', DT2: 'rush', RE: 'z:hook_M', SLB: 'b:E_S', MLB: 'b:B_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:curl_S', WLB: 'z:curl_W' }, { tags: ['zone', 'blitz'] }),
  D('d43_over', 'Weak Blitz 3', 'Fire Zone', { ...DL4, WLB: 'b:B_W', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:curl_S', SLB: 'z:hook_S', MLB: 'z:curl_W' }, { tags: ['zone', 'blitz'] }),
  D('d43_over', 'Cover 0 Blitz', 'Cover 0', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', FS: 'm:W2', MLB: 'm:RB', SLB: 'b:E_S', WLB: 'b:B_W' }, { tags: ['man', 'blitz', 'allout'], press: true }),
  D('d43_over', 'Run Commit', 'Cover 3', { ...DL4, MLB: 'b:A_S', SLB: 'b:C_S', WLB: 'b:B_W', SS: 'z:hook_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid' }, { tags: ['zone', 'blitz', 'run'] }),
  // ----------------------------- 4-3 UNDER -----------------------------
  D('d43_under', 'Cover 3 Buzz', 'Cover 3', { ...DL4, CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:hook_S', SLB: 'z:curl_S', MLB: 'z:hook_W', WLB: 'z:curl_W' }, { tags: ['zone', 'base'] }),
  D('d43_under', 'Cover 1 Lurk', 'Cover 1', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', SLB: 'm:S3', WLB: 'm:RB', MLB: 'z:hole', FS: 'z:deep_mid' }, { tags: ['man'] }),
  D('d43_under', 'Cover 2 Zone', 'Cover 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', WLB: 'z:curl_W', MLB: 'z:hook_M', SLB: 'z:curl_S', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone'] }),
  D('d43_under', 'Under Smoke', 'Cover 1', { ...DL4, SLB: 'b:E_S', MLB: 'b:A_W', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', WLB: 'm:RB', FS: 'z:deep_mid' }, { tags: ['man', 'blitz', 'run'] }),
  D('d43_under', 'Cover 4 Palms', 'Cover 4', { ...DL4, CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM', WLB: 'z:curl_W', MLB: 'z:hook_M', SLB: 'z:curl_S' }, { tags: ['zone', 'deep'] }),
  // ----------------------------- 3-4 ODD -----------------------------
  D('d34_odd', 'Cover 3 Sky', 'Cover 3', { ...DL3, ROLB: 'contain', LOLB: 'z:curl_W', WLB: 'z:hook_W', MLB: 'z:hook_S', SS: 'z:curl_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid' }, { tags: ['zone', 'base'] }),
  D('d34_odd', 'Cover 2 Invert', 'Cover 2', { ...DL3, ROLB: 'contain', LOLB: 'z:flat_W', WLB: 'z:hook_W', MLB: 'z:hook_S', CB1: 'z:curl_W', CB2: 'z:flat_S', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone'] }),
  D('d34_odd', 'Cover 1 Press', 'Cover 1', { ...DL3, ROLB: 'contain', LOLB: 'contain', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', MLB: 'm:S3', WLB: 'm:RB', FS: 'z:deep_mid' }, { tags: ['man'], press: true }),
  D('d34_odd', 'Cover 4 Drop', 'Cover 4', { ...DL3, ROLB: 'z:curl_S', LOLB: 'contain', WLB: 'z:hook_W', MLB: 'z:hook_S', CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM' }, { tags: ['zone', 'deep'] }),
  D('d34_odd', 'OLB Fire', 'Fire Zone', { LE: 'rush', DT1: 'rush', RE: 'z:hook_M', ROLB: 'contain', LOLB: 'contain', MLB: 'b:B_S', WLB: 'z:curl_W', SS: 'z:curl_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid' }, { tags: ['zone', 'blitz'] }),
  D('d34_odd', 'Cross Fire', 'Cover 1', { ...DL3, ROLB: 'contain', LOLB: 'm:RB', MLB: 'b:A_W', WLB: 'b:A_S', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', FS: 'z:deep_mid' }, { tags: ['man', 'blitz'] }),
  D('d34_odd', 'Cover 0 Storm', 'Cover 0', { ...DL3, ROLB: 'contain', LOLB: 'contain', MLB: 'b:A_S', WLB: 'm:RB', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', FS: 'm:W2' }, { tags: ['man', 'blitz', 'allout'], press: true }),
  // ----------------------------- NICKEL 4-2-5 -----------------------------
  D('nickel_425', 'Cover 1 Robber', 'Cover 1', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', NB: 'm:S2', SS: 'm:S3', WLB: 'm:RB', MLB: 'z:hole', FS: 'z:deep_mid' }, { tags: ['man'] }),
  D('nickel_425', 'Cover 2 Zone', 'Cover 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', NB: 'z:curl_S', MLB: 'z:hook_M', WLB: 'z:curl_W', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone'] }),
  D('nickel_425', 'Tampa 2', 'Tampa 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', NB: 'z:curl_S', MLB: 'z:tampa', WLB: 'z:curl_W', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone', 'deep'] }),
  D('nickel_425', 'Cover 3 Match', 'Cover 3', { ...DL4, CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', NB: 'z:curl_S', MLB: 'z:hook_S', WLB: 'z:hook_W', SS: 'z:curl_W' }, { tags: ['zone', 'base'] }),
  D('nickel_425', 'Cover 4 Quarters', 'Cover 4', { ...DL4, CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM', NB: 'z:curl_S', WLB: 'z:curl_W', MLB: 'z:hook_M' }, { tags: ['zone', 'deep'] }),
  D('nickel_425', 'Cover 6', 'Cover 6', { ...DL4, CB1: 'z:flat_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_half_W', SS: 'z:deep_qtr_SM', NB: 'z:curl_S', MLB: 'z:hook_M', WLB: 'z:curl_W' }, { tags: ['zone'] }),
  D('nickel_425', '2 Man Under', 'Cover 2 Man', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', NB: 'm:S2', WLB: 'm:W2', MLB: 'm:RB', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['man', 'deep'], press: true }),
  D('nickel_425', 'Nickel Blitz', 'Cover 1', { ...DL4, NB: 'b:E_S', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', MLB: 'm:S3', WLB: 'm:RB', FS: 'z:deep_mid' }, { tags: ['man', 'blitz'] }),
  D('nickel_425', 'Nickel Fire Zone', 'Fire Zone', { LE: 'contain', DT1: 'rush', DT2: 'rush', RE: 'z:hook_M', NB: 'b:E_S', MLB: 'b:A_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:curl_S', WLB: 'z:curl_W' }, { tags: ['zone', 'blitz'] }),
  D('nickel_425', 'Cover 0 Blitz', 'Cover 0', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', NB: 'm:S2', SS: 'm:W2', FS: 'm:S3', WLB: 'm:RB', MLB: 'b:A_S' }, { tags: ['man', 'blitz', 'allout'], press: true }),
  // ----------------------------- NICKEL 3-3-5 -----------------------------
  D('nickel_335', 'Cover 3 Mable', 'Cover 3', { ...DL3, ROLB: 'b:E_S', LOLB: 'z:curl_W', MLB: 'z:hook_M', NB: 'z:curl_S', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:hook_S' }, { tags: ['zone', 'base'] }),
  D('nickel_335', 'Cover 1 Lurk', 'Cover 1', { ...DL3, ROLB: 'b:E_S', LOLB: 'm:RB', MLB: 'z:hole', NB: 'm:S2', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S3', FS: 'z:deep_mid' }, { tags: ['man'] }),
  D('nickel_335', 'Odd Fire', 'Fire Zone', { ...DL3, ROLB: 'b:E_S', LOLB: 'b:E_W', MLB: 'z:hook_M', NB: 'z:curl_S', SS: 'z:curl_W', CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid' }, { tags: ['zone', 'blitz'] }),
  D('nickel_335', 'Cover 4 Drop 8', 'Cover 4', { ...DL3, ROLB: 'z:curl_S', LOLB: 'z:curl_W', MLB: 'z:hook_M', NB: 'z:hook_S', CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM' }, { tags: ['zone', 'deep'] }),
  // ----------------------------- DIME 4-1-6 -----------------------------
  D('dime_416', 'Cover 2 Zone', 'Cover 2', { ...DL4, CB1: 'z:flat_W', CB2: 'z:flat_S', NB: 'z:curl_S', DB: 'z:curl_W', MLB: 'z:hook_M', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['zone', 'deep'] }),
  D('dime_416', 'Cover 4 Quarters', 'Cover 4', { ...DL4, CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM', NB: 'z:curl_S', DB: 'z:curl_W', MLB: 'z:hook_M' }, { tags: ['zone', 'deep'] }),
  D('dime_416', 'Cover 3 Dime', 'Cover 3', { ...DL4, CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', NB: 'z:curl_S', DB: 'z:curl_W', SS: 'z:hook_S', MLB: 'z:hook_W' }, { tags: ['zone'] }),
  D('dime_416', 'Cover 1 Dime', 'Cover 1', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', NB: 'm:S2', DB: 'm:W2', SS: 'm:S3', MLB: 'm:RB', FS: 'z:deep_mid' }, { tags: ['man'] }),
  D('dime_416', '2 Man Under', 'Cover 2 Man', { ...DL4, CB1: 'm:W1', CB2: 'm:S1', NB: 'm:S2', DB: 'm:W2', MLB: 'm:RB', FS: 'z:deep_half_W', SS: 'z:deep_half_S' }, { tags: ['man', 'deep'], press: true }),
  D('dime_416', 'Dime Sting', 'Cover 0', { ...DL4, NB: 'b:E_S', DB: 'b:E_W', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', FS: 'm:W2', MLB: 'm:RB' }, { tags: ['man', 'blitz', 'allout'], press: true }),
  // ----------------------------- GOAL LINE -----------------------------
  D('goal_line_d', 'GL Man', 'Cover 0', { LE: 'contain', DT1: 'rush', NT: 'rush', DT2: 'rush', RE: 'contain', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2', SLB: 'm:S3', WLB: 'm:RB', MLB: 'z:hole' }, { tags: ['man', 'goalline'], press: true }),
  D('goal_line_d', 'GL Zone', 'Cover 3', { LE: 'contain', DT1: 'rush', NT: 'rush', DT2: 'rush', RE: 'contain', CB1: 'z:flat_W', CB2: 'z:flat_S', SS: 'z:hook_S', WLB: 'z:hook_W', MLB: 'z:hook_M', SLB: 'z:curl_S' }, { tags: ['zone', 'goalline'] }),
  D('goal_line_d', 'GL Plug', 'Cover 0', { LE: 'contain', DT1: 'rush', NT: 'rush', DT2: 'rush', RE: 'contain', WLB: 'b:B_W', MLB: 'b:A_S', SLB: 'b:C_S', CB1: 'm:W1', CB2: 'm:S1', SS: 'm:S2' }, { tags: ['man', 'goalline', 'blitz', 'run'], press: true }),
  // ----------------------------- PREVENT -----------------------------
  D('quarter_317', 'Prevent Deep', 'Prevent', { ...DL3, CB1: 'z:deep_qtr_W', CB2: 'z:deep_qtr_S', FS: 'z:deep_qtr_WM', SS: 'z:deep_qtr_SM', DB2: 'z:deep_mid', NB: 'z:curl_S', DB: 'z:curl_W', MLB: 'z:hook_M' }, { tags: ['zone', 'prevent', 'deep'] }),
  D('quarter_317', 'Prevent 3 Deep', 'Prevent', { ...DL3, CB1: 'z:deep_third_W', CB2: 'z:deep_third_S', FS: 'z:deep_mid', SS: 'z:hole', DB2: 'z:hook_S', NB: 'z:curl_S', DB: 'z:curl_W', MLB: 'z:hook_W' }, { tags: ['zone', 'prevent', 'deep'] }),
];
DEF_PLAYS.forEach((p, i) => { p.id = `d${i}`; });

export const DEF_STYLE_FORMATIONS = {
  '43': ['d43_over', 'd43_under', 'nickel_425', 'dime_416', 'goal_line_d', 'quarter_317'],
  '34': ['d34_odd', 'nickel_335', 'nickel_425', 'dime_416', 'goal_line_d', 'quarter_317'],
  nickel: ['nickel_425', 'nickel_335', 'd43_over', 'dime_416', 'goal_line_d', 'quarter_317'],
};
export const DEF_STYLE_NAMES = { '43': '4-3', '34': '3-4', nickel: 'Multiple / Nickel' };

export function defensivePlaybook(style) {
  const forms = DEF_STYLE_FORMATIONS[style] || DEF_STYLE_FORMATIONS['43'];
  return forms.map((form) => ({ form, plays: DEF_PLAYS.filter((p) => p.form === form) }));
}

export const defPlayById = new Map(DEF_PLAYS.map((p) => [p.id, p]));
