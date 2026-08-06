const DEFAULT_LABELS = {
  "did-you-know": "Did You Know?",
  "engineering-insight": "Engineering Insight",
};

class Callout extends HTMLElement {
  connectedCallback() {
    const type = this.getAttribute("type") || "did-you-know";
    const label = this.getAttribute("label") || DEFAULT_LABELS[type] || "Note";
    const body = this.innerHTML.trim();

    this.classList.add("callout", type);
    this.innerHTML = `
      <span class="callout-label">${label}</span>
      ${body}
    `;
  }
}

customElements.define("callout-box", Callout);
