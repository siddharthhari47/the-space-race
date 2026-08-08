import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ExplorerShell from "./ExplorerShell";
import type { ModelExplorerConfig } from "./types";

// Every config module gets bundled into this one entry (they're pure
// metadata — a handful of KB each even at several future models), keyed
// by filename. Adding a new model to the framework is exactly: a new GLB
// in public/models/, a new file here, and a `data-model="<name>"`
// attribute on a mount page — this file never changes.
const configModules = import.meta.glob<{ default: ModelExplorerConfig }>("./configs/*.ts", {
  eager: true,
});

function resolveConfig(key: string): ModelExplorerConfig | undefined {
  return configModules[`./configs/${key}.ts`]?.default;
}

function mount() {
  const container = document.getElementById("model-explorer-root");
  if (!container) return;

  const modelKey = container.dataset.model;
  if (!modelKey) {
    console.error("model-explorer-root is missing a data-model attribute");
    return;
  }

  const config = resolveConfig(modelKey);
  if (!config) {
    console.error(`No model-explorer config found for "${modelKey}"`);
    return;
  }

  createRoot(container).render(
    <StrictMode>
      <ExplorerShell config={config} />
    </StrictMode>
  );
}

// Used by model-viewer-embed.js: a theory page can have several small
// embedded viewers (one per part being discussed), each mounted lazily by
// that custom element once it nears the viewport — this function is the
// mount() equivalent for one of those, taking the target element directly
// rather than looking it up by a fixed id, since there can be more than
// one on a page.
//
// Attached to `window` rather than used as an ES module export: Vite's
// regular (non-lib) build mode doesn't guarantee named exports survive on
// an entry chunk for external consumption (confirmed live — the built
// bundle's export list was empty even though this function is exported
// here). Every other bridge between the static site and this React island
// already goes through the DOM (a mount div's data-* attributes), not
// module imports, so a window global is consistent with that pattern
// rather than a workaround bolted on.
function mountEmbedded(container: HTMLElement, modelKey: string, focusHotspotId?: string) {
  const config = resolveConfig(modelKey);
  if (!config) {
    console.error(`No model-explorer config found for "${modelKey}"`);
    return;
  }

  createRoot(container).render(
    <StrictMode>
      <ExplorerShell config={config} mode="embedded" focusHotspotId={focusHotspotId} />
    </StrictMode>
  );
}

declare global {
  interface Window {
    mountModelExplorerEmbedded: typeof mountEmbedded;
  }
}
window.mountModelExplorerEmbedded = mountEmbedded;

mount();
