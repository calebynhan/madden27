// Central gameplay tuning constants (adjusted with the headless tuning lab).
export const TUNE = {
  runFireOut: 0.18,      // initial run-block advantage for the offensive line
  shedRecover: 0.12,     // seconds after a shed before a defender can tackle
  lbFillDepth: 3.0,      // how far off the line linebackers fill on runs
  tackleBase: 0.86,      // base tackle success probability
  nearShed: 0.3,         // extra shed rate when the runner is within 2 yards
  pastShed: 0.8,         // extra shed rate once the ball is past the defender
  passShedBase: 0.01,   // base shed rate per second
  passShedK: 0.55,       // shed rate scaling with losing block score
};
