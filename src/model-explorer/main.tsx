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

mount();
