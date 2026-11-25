// Offensive and defensive formations.
//
// Offensive slot fields:
//   tag   - assignment key used by plays (X, Z, SL, SL2, Y, H, RB, FB, QB, LT, LG, C, RG, RT)
//   pos   - roster position + depth index used to fill the slot, e.g. ['WR', 0]
//   align - 'ol' | 'qb' | 'te' | 'wing' | 'wide' | 'slot' | 'slot2' | 'tight' | 'bunch_pt' | 'bunch_in' | 'bunch_out' | 'back'
//   side  - -1 left / +1 right (offense frame), on - true if on the line of scrimmage
//   f,l   - explicit depth (negative = backfield) and lateral (+ = offense right) for 'back'/'qb'

const OL = [
  { tag: 'LT', pos: ['OT', 0], align: 'ol', l: -2.6 },
  { tag: 'LG', pos: ['OG', 0], align: 'ol', l: -1.3 },
  { tag: 'C', pos: ['C', 0], align: 'ol', l: 0 },
  { tag: 'RG', pos: ['OG', 1], align: 'ol', l: 1.3 },
  { tag: 'RT', pos: ['OT', 1], align: 'ol', l: 2.6 },
];

const QB_UC = { tag: 'QB', pos: ['QB', 0], align: 'qb', f: -1.15, l: 0 };
const QB_GUN = { tag: 'QB', pos: ['QB', 0], align: 'qb', f: -5, l: 0 };
const QB_PISTOL = { tag: 'QB', pos: ['QB', 0], align: 'qb', f: -3.6, l: 0 };

const f = (name, group, personnel, qb, slots, extra = {}) => ({ name, group, personnel, qb: qb.f < -4 ? 'gun' : qb.f < -2 ? 'pistol' : 'center', slots: [...OL, qb, ...slots], ...extra });

export const OFF_FORMATIONS = {
  i_pro: f('I-Form Pro', 'I-Form', '21', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'FB', pos: ['FB', 0], align: 'back', f: -4.2, l: 0 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.9, l: 0 },
  ]),
  strong_i: f('Strong I', 'I-Form', '21', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'FB', pos: ['FB', 0], align: 'back', f: -4.2, l: 1.9 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.9, l: 0 },
  ]),
  weak_i: f('Weak I', 'I-Form', '21', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'FB', pos: ['FB', 0], align: 'back', f: -4.2, l: -1.9 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.9, l: 0 },
  ]),
  ace: f('Singleback Ace', 'Singleback', '12', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'H', pos: ['TE', 1], align: 'te', side: -1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.4, l: 0 },
  ]),
  sb_doubles: f('Singleback Doubles', 'Singleback', '11', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.4, l: 0 },
  ]),
  sb_bunch: f('Singleback Bunch', 'Singleback', '11', QB_UC, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'bunch_out', side: 1 },
    { tag: 'SL', pos: ['WR', 2], align: 'bunch_in', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'bunch_pt', side: 1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.4, l: 0 },
  ]),
  goal_line: f('Goal Line', 'Goal Line', '23', QB_UC, [
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'H', pos: ['TE', 1], align: 'te', side: -1, on: true },
    { tag: 'X', pos: ['TE', 2], align: 'wing', side: 1 },
    { tag: 'FB', pos: ['FB', 0], align: 'back', f: -4.0, l: 0 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -6.5, l: 0 },
  ], { shortYardage: true }),
  pistol_ace: f('Pistol Ace', 'Pistol', '12', QB_PISTOL, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'H', pos: ['TE', 1], align: 'wing', side: -1 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -7.0, l: 0 },
  ]),
  gun_doubles: f('Gun Doubles', 'Shotgun', '11', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -5.0, l: -1.3 },
  ]),
  gun_trips: f('Gun Trips TE', 'Shotgun', '11', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1 },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'te', side: 1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -5.0, l: -1.3 },
  ]),
  gun_bunch: f('Gun Bunch', 'Shotgun', '11', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'bunch_out', side: 1 },
    { tag: 'SL', pos: ['WR', 2], align: 'bunch_in', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'bunch_pt', side: 1, on: true },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -5.0, l: -1.3 },
  ]),
  gun_spread: f('Gun Spread', 'Shotgun', '10', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'SL2', pos: ['WR', 3], align: 'slot', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1, on: true },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: 1 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -5.0, l: 1.3 },
  ]),
  gun_trips_open: f('Gun Trips Open', 'Shotgun', '10', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1, on: true },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: 1 },
    { tag: 'SL2', pos: ['WR', 3], align: 'slot2', side: 1 },
    { tag: 'RB', pos: ['HB', 0], align: 'back', f: -5.0, l: -1.3 },
  ]),
  gun_empty: f('Gun Empty', 'Shotgun', '11', QB_GUN, [
    { tag: 'X', pos: ['WR', 0], align: 'wide', side: -1, on: true },
    { tag: 'SL2', pos: ['HB', 0], align: 'slot', side: -1 },
    { tag: 'Z', pos: ['WR', 1], align: 'wide', side: 1, on: true },
    { tag: 'SL', pos: ['WR', 2], align: 'slot', side: 1 },
    { tag: 'Y', pos: ['TE', 0], align: 'slot2', side: 1 },
  ], { empty: true }),
};

