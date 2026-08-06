class MissionCard extends HTMLElement {
  connectedCallback() {
    const image = this.getAttribute("image");
    const alt = this.getAttribute("alt") || this.getAttribute("title") || "";
    const eyebrow = this.getAttribute("eyebrow") || "";
    const title = this.getAttribute("title") || "";
    const href = this.getAttribute("href") || "#";
    const excerpt = this.innerHTML.trim();

    this.innerHTML = `
      <a class="card-link" href="${href}">
        ${image ? `<div class="thumb"><img src="${image}" alt="${alt}" /></div>` : ""}
        <div class="card-body">
          ${eyebrow ? `<div class="meta">${eyebrow}</div>` : ""}
          <h3>${title}</h3>
          ${excerpt ? `<p class="excerpt">${excerpt}</p>` : ""}
        </div>
      </a>
    `;
  }
}

customElements.define("mission-card", MissionCard);
