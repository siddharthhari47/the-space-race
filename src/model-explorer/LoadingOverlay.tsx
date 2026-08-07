import { useProgress } from "@react-three/drei";

// useProgress subscribes to drei's shared loading manager rather than
// suspending itself, so it can render live progress from a sibling outside
// the <Suspense> boundary. This is new territory for the site — the only
// existing precedent (simulation-container.js) shows static "Loading…"
// text with no percentage — so this is styled with the same design tokens
// (--surface/--border/--text-dim/--accent) to avoid looking bolted-on.
export default function LoadingOverlay() {
  const { progress, active } = useProgress();

  if (!active && progress >= 100) return null;

  return (
    <div className="explorer-loading" role="status" aria-live="polite">
      <div className="explorer-loading-bar-track">
        <div className="explorer-loading-bar-fill" style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <span className="explorer-loading-label">Loading model — {Math.round(progress)}%</span>
    </div>
  );
}
