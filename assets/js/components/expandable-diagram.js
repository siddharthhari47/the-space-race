// Shared clickable-pin diagram engine, reused by any page that needs a
// labeled illustration (Aircraft Explorer, CubeSat exploded view, ...).
// Swapping `src` + `data-src` is the entire "port to a new diagram" step.
class ExpandableDiagram extends HTMLElement {
  connectedCallback() {
    this.load(this.getAttribute("src"), this.getAttribute("data-src"), this.getAttribute("alt"));
  }

  // Public API: swap the diagram after initial mount, e.g. from a category
  // switcher. This is the only "port to a new diagram" step needed —
  // callers never touch this element's internals directly.
  load(src, dataSrc, alt = "") {
    if (src) this.setAttribute("src", src);
    if (dataSrc) this.setAttribute("data-src", dataSrc);

    this.innerHTML = `
      <div class="diagram-stage">
        <img class="diagram-image" src="${src || ""}" alt="${alt || ""}" />
      </div>
      <div class="diagram-panels"></div>
      <dialog class="diagram-dialog">
        <h4></h4>
        <p></p>
        <button type="button" class="dialog-close">Close</button>
      </dialog>
    `;

    this._dialog = this.querySelector(".diagram-dialog");
    this._dialog.querySelector(".dialog-close").addEventListener("click", () => this._dialog.close());

    if (dataSrc) {
      this._loadPins(dataSrc);
    }
  }

  async _loadPins(dataSrc) {
    try {
      const response = await fetch(dataSrc);
      const pins = await response.json();
      this._renderPins(pins);
    } catch (error) {
      // Data failed to load — the diagram still shows the plain image.
    }
  }

  _renderPins(pins) {
    const stage = this.querySelector(".diagram-stage");
    const panelsContainer = this.querySelector(".diagram-panels");

    pins.forEach((pin, index) => {
      const pinId = pin.id || `pin-${index}`;
      const panelId = `${pinId}-panel`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "diagram-pin";
      button.style.left = `${pin.x}%`;
      button.style.top = `${pin.y}%`;
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", panelId);
      button.setAttribute("tabindex", index === 0 ? "0" : "-1");
      button.innerHTML = `<span class="pin-dot"></span><span class="visually-hidden">${pin.label}</span>`;
      stage.appendChild(button);

      const panel = document.createElement("div");
      panel.className = "diagram-panel";
      panel.id = panelId;
      panel.hidden = true;
      panel.innerHTML = `<h4>${pin.label}</h4><p>${pin.description}</p>`;
      panelsContainer.appendChild(panel);

      button.addEventListener("click", () => this._selectPin(button, panel, pin));
    });

    const allPins = Array.from(stage.querySelectorAll(".diagram-pin"));
    stage.addEventListener("keydown", (event) => this._handleKeydown(event, allPins));
  }

  _selectPin(button, panel, pin) {
    const stage = this.querySelector(".diagram-stage");
    const allButtons = Array.from(stage.querySelectorAll(".diagram-pin"));
    const allPanels = Array.from(this.querySelectorAll(".diagram-panel"));

    const wasOpen = button.getAttribute("aria-expanded") === "true";
    allButtons.forEach((b) => b.setAttribute("aria-expanded", "false"));
    allPanels.forEach((p) => (p.hidden = true));

    if (wasOpen) return;

    const isSmallViewport = window.matchMedia("(max-width: 640px)").matches;
    if (isSmallViewport) {
      this._dialog.querySelector("h4").textContent = pin.label;
      this._dialog.querySelector("p").textContent = pin.description;
      this._dialog.showModal();
      button.setAttribute("aria-expanded", "true");
      return;
    }

    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
  }

  _handleKeydown(event, allButtons) {
    const currentIndex = allButtons.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % allButtons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + allButtons.length) % allButtons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = allButtons.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    allButtons.forEach((b, i) => b.setAttribute("tabindex", i === nextIndex ? "0" : "-1"));
    allButtons[nextIndex].focus();
  }
}

customElements.define("expandable-diagram", ExpandableDiagram);
