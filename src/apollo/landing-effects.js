// Visual envelopes, in mission time. These are authored presentation curves,
// not reconstructed engine telemetry. Scrubbing backwards reproduces them.
import { at, getSecondsAt } from "./flight.js";
import { smootherstep } from "./mission.js";

export function landingEffectsAt(seconds) {
  const ignition = getSecondsAt(at("poweredDescent"));
  const contact = getSecondsAt(at("touchdown"));
  const burn = smootherstep(ignition, ignition + 3, seconds)
    * (1 - smootherstep(contact - 2, contact, seconds));
  return {
    // Faint in vacuum. The final ramp closes within the page's clock,
    // which stops at contact, rather than leaving an eternal engine burn.
    throttle: burn * (0.72 - 0.27 * smootherstep(ignition + 400, contact, seconds)),
    dust: smootherstep(contact - 60, contact - 12, seconds)
      * (1 - smootherstep(contact - 3, contact, seconds)),
    phase: Math.max(0, seconds - ignition),
  };
}
