class StatCard extends HTMLElement {
  static get observedAttributes() {
    return ["value", "label"];
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    this._render();
  }

  _render() {
    const value = this.getAttribute("value") || "";
    const label = this.getAttribute("label") || "";

    this.innerHTML = `
      <div class="stat-card-inner">
        <span class="stat-card-value">${value}</span>
        <span class="stat-card-label">${label}</span>
      </div>
    `;
  }
}

customElements.define("stat-card", StatCard);
