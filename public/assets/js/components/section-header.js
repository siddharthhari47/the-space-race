class SectionHeader extends HTMLElement {
  connectedCallback() {
    const eyebrow = this.getAttribute("eyebrow");
    const title = this.getAttribute("title") || "";
    const linkHref = this.getAttribute("link-href");
    const linkText = this.getAttribute("link-text") || "View all →";

    this.innerHTML = `
      <div class="section-heading">
        <div>
          ${eyebrow ? `<span class="eyebrow-label">${eyebrow}</span>` : ""}
          <h2>${title}</h2>
        </div>
        ${linkHref ? `<a href="${linkHref}">${linkText}</a>` : ""}
      </div>
    `;
  }
}

customElements.define("section-header", SectionHeader);
