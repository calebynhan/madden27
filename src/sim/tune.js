// Central gameplay tuning constants (adjusted with the headless tuning lab).
export const TUNE = {
  runFireOut: 0.12,      // initial run-block advantage for the offensive line
  shedRecover: 0.12,     // seconds after a shed before a defender can tackle
  lbFillDepth: 3.0,      // how far off the line linebackers fill on runs
  tackleBase: 0.91,      // base tackle success probability
  nearShed: 0.45,         // extra shed rate when the runner is within 2 yards
  pastShed: 1.2,         // extra shed rate once the ball is past the defender
  passShedBase: 0.015,   // base shed rate per second
  passShedK: 0.45,        // shed rate scaling with losing block score
  zoneBlend: 0.6,        // underneath zones: weight of the receiver-relative spot vs the landmark
  manDelayK: 1.0,        // multiplier on man-coverage reaction lag
  zoneLagK: 1.0,         // multiplier on zone defenders' read lag
  deepRunReact: 0.25,    // extra run-read delay for deep-zone safeties
  deepRunHold: 0.4,      // how long deep safeties stay home before the runner crosses the line
  alleyFitDepth: 5.5,    // run fit depth for two-deep safeties after reading run
  postFitDepth: 8.0,     // run fit depth for the middle-of-field safety
  dropSpeed: 0.52,       // QB dropback speed (fraction of top speed)
  setHitch: 0.15,        // plant-and-reset time at the top of the drop before the first read
  quickRead: 0.6,        // earliest first read on quick-game (1-step / catch-and-throw) drops
  deepSigma: 0.07,      // extra pass scatter per yard beyond 20 yards
  catchBase: 0.62,       // base catch probability before hands rating, contest and placement
};
