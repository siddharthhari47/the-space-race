// Layout-only wrapper. Children (info-card, mission-card, stat-card, ...) are
// left exactly where the author placed them in the light DOM — this element
// just becomes the CSS grid container around them, so no re-parenting or
// lifecycle disruption of child custom elements is needed.
class FeatureGrid extends HTMLElement {
  connectedCallback() {
    const columns = this.getAttribute("columns");
    if (columns) {
      this.style.setProperty("--fg-columns", columns);
    }
  }
}

customElements.define("feature-grid", FeatureGrid);
