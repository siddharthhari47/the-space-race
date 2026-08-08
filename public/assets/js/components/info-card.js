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

    // External links (an absolute http(s) URL, as opposed to this site's own
    // root- or relative-path hrefs) open in a new tab so following a source
    // out to NASA/ESA/a manufacturer doesn't navigate the visitor away from
    // the page they were reading.
    const isExternal = /^https?:\/\//.test(href || "");
    const linkAttrs = isExternal ? ` target="_blank" rel="noopener noreferrer"` : "";

    this.innerHTML =
      href && status !== "coming-soon"
        ? `<a class="info-card-inner" href="${href}"${linkAttrs}>${body}</a>`
        : `<div class="info-card-inner" aria-disabled="true">${body}</div>`;
  }
}

customElements.define("info-card", InfoCard);
