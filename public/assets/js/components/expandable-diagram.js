// Shared clickable-pin diagram engine, reused by any page that needs a
// labeled illustration (Aircraft Explorer, CubeSat exploded view, ...).
// Swapping `src` + `data-src` is the entire "port to a new diagram" step.
//
// Clicking a pin zooms the diagram toward that point (via transform-origin,
// so the pin's on-screen position never moves) and shows a floating callout
// beside it, flipping side so it stays on-screen. Small viewports fall back
// to a centered native <dialog> instead, since there's no room to zoom and
// place a callout beside it.
const ZOOM_FACTOR = 2.2;

class ExpandableDiagram extends HTMLElement {
  connectedCallback() {
    this.load(this.getAttribute("src"), this.getAttribute("data-src"), this.getAttribute("alt"));
  }

  load(src, dataSrc, alt = "") {
    if (src) this.setAttribute("src", src);
    if (dataSrc) this.setAttribute("data-src", dataSrc);

    this._selectedButton = null;

    this.innerHTML = `
      <div class="diagram-viewport">
        <div class="diagram-stage">
          <img class="diagram-image" src="${src || ""}" alt="${alt || ""}" />
        </div>
      </div>
      <div class="diagram-callout" hidden>
        <button type="button" class="callout-close" aria-label="Close">&times;</button>
        <h4></h4>
        <p></p>
      </div>
      <dialog class="diagram-dialog">
        <h4></h4>
        <p></p>
        <button type="button" class="dialog-close">Close</button>
      </dialog>
    `;

    this._dialog = this.querySelector(".diagram-dialog");
    this._dialog.querySelector(".dialog-close").addEventListener("click", () => this._dialog.close());
    this.querySelector(".callout-close").addEventListener("click", () => this._resetZoom());
    this.querySelector(".diagram-viewport").addEventListener("click", (event) => {
      if (!event.target.closest(".diagram-pin")) this._resetZoom();
    });
    this.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this._resetZoom();
    });

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

    pins.forEach((pin, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "diagram-pin";
      button.style.left = `${pin.x}%`;
      button.style.top = `${pin.y}%`;
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("tabindex", index === 0 ? "0" : "-1");
      button.innerHTML = `<span class="pin-dot"></span><span class="visually-hidden">${pin.label}</span>`;
      button.addEventListener("click", () => this._selectPin(pin, button));
      stage.appendChild(button);
    });

    const allPins = Array.from(stage.querySelectorAll(".diagram-pin"));
    stage.addEventListener("keydown", (event) => this._handleKeydown(event, allPins));
  }

  _selectPin(pin, button) {
    const allButtons = Array.from(this.querySelectorAll(".diagram-pin"));
    const isSameSelected = this._selectedButton === button;
    allButtons.forEach((b) => b.setAttribute("aria-expanded", "false"));

    if (isSameSelected) {
      this._resetZoom();
      return;
    }

    this._selectedButton = button;
    button.setAttribute("aria-expanded", "true");

    const isSmallViewport = window.matchMedia("(max-width: 640px)").matches;
    if (isSmallViewport) {
      this._dialog.querySelector("h4").textContent = pin.label;
      this._dialog.querySelector("p").textContent = pin.description;
      this._dialog.showModal();
      return;
    }

    this._zoomToPin(pin);
  }

  _zoomToPin(pin) {
    const stage = this.querySelector(".diagram-stage");
    stage.style.transformOrigin = `${pin.x}% ${pin.y}%`;
    stage.style.transform = `scale(${ZOOM_FACTOR})`;

    const callout = this.querySelector(".diagram-callout");
    callout.hidden = false;
    callout.style.left = `${pin.x}%`;
    callout.style.top = `${pin.y}%`;
    callout.classList.toggle("side-left", pin.x > 55);
    callout.classList.toggle("side-right", pin.x <= 55);
    callout.querySelector("h4").textContent = pin.label;
    callout.querySelector("p").textContent = pin.description;
  }

  _resetZoom() {
    const stage = this.querySelector(".diagram-stage");
    stage.style.transform = "scale(1)";

    const callout = this.querySelector(".diagram-callout");
    callout.hidden = true;

    if (this._selectedButton) {
      this._selectedButton.setAttribute("aria-expanded", "false");
      this._selectedButton = null;
    }
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
