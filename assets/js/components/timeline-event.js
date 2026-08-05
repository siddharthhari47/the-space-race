class TimelineEvent extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("side")) {
      this.setAttribute("side", "left");
    }

    const date = this.getAttribute("date") || "";
    const title = this.getAttribute("title") || "";
    const description = this.innerHTML.trim();

    this.innerHTML = `
      <span class="timeline-dot" aria-hidden="true"></span>
      <div class="timeline-card">
        ${date ? `<span class="timeline-date">${date}</span>` : ""}
        <h4>${title}</h4>
        ${description ? `<p>${description}</p>` : ""}
      </div>
    `;
  }
}

customElements.define("timeline-event", TimelineEvent);
