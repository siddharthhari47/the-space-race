// The Playground plugin host. Looks itself up in the simulator registry by
// its `type` attribute and lazy-imports that simulator's module — a page
// only downloads the JS for a simulator it actually embeds. Adding a new
// simulator later never touches this file: one new module + one registry
// entry + a <simulation-container type="..."> tag is the whole integration.
class SimulationContainer extends HTMLElement {
  async connectedCallback() {
    const type = this.getAttribute("type");
    const root = this.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>
        :host { all: initial; display: block; font-family: inherit; color: inherit; }
        .sim-panel { box-sizing: border-box; }
        .sim-title { font-family: "Space Grotesk", sans-serif; margin: 0 0 0.4rem; }
        .sim-status { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .sim-panel p { margin: 0.6rem 0 0; font-size: 0.9rem; }
      </style>
      <div part="panel" class="sim-panel">
        <div class="sim-status">Loading…</div>
      </div>
    `;

    this._panel = root.querySelector(".sim-panel");

    if (!type) {
      this._renderError("No simulator type specified.");
      return;
    }

    let registry;
    try {
      ({ SIMULATOR_REGISTRY: registry } = await import("../simulators/registry.js"));
    } catch (error) {
      this._renderError("Could not load the simulator registry.");
      return;
    }

    const meta = registry[type];
    if (!meta) {
      this._renderError(`Unknown simulator: "${type}".`);
      return;
    }

    this.dataset.status = meta.status;

    if (meta.status !== "live") {
      this._renderComingSoon(meta);
      return;
    }

    try {
      const module = await import(meta.module);
      this._panel.innerHTML = "";
      module.mount(this._panel, meta);
      this._mountedModule = module;
    } catch (error) {
      this._renderError(`"${meta.title}" failed to load.`);
    }
  }

  disconnectedCallback() {
    if (this._mountedModule && typeof this._mountedModule.unmount === "function") {
      this._mountedModule.unmount(this._panel);
    }
  }

  _renderComingSoon(meta) {
    this._panel.innerHTML = `
      <div class="sim-status">Interactive widget · Coming soon</div>
      <div class="sim-title">${meta.title}</div>
      ${meta.description ? `<p>${meta.description}</p>` : ""}
    `;
  }

  _renderError(message) {
    this._panel.innerHTML = `<div class="sim-status">${message}</div>`;
  }
}

customElements.define("simulation-container", SimulationContainer);
