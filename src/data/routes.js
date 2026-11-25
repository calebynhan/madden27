// Route library. Each route is a list of waypoints [depth, inside] measured in
// yards from the receiver's alignment: depth is downfield, inside is toward the
// middle of the field (mirrored automatically for receivers on either side).
// Options: sit -> receiver settles at the final point and works back to the QB.
//          pause -> seconds to hesitate at a waypoint index (double moves).
//          delay -> seconds before releasing (chips, leaks, screens).
export const ROUTES = {
  go: { name: 'Streak', pts: [[16, -0.5], [60, -1.5]], depthClass: 'deep' },
  fade: { name: 'Fade', pts: [[8, -1.4], [55, -5]], depthClass: 'deep' },
  seam: { name: 'Seam', pts: [[6, 0.4], [60, 1.2]], depthClass: 'deep' },
  slant: { name: 'Slant', pts: [[1.6, 0], [5.6, 4.2], [30, 24]], depthClass: 'short' },
  quick_out: { name: 'Quick Out', pts: [[5, 0], [5, -30]], depthClass: 'short' },
  out: { name: 'Out', pts: [[10, 0], [9.6, -30]], depthClass: 'medium' },
  in: { name: 'In', pts: [[6, 0], [6, 35]], depthClass: 'short' },
  dig: { name: 'Dig', pts: [[12, 0], [12, 35]], depthClass: 'medium' },
  curl: { name: 'Curl', pts: [[12, 0], [10.2, 1.4]], sit: true, depthClass: 'medium' },
  hitch: { name: 'Hitch', pts: [[5.5, 0], [4.6, 0.3]], sit: true, depthClass: 'short' },
  comeback: { name: 'Comeback', pts: [[15, 0], [12.8, -2.8]], sit: true, depthClass: 'medium' },
  post: { name: 'Post', pts: [[12, 0], [32, 13], [60, 22]], depthClass: 'deep' },
  skinny_post: { name: 'Skinny Post', pts: [[10, 0], [45, 8]], depthClass: 'deep' },
  corner: { name: 'Corner', pts: [[11, 0], [24, -11], [40, -17]], depthClass: 'deep' },
  flag: { name: 'Flag', pts: [[6, 0], [18, -10], [34, -16]], depthClass: 'medium' },
  flat: { name: 'Flat', pts: [[1.2, -2.2], [3, -7], [3.6, -24]], depthClass: 'short' },
  drag: { name: 'Drag', pts: [[1.5, 0.6], [3, 6], [4.5, 40]], depthClass: 'short' },
  shallow: { name: 'Shallow Cross', pts: [[2, 1], [5, 7], [6, 40]], depthClass: 'short' },
  cross: { name: 'Deep Cross', pts: [[9, 0], [14, 9], [17, 45]], depthClass: 'medium' },
  over: { name: 'Over', pts: [[10, 0], [16, 10], [22, 40]], depthClass: 'deep' },
  wheel: { name: 'Wheel', pts: [[0.8, -5], [4, -8], [45, -9.5]], depthClass: 'deep' },
  swing: { name: 'Swing', pts: [[-1, -3], [0, -7], [1.5, -16]], depthClass: 'short' },
  angle: { name: 'Angle', pts: [[1.5, -3.2], [4.2, 0.8], [6.5, 6]], sit: true, depthClass: 'short' },
  texas: { name: 'Texas', pts: [[2, -3.5], [5.5, 2.5], [7, 12]], depthClass: 'short' },
  whip: { name: 'Whip', pts: [[3, 3], [3.4, -10]], depthClass: 'short' },
  arrow: { name: 'Arrow', pts: [[2.5, -3.5], [5, -10], [6, -18]], depthClass: 'short' },
  stick: { name: 'Stick', pts: [[6, 0], [6, 0.6]], sit: true, depthClass: 'short' },
  snag: { name: 'Snag', pts: [[6, 2.6]], sit: true, depthClass: 'short' },
  sit: { name: 'Sit', pts: [[5, 0]], sit: true, depthClass: 'short' },
  bubble: { name: 'Bubble', pts: [[-1.4, -2], [-1, -6], [0, -9]], depthClass: 'screen' },
  wr_screen: { name: 'WR Screen', pts: [[-1.2, 1.6]], sit: true, depthClass: 'screen' },
  rb_screen: { name: 'RB Screen', pts: [[-1, -2], [-2.2, -5]], sit: true, delay: 0.9, depthClass: 'screen' },
  te_screen: { name: 'TE Screen', pts: [[0, 2], [-1, 4]], sit: true, delay: 1.0, depthClass: 'screen' },
  sluggo: { name: 'Slant & Go', pts: [[3, 0], [5, 2.2], [45, -2]], pause: { 1: 0.12 }, depthClass: 'deep' },
  out_up: { name: 'Out & Up', pts: [[5, 0], [5.5, -2.5], [45, -4]], pause: { 1: 0.15 }, depthClass: 'deep' },
  hitch_go: { name: 'Hitch & Go', pts: [[5, 0], [4.6, 0], [45, -1]], pause: { 1: 0.2 }, depthClass: 'deep' },
  post_corner: { name: 'Post Corner', pts: [[10, 0], [14, 4], [30, -9]], depthClass: 'deep' },
  leak: { name: 'Leak', pts: [[1.5, 4], [8, 12], [14, 32]], delay: 0.9, depthClass: 'medium' },
  chip_flat: { name: 'Chip Flat', pts: [[1.5, -3], [3, -7], [3.5, -20]], delay: 0.8, depthClass: 'short' },
  block: { name: 'Pass Block', block: true },
  run_block: { name: 'Run Block', runBlock: true },
};

// Routes offered in the hot-route menu (order = key index).
export const HOT_ROUTES = ['go', 'slant', 'curl', 'out', 'in', 'drag', 'fade', 'flat', 'block'];

export function routeName(r) {
  const key = typeof r === 'string' ? r : r?.r;
  return ROUTES[key]?.name ?? key ?? '';
}
