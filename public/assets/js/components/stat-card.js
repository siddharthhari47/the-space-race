class StatCard extends HTMLElement {
  connectedCallback() {
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
