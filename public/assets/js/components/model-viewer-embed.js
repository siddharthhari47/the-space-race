// A small, inline 3D viewer for theory pages — the "see it for yourself"
// widget that sits mid-paragraph next to an explanation, as opposed to
// the full dedicated exhibit pages (flight-lab/interactive-aircraft.html,
// interactive-helicopter.html) which mount the same underlying framework
// through a plain #model-explorer-root div instead of this element.
//
// <model-viewer-embed data-model="merlin-mk2-helicopter" data-focus="main-rotor"></model-viewer-embed>
//
// data-model must match a config filename under src/model-explorer/configs/
// (minus .ts). data-focus is optional — a hotspot id to pre-select on load.
// Nothing loads until this element is near the viewport: the ~330KB gzipped
// model-explorer bundle and that model's GLB both stay unfetched on any page
// that doesn't actually scroll to one of these, and a page with several
// embeds only pays for the bundle once (the browser caches the module).
class ModelViewerEmbed extends HTMLElement {
  connectedCallback() {
    this.classList.add("model-viewer-embed");
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
    if (!this.hasAttribute("aria-label")) {
      this.setAttribute(
        "aria-label",
        "Interactive 3D model. Drag to rotate, scroll or pinch to zoom, click a marker to explore a part."
      );
    }
    this.innerHTML = `<div class="model-viewer-embed-placeholder">Loading 3D model&hellip;</div>`;

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this._observer.disconnect();
          this._mount();
        }
      },
      { rootMargin: "400px" }
    );
    this._observer.observe(this);
  }

  disconnectedCallback() {
    this._observer?.disconnect();
  }

  async _mount() {
    const modelKey = this.dataset.model;
    if (!modelKey) {
      this.innerHTML = `<div class="model-viewer-embed-placeholder">Missing data-model attribute.</div>`;
      return;
    }

    try {
      // Named ES exports from this entry aren't reliable (see main.tsx's
      // comment) — importing it still runs its top-level code, which is
      // what actually attaches window.mountModelExplorerEmbedded.
      await import("/assets/js/dist/model-explorer.js");
      if (typeof window.mountModelExplorerEmbedded !== "function") {
        throw new Error("window.mountModelExplorerEmbedded was not attached");
      }
      this.innerHTML = "";
      window.mountModelExplorerEmbedded(this, modelKey, this.dataset.focus || undefined);
    } catch (error) {
      console.error(`model-viewer-embed: failed to load "${modelKey}"`, error);
      this.innerHTML = `<div class="model-viewer-embed-placeholder">This 3D model couldn't be loaded.</div>`;
    }
  }
}

customElements.define("model-viewer-embed", ModelViewerEmbed);
