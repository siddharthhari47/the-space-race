// The one script tag every page needs:
// <script type="module" src="/assets/js/components/index.js"></script>
// Adding a new component later is one new file + one import line here.
import "./site-header.js";
import "./site-footer.js";
import "./section-header.js";
import "./feature-grid.js";
import "./info-card.js";
import "./interactive-card.js";
import "./mission-card.js";
import "./stat-card.js";
import "./callout-box.js";
import "./timeline-event.js";
import "./expandable-diagram.js";
import "./simulation-container.js";
import "./model-viewer-embed.js";

// Not a component: page behaviour that depends on all of the above having
// upgraded, so it is imported last.
import "./hash-landing.js";
