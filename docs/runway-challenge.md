# You have one runway

Local release built 2026-10-02, after publishing Loading & Balance. Route: `/flight-lab/runway.html`. Published 3 October 2026; see deployment checkpoint.

Prediction, challenge/free modes, keyboard/touch sliders, 5x ground-run playback, immediate result, persistent A/B trials, shared distance-scale replay and speed/distance plots. Reduced-motion preference skips playback to the final state. No 3D asset needed.

## Evidence and model

Read supplied NPTEL Flight PDFs: Lecture 61 p2 force balance and ground-run integral, pp16–19 lift-off/phases; Lecture 62 pp2–5 density/acceleration dependence, pp14–16 transition/climb; Lecture 3 pp4–6 pressure/density altitude, p13 lapse rate, p16 gas law/gradient-layer pressure. Source links and all assumptions are in References #runway-challenge. PDFs retained only in ignored .firecrawl, not published.

With fixed ground CL/CD and thrust, define A=T−μmg, B=ρS(CD−μCL)/2. The exact ground solution is v=√(A/B)tanh(√(AB)t/m), x=(m/B)ln(cosh(√(AB)t/m)). Positive B is guaranteed by fixed model constants. A≤0 cannot start. A≤B·Vlift² cannot reach lift-off even with extra runway. Otherwise required distance is −m/(2B)ln(1−B·Vlift²/A). No extrapolation from empirical aircraft data: all aircraft coefficients are fictional assumptions.

Lift-off target 1.20Vs with CLmax1.60 assumes instantaneous rotation at the target, from ground CL0.60 to CLmax/1.20². Ground normal force remains positive throughout the modelled run. Upward icon motion is a result cue, not an integrated climb. No obstacle clearance, rotation dynamics, braking or real take-off distance claim.

## Checks

`node tools/runway-check.mjs`: independent small-step integration agrees within 0.02 m and 0.002 s; mass/temperature/altitude trends; exact threshold; finite impossible cases; invalid input rejection. `node tools/loading-check.mjs` regression passes. Production build passes with existing chunk-size warnings.

Browser checks: initial 1100kg/1500m/35°C/450m case exhausts runway (499m required); 900kg case completes challenge (314m required). Keyboard Home/ArrowRight controls work. A/B persist after reload and replay together on the same scale. Zero thrust produces an immediate inability outcome. Phone 390×844 reviewed. No browser console errors observed.


Playback release: dpl_FXqSECdWgPWSop9b7MqR3qwXrLQR. Original SVG, pause/resume, time seeking, visible 5x rate, comparison endpoints. Playback checks and live controls verified. See flight-lab-progress.md for coverage limits.
