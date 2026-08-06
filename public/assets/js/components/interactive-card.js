let revealIdCounter = 0;

class InteractiveCard extends HTMLElement {
  connectedCallback() {
    const icon = this.getAttribute("icon") || "";
    const title = this.getAttribute("title") || "";
    const teaser = this.getAttribute("teaser") || "";
    const revealContent = this.innerHTML.trim();
    const revealId = `interactive-card-reveal-${revealIdCounter++}`;

    this.innerHTML = `
      <button class="interactive-card-inner" type="button" aria-expanded="false" aria-controls="${revealId}">
        ${icon ? `<div class="info-card-icon" aria-hidden="true">${icon}</div>` : ""}
        <h3>${title}</h3>
        ${teaser ? `<p>${teaser}</p>` : ""}
        <div class="interactive-card-reveal" id="${revealId}">
          <div>${revealContent}</div>
        </div>
      </button>
    `;

    this.querySelector(".interactive-card-inner").addEventListener("click", (event) => {
      const button = event.currentTarget;
      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }
}

customElements.define("interactive-card", InteractiveCard);
