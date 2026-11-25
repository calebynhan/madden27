// 32 original, fictional franchises of the Pro Gridiron League (PGL).
// offStyle drives playbook selection/tendencies; defStyle picks the base defense.
export const LEAGUE_NAME = 'Pro Gridiron League';
export const CONFERENCES = ['Liberty', 'Frontier'];
export const DIVISIONS = ['North', 'South', 'East', 'West'];

export const TEAMS = [
  // Liberty Conference
  { abbr: 'BOS', city: 'Boston', name: 'Sentinels', conf: 0, div: 2, primary: '#0B2545', secondary: '#A7B4C2', accent: '#C9A227', offStyle: 'westcoast', defStyle: '43', tier: 0.8 },
  { abbr: 'NYK', city: 'New York', name: 'Kingsmen', conf: 0, div: 2, primary: '#4B1D7A', secondary: '#E5E5E5', accent: '#F2B705', offStyle: 'spread', defStyle: 'nickel', tier: 0.55 },
  { abbr: 'PHI', city: 'Philadelphia', name: 'Founders', conf: 0, div: 2, primary: '#7A1F2B', secondary: '#F4E3B2', accent: '#1C1C1C', offStyle: 'power', defStyle: '43', tier: 0.7 },
  { abbr: 'BAL', city: 'Baltimore', name: 'Ironclads', conf: 0, div: 2, primary: '#2E3440', secondary: '#D08770', accent: '#ECEFF4', offStyle: 'power', defStyle: '34', tier: 0.6 },
  { abbr: 'PIT', city: 'Pittsburgh', name: 'Forge', conf: 0, div: 0, primary: '#1A1A1A', secondary: '#FF6B1A', accent: '#BFBFBF', offStyle: 'balanced', defStyle: '34', tier: 0.75 },
  { abbr: 'CLE', city: 'Cleveland', name: 'Thunder', conf: 0, div: 0, primary: '#1E3A8A', secondary: '#FACC15', accent: '#FFFFFF', offStyle: 'vertical', defStyle: '43', tier: 0.35 },
  { abbr: 'DET', city: 'Detroit', name: 'Machinists', conf: 0, div: 0, primary: '#3F4A54', secondary: '#25B8C9', accent: '#FFFFFF', offStyle: 'power', defStyle: '43', tier: 0.65 },
  { abbr: 'CLB', city: 'Columbus', name: 'Navigators', conf: 0, div: 0, primary: '#0F5257', secondary: '#E8C547', accent: '#FFFFFF', offStyle: 'westcoast', defStyle: 'nickel', tier: 0.45 },
  { abbr: 'ATL', city: 'Atlanta', name: 'Firebirds', conf: 0, div: 1, primary: '#B91C1C', secondary: '#111827', accent: '#F59E0B', offStyle: 'airraid', defStyle: 'nickel', tier: 0.7 },
  { abbr: 'MIA', city: 'Miami', name: 'Barracudas', conf: 0, div: 1, primary: '#0E7490', secondary: '#F97316', accent: '#FFFFFF', offStyle: 'spread', defStyle: '43', tier: 0.6 },
  { abbr: 'ORL', city: 'Orlando', name: 'Orbit', conf: 0, div: 1, primary: '#312E81', secondary: '#38BDF8', accent: '#F8FAFC', offStyle: 'airraid', defStyle: 'nickel', tier: 0.3 },
  { abbr: 'CHA', city: 'Charlotte', name: 'Monarchs', conf: 0, div: 1, primary: '#3B0764', secondary: '#14B8A6', accent: '#E2E8F0', offStyle: 'balanced', defStyle: '34', tier: 0.5 },
  { abbr: 'CHI', city: 'Chicago', name: 'Gales', conf: 0, div: 3, primary: '#14213D', secondary: '#E63946', accent: '#F1FAEE', offStyle: 'power', defStyle: '43', tier: 0.55 },
  { abbr: 'MIL', city: 'Milwaukee', name: 'Muskies', conf: 0, div: 3, primary: '#1B4332', secondary: '#D8F3DC', accent: '#B7791F', offStyle: 'balanced', defStyle: '34', tier: 0.4 },
  { abbr: 'MIN', city: 'Minneapolis', name: 'Polars', conf: 0, div: 3, primary: '#0B3954', secondary: '#E0F2FE', accent: '#60A5FA', offStyle: 'westcoast', defStyle: '43', tier: 0.65 },
  { abbr: 'STL', city: 'St. Louis', name: 'Archers', conf: 0, div: 3, primary: '#9F1239', secondary: '#1E293B', accent: '#E2E8F0', offStyle: 'vertical', defStyle: 'nickel', tier: 0.5 },
  // Frontier Conference
  { abbr: 'KC', city: 'Kansas City', name: 'Stampede', conf: 1, div: 0, primary: '#7C2D12', secondary: '#FDE68A', accent: '#1C1917', offStyle: 'spread', defStyle: '43', tier: 0.85 },
  { abbr: 'DEN', city: 'Denver', name: 'Summit', conf: 1, div: 0, primary: '#1E40AF', secondary: '#F1F5F9', accent: '#EA580C', offStyle: 'westcoast', defStyle: '34', tier: 0.55 },
  { abbr: 'SLC', city: 'Salt Lake', name: 'Talons', conf: 1, div: 0, primary: '#334155', secondary: '#DC2626', accent: '#F8FAFC', offStyle: 'balanced', defStyle: '34', tier: 0.4 },
  { abbr: 'NSH', city: 'Nashville', name: 'Mavericks', conf: 1, div: 0, primary: '#0C4A6E', secondary: '#FBBF24', accent: '#F8FAFC', offStyle: 'power', defStyle: '43', tier: 0.5 },
  { abbr: 'DAL', city: 'Dallas', name: 'Marshals', conf: 1, div: 1, primary: '#1F2937', secondary: '#9CA3AF', accent: '#2563EB', offStyle: 'vertical', defStyle: '43', tier: 0.7 },
  { abbr: 'HOU', city: 'Houston', name: 'Wildcatters', conf: 1, div: 1, primary: '#78350F', secondary: '#0EA5E9', accent: '#F8FAFC', offStyle: 'airraid', defStyle: 'nickel', tier: 0.5 },
  { abbr: 'SA', city: 'San Antonio', name: 'Rattlers', conf: 1, div: 1, primary: '#365314', secondary: '#D9F99D', accent: '#111827', offStyle: 'power', defStyle: '34', tier: 0.35 },
  { abbr: 'AUS', city: 'Austin', name: 'Outlaws', conf: 1, div: 1, primary: '#C2410C', secondary: '#FFFFFF', accent: '#1F2937', offStyle: 'spread', defStyle: 'nickel', tier: 0.6 },
  { abbr: 'NO', city: 'New Orleans', name: 'Krewe', conf: 1, div: 2, primary: '#581C87', secondary: '#FDE047', accent: '#16A34A', offStyle: 'westcoast', defStyle: '43', tier: 0.55 },
  { abbr: 'PHX', city: 'Phoenix', name: 'Scorpions', conf: 1, div: 2, primary: '#B45309', secondary: '#1C1917', accent: '#FCD34D', offStyle: 'airraid', defStyle: 'nickel', tier: 0.45 },
  { abbr: 'LV', city: 'Las Vegas', name: 'Neon', conf: 1, div: 2, primary: '#111111', secondary: '#E11D8F', accent: '#22D3EE', offStyle: 'vertical', defStyle: '34', tier: 0.6 },
  { abbr: 'SD', city: 'San Diego', name: 'Tritons', conf: 1, div: 2, primary: '#075985', secondary: '#FDE68A', accent: '#F8FAFC', offStyle: 'spread', defStyle: '43', tier: 0.75 },
  { abbr: 'LA', city: 'Los Angeles', name: 'Comets', conf: 1, div: 3, primary: '#1D4ED8', secondary: '#FCD34D', accent: '#FFFFFF', offStyle: 'airraid', defStyle: 'nickel', tier: 0.8 },
  { abbr: 'SF', city: 'San Francisco', name: 'Fog', conf: 1, div: 3, primary: '#475569', secondary: '#F97316', accent: '#E2E8F0', offStyle: 'westcoast', defStyle: '43', tier: 0.7 },
  { abbr: 'POR', city: 'Portland', name: 'Cascades', conf: 1, div: 3, primary: '#14532D', secondary: '#A3E635', accent: '#F8FAFC', offStyle: 'balanced', defStyle: '34', tier: 0.4 },
  { abbr: 'SEA', city: 'Seattle', name: 'Riptide', conf: 1, div: 3, primary: '#0F172A', secondary: '#2DD4BF', accent: '#94A3B8', offStyle: 'vertical', defStyle: 'nickel', tier: 0.65 },
];

export function teamFullName(t) { return `${t.city} ${t.name}`; }
