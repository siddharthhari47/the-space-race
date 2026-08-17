// Instruments — the control and readout vocabulary shared by every
// experience on the site.
//
// The point of these being custom elements rather than markup copied into
// each page is consistency of *behaviour*, not just looks. A slider here is
// always keyboard-operable, always announces its value, always emits the
// same event, and always formats numbers with a fixed decimal count so the
// readout doesn't jitter in width as digits change. Getting that right once
// is the difference between a site full of instruments and a site full of
// range inputs.
//
//   <lab-control name="thrust" label="Thrust" unit="kN"
//                min="200" max="1200" value="760" step="10"></lab-control>
//
//   <lab-readout label="Altitude" unit="km" value="0" decimals="1"></lab-readout>
//
// Controls emit a bubbling `lab-input` event: { name, value }.

function fmt(value, decimals) {
  return Number(value).toFixed(decimals);
}

// How many decimals a step implies. step=0.05 -> 2, step=10 -> 0.
function decimalsForStep(step) {
  if (!isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

class LabControl extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.name = this.getAttribute("name") || "value";
    this.min = parseFloat(this.getAttribute("min") ?? "0");
    this.max = parseFloat(this.getAttribute("max") ?? "100");
    this.step = parseFloat(this.getAttribute("step") ?? "1");
    this._value = parseFloat(this.getAttribute("value") ?? String(this.min));
    this.decimals = this.hasAttribute("decimals")
      ? parseInt(this.getAttribute("decimals"), 10)
      : decimalsForStep(this.step);

    const label = this.getAttribute("label") || this.name;
    const unit = this.getAttribute("unit") || "";
    const id = `lc-${Math.random().toString(36).slice(2, 8)}`;

    this.innerHTML = `
      <div class="lab-control-head">
        <label class="lab-control-label" for="${id}">${label}</label>
        <span class="lab-control-value">
          <span class="lab-control-number" data-number>${fmt(this._value, this.decimals)}</span>
          ${unit ? `<span class="lab-control-unit">${unit}</span>` : ""}
        </span>
      </div>
      <input class="lab-control-slider" type="range" id="${id}"
             min="${this.min}" max="${this.max}" step="${this.step}"
             value="${this._value}" />
      <div class="lab-control-scale" aria-hidden="true">
        <span>${fmt(this.min, this.decimals)}</span>
        <span>${fmt(this.max, this.decimals)}</span>
      </div>
    `;

    this._input = this.querySelector("input");
    this._number = this.querySelector("[data-number]");

    this._input.addEventListener("input", () => {
      this._value = parseFloat(this._input.value);
      this._number.textContent = fmt(this._value, this.decimals);
      this._paint();
      this.dispatchEvent(
        new CustomEvent("lab-input", {
          bubbles: true,
          detail: { name: this.name, value: this._value },
        })
      );
    });

    this._paint();
  }

  // Fill the track up to the thumb. Done with a CSS custom property rather
  // than a background gradient string so the browser can composite it.
  _paint() {
    const t = (this._value - this.min) / (this.max - this.min || 1);
    this.style.setProperty("--fill", `${(t * 100).toFixed(2)}%`);
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = v;
    if (this._input) {
      this._input.value = String(v);
      this._number.textContent = fmt(v, this.decimals);
      this._paint();
    }
  }

  setDisabled(disabled) {
    if (this._input) this._input.disabled = disabled;
    this.toggleAttribute("data-disabled", disabled);
  }
}

class LabReadout extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;

    this.decimals = parseInt(this.getAttribute("decimals") ?? "0", 10);
    const label = this.getAttribute("label") || "";
    const unit = this.getAttribute("unit") || "";
    const value = parseFloat(this.getAttribute("value") ?? "0");

    this.innerHTML = `
      <span class="lab-readout-label">${label}</span>
      <span class="lab-readout-value">
        <span data-number>${fmt(value, this.decimals)}</span>
        ${unit ? `<span class="lab-readout-unit">${unit}</span>` : ""}
      </span>
    `;
    this._number = this.querySelector("[data-number]");
  }

  set value(v) {
    if (!this._number) return;
    const text = typeof v === "string" ? v : fmt(v, this.decimals);
    // Skip the DOM write when nothing changed. These get set every frame at
    // 60fps by the simulations; the guard removes most of that layout churn.
    if (this._number.textContent !== text) this._number.textContent = text;
  }

  // Tint the readout when a value crosses into a state worth noticing —
  // stalled, out of fuel, in orbit. Kept as an explicit call so the meaning
  // lives with the simulation's own logic rather than in a magic threshold.
  setState(state) {
    if (state) this.setAttribute("data-state", state);
    else this.removeAttribute("data-state");
  }
}

customElements.define("lab-control", LabControl);
customElements.define("lab-readout", LabReadout);
