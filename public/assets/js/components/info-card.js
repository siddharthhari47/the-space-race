class InfoCard extends HTMLElement {
  connectedCallback() {
    const icon = this.getAttribute("icon") || "";
    const title = this.getAttribute("title") || "";
    const href = this.getAttribute("href");
    const status = this.getAttribute("status");
    const description = this.textContent.trim();

    const badge = status === "coming-soon" ? `<span class="info-card-badge">Coming Soon</span>` : "";
    const body = `
      ${icon ? `<div class="info-card-icon" aria-hidden="true">${icon}</div>` : ""}
      <h3>${title}</h3>
      ${description ? `<p>${description}</p>` : ""}
      ${badge}
    `;

    this.innerHTML =
      href && status !== "coming-soon"
        ? `<a class="info-card-inner" href="${href}">${body}</a>`
        : `<div class="info-card-inner" aria-disabled="true">${body}</div>`;
  }
}

customElements.define("info-card", InfoCard);
