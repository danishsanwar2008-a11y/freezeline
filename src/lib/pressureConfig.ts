// The one pressure config file. Every constant of the simplified pressure model lives here
// (base pressure per area lives in the zones table). These are calibrated assumptions for a demo,
// not Houston's pipe network. In a real deployment the utility's own pressure sensors replace the
// model's pressure readings; the same calculation then decides how many homes to stop.

/** Below this, Texas requires a boil-water notice. */
export const BOIL_WATER_PSI = 20;
/** Safety margin above the boil-water line. */
export const SAFETY_MARGIN_PSI = 5;
/** The planner stops adding drips here, and a Stage 2 alert is proposed when the forecast falls below it. */
export const STOP_NEW_DRIPS_PSI = BOIL_WATER_PSI + SAFETY_MARGIN_PSI; // 25

/** Extra system demand (heating, leaks, plant strain) at full freeze exposure, in psi. */
export const FREEZE_DEMAND_PSI = 10;
/** Pressure lost if every home in an area drips one tap, in psi. */
export const PSI_PER_TAP_SHARE = 15;
/** The blanket "everyone drips" message: households typically leave about two taps running. */
export const BLANKET_TAPS_PER_HOME = 2;

/** Reserve above 20 psi the planner keeps (D1: stop new drips at 25 psi). The agent may raise it up to the max. */
export const RESERVE_PSI = SAFETY_MARGIN_PSI;
export const MAX_RESERVE_PSI = 10;

/**
 * Assumption (simulated): some homes drip more than told. This share of homes told to drip one tap
 * actually run a second one (picked deterministically per home). Phase 4 replaces it with real text replies.
 */
export const EXTRA_TAP_SHARE = 0.3;
export const EXTRA_TAP_LABEL = "Assumption: some homes drip more than told (simulated; replaced by real text replies in Phase 4).";

/** Tooltip for the "simplified model" label on the pressure monitor. */
export const MODEL_NOTE =
  "Simplified model: base pressure per area minus freeze demand minus drip flow. Constants are calibrated assumptions, not Houston’s pipe network. " +
  "In a real deployment this panel reads the utility’s own pressure sensors; the same calculation decides how many homes to stop.";