// ---------------------------------------------------------------------------
// Defensive formations. Front-seven slots use alignment specs relative to the
// offensive line; DB alignment is derived from each play's assignment.
//   dl:  tech (0,1,2i,3,4i,4,5,7,9) on side (+1 strong, -1 weak)
//   lb:  l offset (strong-relative) and depth f
//   edge: stand-up rusher outside the tackle/TE
//   db:  cornerback / safety / nickel; aligned by assignment
// ---------------------------------------------------------------------------
const df = (name, group, slots, extra = {}) => ({ name, group, slots, ...extra });

export const DEF_FORMATIONS = {
  d43_over: df('4-3 Over', '4-3', [
    { tag: 'LE', pos: ['DE', 1], dl: '5', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '1', side: -1 },
    { tag: 'DT2', pos: ['DT', 1], dl: '3', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '7', side: 1 },
    { tag: 'WLB', pos: ['OLB', 1], lb: { l: -3.6, f: 4.6 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 0.3, f: 5.0 } },
    { tag: 'SLB', pos: ['OLB', 0], lb: { l: 4.2, f: 4.2 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ]),
  d43_under: df('4-3 Under', '4-3', [
    { tag: 'LE', pos: ['DE', 1], dl: '5', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '3', side: -1 },
    { tag: 'DT2', pos: ['DT', 1], dl: '1', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '5', side: 1 },
    { tag: 'WLB', pos: ['OLB', 1], lb: { l: -2.4, f: 4.6 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 1.0, f: 4.8 } },
    { tag: 'SLB', pos: ['OLB', 0], lb: { l: 4.6, f: 1.2 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ]),
  d34_odd: df('3-4 Odd', '3-4', [
    { tag: 'LE', pos: ['DE', 1], dl: '4i', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '0', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '4i', side: 1 },
    { tag: 'LOLB', pos: ['OLB', 1], edge: true, side: -1 },
    { tag: 'WLB', pos: ['MLB', 1], lb: { l: -2.0, f: 4.6 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 2.0, f: 4.6 } },
    { tag: 'ROLB', pos: ['OLB', 0], edge: true, side: 1 },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ]),
  nickel_425: df('Nickel 4-2-5', 'Nickel', [
    { tag: 'LE', pos: ['DE', 1], dl: '5', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '2i', side: -1 },
    { tag: 'DT2', pos: ['DT', 1], dl: '3', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '5', side: 1 },
    { tag: 'WLB', pos: ['OLB', 0], lb: { l: -1.8, f: 4.8 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 1.8, f: 4.8 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'NB', pos: ['CB', 2], db: 'nb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ], { nickel: true }),
  nickel_335: df('Nickel 3-3-5', 'Nickel', [
    { tag: 'LE', pos: ['DE', 1], dl: '4', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '0', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '4', side: 1 },
    { tag: 'LOLB', pos: ['OLB', 1], lb: { l: -4.0, f: 4.2 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 0, f: 5.2 } },
    { tag: 'ROLB', pos: ['OLB', 0], lb: { l: 4.0, f: 4.2 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'NB', pos: ['CB', 2], db: 'nb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ], { nickel: true }),
  dime_416: df('Dime 4-1-6', 'Dime', [
    { tag: 'LE', pos: ['DE', 1], dl: '5', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '2i', side: -1 },
    { tag: 'DT2', pos: ['DT', 1], dl: '3', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '5', side: 1 },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 0.4, f: 5.4 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'NB', pos: ['CB', 2], db: 'nb' },
    { tag: 'DB', pos: ['CB', 3], db: 'nb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ], { dime: true }),
  goal_line_d: df('Goal Line 5-3', 'Goal Line', [
    { tag: 'LE', pos: ['DE', 1], dl: '7', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '2i', side: -1 },
    { tag: 'NT', pos: ['DT', 2], dl: '0', side: 1 },
    { tag: 'DT2', pos: ['DT', 1], dl: '2i', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '7', side: 1 },
    { tag: 'WLB', pos: ['OLB', 1], lb: { l: -3.0, f: 3.0 } },
    { tag: 'MLB', pos: ['MLB', 0], lb: { l: 0, f: 3.2 } },
    { tag: 'SLB', pos: ['OLB', 0], lb: { l: 3.0, f: 3.0 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ], { goalLine: true }),
  quarter_317: df('Quarter 3-1-7', 'Prevent', [
    { tag: 'LE', pos: ['DE', 1], dl: '4', side: -1 },
    { tag: 'DT1', pos: ['DT', 0], dl: '0', side: 1 },
    { tag: 'RE', pos: ['DE', 0], dl: '4', side: 1 },
    { tag: 'MLB', pos: ['OLB', 0], lb: { l: 0, f: 6.5 } },
    { tag: 'CB1', pos: ['CB', 0], db: 'cb' },
    { tag: 'CB2', pos: ['CB', 1], db: 'cb' },
    { tag: 'NB', pos: ['CB', 2], db: 'nb' },
    { tag: 'DB', pos: ['CB', 3], db: 'nb' },
    { tag: 'DB2', pos: ['CB', 4], db: 'nb' },
    { tag: 'FS', pos: ['FS', 0], db: 's' },
    { tag: 'SS', pos: ['SS', 0], db: 's' },
  ], { prevent: true }),
};

// Technique lateral offsets (yards from center, before applying side).
export const DL_TECH = { '0': 0, '1': 0.6, '2i': 1.0, '2': 1.3, '3': 1.9, '4i': 2.2, '4': 2.6, '5': 3.3, '6': 3.9, '7': 4.3, '9': 5.2 };
