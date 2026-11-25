// Field geometry and global simulation constants. Units are yards and seconds.
// Field frame: x runs along the length (0..120, end zones 0-10 and 110-120),
// y runs across the width (0..53.33). z is height above the turf.

export const FIELD_LENGTH = 120;
export const FIELD_WIDTH = 160 / 3; // 53.333 yd
export const GOAL_LINE_W = 10; // west goal line
export const GOAL_LINE_E = 110; // east goal line
export const END_LINE_W = 0;
export const END_LINE_E = 120;
export const MID_Y = FIELD_WIDTH / 2;
// NFL hash marks are 70' 9" from each sideline -> 23.58 yd, i.e. 6.17 yd either side of center.
export const HASH_OFFSET = 6.1667;
export const HASH_LEFT_Y = MID_Y - HASH_OFFSET;
export const HASH_RIGHT_Y = MID_Y + HASH_OFFSET;

export const GOALPOST_HALF_WIDTH = 18.5 / 3 / 2; // 18'6" between uprights
export const CROSSBAR_HEIGHT = 10 / 3; // 10 ft
export const UPRIGHT_HEIGHT = CROSSBAR_HEIGHT + 35 / 3;

export const DT = 1 / 60; // fixed simulation step
export const GRAVITY = 10.72; // yd/s^2 (9.81 m/s^2)
export const PLAYER_RADIUS = 0.42;
export const BALL_CARRY_HEIGHT = 1.15;

export const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS', 'K', 'P',
];

// Roster position groups (depth chart buckets)
export const ROSTER_POS = ['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS', 'K', 'P'];

export const OFFENSE_POS = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C']);
export const DEFENSE_POS = new Set(['DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS']);
export const ELIGIBLE_POS = new Set(['HB', 'FB', 'WR', 'TE']);

export const DIFFICULTIES = ['Rookie', 'Pro', 'All-Pro', 'Legend'];

export const RATING_KEYS = [
  'spd', 'acc', 'agi', 'str', 'awr', 'jmp', 'sta', 'inj',
  'car', 'btk', 'trk', 'elu', 'sfa', 'spm', 'jkm', 'bcv',
  'cth', 'cit', 'spc', 'rte', 'rls',
  'thp', 'sac', 'mac', 'dac', 'tor', 'tup',
  'rbk', 'pbk', 'ibl',
  'tak', 'pow', 'pur', 'prc', 'bsh', 'pmv', 'fmv', 'mcv', 'zcv', 'prs',
  'kpw', 'kac',
];

export const RATING_LABELS = {
  spd: 'Speed', acc: 'Acceleration', agi: 'Agility', str: 'Strength', awr: 'Awareness',
  jmp: 'Jumping', sta: 'Stamina', inj: 'Injury', car: 'Carrying', btk: 'Break Tackle',
  trk: 'Trucking', elu: 'Elusiveness', sfa: 'Stiff Arm', spm: 'Spin Move', jkm: 'Juke Move',
  bcv: 'Ball Carrier Vision', cth: 'Catching', cit: 'Catch In Traffic', spc: 'Spectacular Catch',
  rte: 'Route Running', rls: 'Release', thp: 'Throw Power', sac: 'Short Accuracy',
  mac: 'Medium Accuracy', dac: 'Deep Accuracy', tor: 'Throw On Run', tup: 'Throw Under Pressure',
  rbk: 'Run Block', pbk: 'Pass Block', ibl: 'Impact Block', tak: 'Tackle', pow: 'Hit Power',
  pur: 'Pursuit', prc: 'Play Recognition', bsh: 'Block Shedding', pmv: 'Power Moves',
  fmv: 'Finesse Moves', mcv: 'Man Coverage', zcv: 'Zone Coverage', prs: 'Press',
  kpw: 'Kick Power', kac: 'Kick Accuracy',
};
