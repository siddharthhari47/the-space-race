import { SIMULATOR_REGISTRY } from "/assets/js/simulators/registry.js";

// The homepage's "Planned Simulators" stat used to be hand-typed and would
// silently go stale as the registry grew — same trap Playground's
// registry-driven catalogue already avoids. This closes that gap the same
// way: read the count directly from the registry, once, on load. The
// value="11" baked into the HTML is a fallback if this script fails to
// load, not the source of truth.
function init() {
  const stat = document.querySelector('[data-stat="simulator-count"]');
  if (!stat) return;
  stat.setAttribute("value", String(Object.keys(SIMULATOR_REGISTRY).length));
}

init();
