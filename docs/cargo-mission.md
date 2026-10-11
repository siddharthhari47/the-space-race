# Connected cargo mission

Implemented 5 October 2026: `/flight-lab/cargo-mission.html`.

Prediction → manifest and balance → exact mass handoff → ground run → revise and compare whole missions. Fixed fuel/passenger/airport constraints; cargo mass and stations adjustable. No independent runway mass control. Same shared evaluators as standalone loading and runway. Editing invalidates the current attempt immediately, including stopping playback and disabling save. Completed attempts and A/B persist with a mission identity; reset retains A/B, clear removes A/B only. Restore returns the complete manifest. No-motion checkbox complements the system preference.

## Sources and scope

Uses the existing source-read Flight lectures only: 51 p13 for CG/mass distribution; 61 p2 and pp16–19 for ground force balance and phases; 62 pp2–5 and pp14–16 for dependencies and excluded transition/climb; 3 pp4–6,13,16 for atmosphere. All source links remain in References and a new #cargo-mission section explains the composition and assumptions.

The planned additional Aircraft Design readings were deferred because this release introduces no new design-process theory or aircraft specifications. It combines already verified equations with explicit original game objectives. Read new PDFs before extending those explanations. Do not represent this mission as measured aircraft performance or imply that the fixed fuel mass establishes range.

## Verification

- cargo-mission-check: exact loading-to-runway mass continuity, fixed fuel/passenger constraints, stale/obsolete/corrupt attempt rejection; 135 station/mass cases, 9 pass and 126 fail.
- mission-storage-check: round trip, B-only save, corrupted/old progress, stale current attempt, blocked/quota storage fallbacks.
- loading-check, runway-check and playback-check passed. Production build passed with existing large chunk warnings.
- Real browser: prediction; centre cargo at1100 kg passes loading but needs499 m; reducing cargo to100 kg gives1040 kg and438 m requirement (12 m remaining). Save A/B, reload, restore, upstream edit invalidation, pause, immediate result, skip-motion, insufficient payload and reset retaining trials tested.
- Phone viewport390×844 reviewed; page width equals viewport width. Load-label anchoring and wrapped links corrected after screenshots. Flight Lab entry navigation checked. No errors observed on fresh mission tab.
- Storage failure was tested at the storage adapter, not by changing browser security settings. System reduced-motion toggling and real hidden-tab lifecycle remain follow-up browser checks; the explicit skip-motion control and the playback clock have been tested. The in-app browser did not provide evidence of hiding the old page when another tab opened, so that attempt is not counted as hidden-tab validation.

Rollback copies for existing pages: `tools/scratch/cargo-mission-rollback`. Prior user work preserved. Deployment identity recorded in flight-lab-progress.md once verified.


Production: dpl_GaTmJiCprEcuYvNFfqCYDHdqJgAV on5October2026. Public alias checked through successful mission completion and zero console errors.
