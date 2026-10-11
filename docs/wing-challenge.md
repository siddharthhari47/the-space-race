# Wing challenge — local release

Implemented in `public/flight-lab/aerodynamics.html`, using the existing wind-tunnel scene and Stage engine. Only the wing release is included; loading and runway challenges remain future work.

## Data and source record

- NASA TMR validation page: https://tmbwg.github.io/turbmodels/naca0012_val.html
- Numerical extract: https://tmbwg.github.io/turbmodels/NACA0012_validation/CLCD_Ladson_expdata.dat
- Report: C. L. Ladson, NASA TM 4074, 1988, https://ntrs.nasa.gov/citations/19880019495
- Retrieved 2026-09-27. The original extract is retained at `public/assets/data/ladson-force.dat`. JSON imports exactly the 17 rows between `zone, t="80 grit"` and the following zone header, retaining source order and all published digits.
- Fixed NACA 0012 section, Reynolds number 6 million, Mach 0.15, transition tripped with 80-grit roughness. No trip position is invented: the extract does not specify one. No mixing with 120/180-grit series or the modified CFD geometry discussed on TMR.
- Runtime SHA-256 verification of canonical JSON fails closed if samples or metadata change. Formatting and line-ending changes are permitted. Any legitimate dataset revision requires deliberate source verification, identity/hash update and test review.
- The positive sampled maximum is 1.6116 at 17.13°. Target lift is 1.12812. Minimum rising-branch drag satisfying it is 0.012233104294478526, at 10.712987730061347°. The 110% drag objective is 0.01345641472392638. All intermediate results use piecewise linear interpolation in angle; no extrapolation.
- NPTEL Flight Lecture 22 PDF: https://drive.google.com/file/d/1z1mRneEzi-910_aA8nTwv3JV65ra6CYs/view . Read PDF p. 13 (airfoil cross-section normal to span), and p. 16 (families).
- NPTEL Flight Lecture 15 PDF: https://drive.google.com/file/d/11zE-ByXsCHmQdNuihVZmpR3Q6MwQiXNR/view . Read PDF pp. 2–11 (adverse pressure gradients, near-wall momentum loss and separation) and p. 16 (turbulent boundary layer / delayed separation). File names use course lecture numbers; slide footers differ. Page counts include title pages. Local source PDFs are ignored and are not redistributed.
- User-facing sources, conditions, game thresholds and model limits are at `references/index.html#wing-challenge`.

## Behaviour

Prediction → rising-branch lift target → lift plus drag objective. Dragging vertically and the native angle slider share one angle update. One evaluation drives the scene, coefficient arrows, plot marker, numbers and feedback. The airflow and wake are illustrative, with drag arrows enlarged four times.

Free exploration preserves the adjustable finite-wing theory. The model identity appears beside the readouts and saved curve legend; section measurements never produce whole-aircraft force readouts. Thickness changes geometry only. A/B trials save model/dataset identity and inputs; values and curves are re-evaluated through the matching model. Unknown dataset versions and invalid trials are ignored. Storage failure retains trials in memory for the visit. Reset clears the current experiment but preserves trials; Clear A/B removes individual trials.

Both plots overlay saved curves/markers, with line patterns and labels as well as colour. A checkbox provides an explicitly clipped 0–0.03 drag scale; full range is the default. Text summaries and the comparison table are the plot alternatives.

## Validation, 2026-09-27

- `node tools/wing-challenge-check.mjs`: all imported values versus source zone; metadata and integrity rejection; exact samples, intermediate interpolation, both range ends and out-of-range rejection; positive peak; thresholds; achievable slider values for both stages; all failure verdicts; storage/reload/clear, invalid persisted values and memory fallback.
- `node tools/wing-motion-check.mjs`: actual Stage and drawing code with reduced-motion environment; no animation frames; current wing angle and plots redraw when requested.
- `npm run build`: passes. Existing large-bundle warnings for model explorer and Apollo remain.
- Browser: prediction, stage 1 at 15°, excessive stage-2 drag at 15°, both targets at 11°, beyond peak at End, insufficient lift at Home, ArrowRight fine adjustment, A/B save and reload, mixed measured/theoretical comparison, free model presets/controls and reset, measured force-readout hiding.
- Browser phone viewport 390 × 844: scene drag changes angle; angle slider, stage transition and drag zoom work; no document-wide horizontal overflow. Comparison table scrolls within its container. This is browser pointer testing at phone dimensions, not a physical touchscreen test.
- Separate local test server deliberately supplied invalid data: measured challenge disabled, explicit failure notice shown, and free mode identified as theoretical. Test server stopped afterward; normal preview retained on port 5500.
- Local browser console: no errors observed on the challenge route.

Local preview: http://127.0.0.1:5500/flight-lab/aerodynamics.html#tunnel . Production deployment is separate; this document does not claim a Vercel release.

## Production release — 2026-09-28

Deployed through Vercel with explicit `--scope spacerace` after the default-scope attempt was rejected. Deployment `dpl_FfU73KrToLwcFJewv7tPKo53agXd`, alias https://the-space-race-nu.vercel.app . Live browser verified excessive drag at 15 degrees and both targets at 11 degrees; no browser errors observed.
