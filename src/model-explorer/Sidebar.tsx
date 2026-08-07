import type { HotspotConfig } from "./types";

interface TourTransport {
  currentStopNumber: number;
  totalStops: number;
  onNext: () => void;
  onPrev: () => void;
  onPause: () => void;
  onExit: () => void;
}

interface SidebarProps {
  hotspot: HotspotConfig | null;
  onClose: () => void;
  tour?: TourTransport | null;
}

// A right-hand slide-in panel, not the 2D expandable-diagram's
// adjacent-floating-callout — world-space hotspots don't have a clean
// "which side is free" concept the way a flat image's percentage
// coordinates do, so a fixed panel sidesteps that problem entirely.
export default function Sidebar({ hotspot, onClose, tour }: SidebarProps) {
  return (
    <aside className={`explorer-sidebar${hotspot ? " is-open" : ""}`} aria-hidden={!hotspot}>
      {hotspot && (
        <>
          <div className="explorer-sidebar-header">
            <div>
              {hotspot.confidence === "estimated" && (
                <span className="explorer-sidebar-badge">Estimated placement</span>
              )}
              <h2>{hotspot.label}</h2>
            </div>
            <button type="button" className="explorer-sidebar-close" onClick={onClose} aria-label="Close panel">
              &times;
            </button>
          </div>

          {tour && (
            <div className="explorer-tour-transport">
              <span className="explorer-tour-count">
                {tour.currentStopNumber} / {tour.totalStops}
              </span>
              <div className="explorer-tour-buttons">
                <button type="button" onClick={tour.onPrev} aria-label="Previous stop">
                  &larr;
                </button>
                <button type="button" onClick={tour.onPause} aria-label="Pause tour">
                  Pause
                </button>
                <button type="button" onClick={tour.onNext} aria-label="Next stop">
                  &rarr;
                </button>
                <button type="button" onClick={tour.onExit} aria-label="Exit tour">
                  Exit
                </button>
              </div>
            </div>
          )}

          <p className="explorer-sidebar-summary">{hotspot.shortDescription}</p>

          <div className="explorer-sidebar-body">
            <section>
              <h3>Purpose</h3>
              <p>{hotspot.content.purpose}</p>
            </section>

            <section>
              <h3>How it works</h3>
              <p>{hotspot.content.howItWorks}</p>
            </section>

            <section>
              <h3>Facts</h3>
              <ul>
                {hotspot.content.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Role in flight</h3>
              <p>{hotspot.content.role}</p>
            </section>

            {hotspot.content.relatedAircraft && (
              <section>
                <h3>Related aircraft</h3>
                <p>{hotspot.content.relatedAircraft}</p>
              </section>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
