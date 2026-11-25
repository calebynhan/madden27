// Team state containers and the default (deterministic) league.
import { RNG } from '../core/rng.js';
import { TEAMS } from './teams.js';
import { generateRoster, buildDepthChart, teamRatings, setNextPlayerId } from './roster.js';

export const DEFAULT_SEED = 2027;

export function makeTeamState(def, players, depth) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const d = depth || buildDepthChart(players);
  return { def, players, depth: d, byId, ratings: teamRatings(players, d) };
}

export function refreshTeamState(ts) {
  ts.byId = new Map(ts.players.map((p) => [p.id, p]));
  ts.ratings = teamRatings(ts.players, ts.depth);
  return ts;
}

let cache = null;
// All 32 teams with generated rosters. Same seed -> same league every session.
export function defaultLeague(seed = DEFAULT_SEED) {
  if (cache && cache.seed === seed) return cache.teams;
  setNextPlayerId(1);
  const rng = new RNG(seed);
  const teams = TEAMS.map((def) => makeTeamState(def, generateRoster(rng, def)));
  cache = { seed, teams };
  return teams;
}

export function serializeTeam(ts) {
  return { abbr: ts.def.abbr, players: ts.players, depth: ts.depth };
}

export function deserializeTeam(obj) {
  const def = TEAMS.find((t) => t.abbr === obj.abbr);
  return makeTeamState(def, obj.players, obj.depth);
}
