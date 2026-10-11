# Next expansion: Make it fly

## Direction

Turn Flight Lab into a connected set of short engineering challenges. The visitor makes a prediction, changes something visible, runs the experiment, sees the consequence, and gets a concise explanation in Sid's voice. Keep free exploration available beside the challenge. Build on the existing wind tunnel, flight envelope, aircraft models and NPTEL material rather than adding another disconnected catalogue.

Primary sources: the user's NPTEL Flight (101101079) and Aircraft Design (101101083) lecture collections. Read the relevant lecture and record slide/page numbers before implementing its equations or explanations. Folder listings alone are not evidence for a technical claim. Course titles and lecture names below were verified in the supplied folders. External sources must be primary sources, paraphrased in the site's voice, with a claim-to-source entry on References. No invented personal anecdotes or unsupported aircraft-specific numbers.

## Release 1 — The wing that refuses to fly (deployed 2026-09-28)

Hook: “It looks like a wing. That is apparently not enough.”

- Start with the existing wind tunnel, not a new simulation engine.
- Visitor predicts whether more angle will always mean more lift, then drags the wing through angle of attack and sees a force arrow, lift trace and flow visualization respond together.
- Implemented challenge: reach 70% of the Ladson NACA 0012 80-grit series positive lift peak on the rising branch, then keep lift while reducing drag to the derived game limit. Section coefficients remain separate from free theoretical finite-wing results. See wing-challenge.md for verification.
- Save two trial configurations locally and compare them on the same plot. Avoid an unexplained score: success is tied to explicit constraints.
- Sources to read: Flight lectures 9–15 (flow, Bernoulli, Reynolds number, boundary layer), 22–23 (aerofoils). These establish concepts; obtain a traceable experimental airfoil polar for quantitative stall behaviour. Clearly label any illustrative flow animation and Reynolds-number limits.
- Resource needed: no new 3D model. Prefer a sourced polar table with airfoil name, Reynolds number, Mach number and provenance. If one is not supplied, locate a public primary experimental dataset.
- Done when: the model can pass and fail the challenge, reset and comparison work, the stall depiction agrees with the stated data, and controls are usable by keyboard and touch without hover.

## Release 2 — Please stop moving the luggage (deployed 2026-10-02)

Hook: “Same aircraft. Same weight. Very different afternoon.”

Local implementation: `flight-lab/loading-and-balance.html`. Fictional aircraft and declared game limits; NPTEL Flight Lectures 51 and 52 read and page-cited. Mass-moment calculation, station dragging/menus/keyboard, free masses, initial static pitching-moment illustration, A/B persistence, and unit/browser checks. See loading-challenge.md.

- Drag passengers, baggage and fuel between marked stations. Show the centre of gravity move on a side-view schematic.
- Separate two things explicitly: mass balance is calculated from mass moments; longitudinal stability comes from the chosen aerodynamic model. Do not imply centre of gravity alone predicts the entire motion.
- Challenge: meet a payload target within a published or explicitly illustrative CG envelope. Show which load caused the violation and how much moving it helps.
- Add a small pitch disturbance demonstration only after the static-stability model is validated. Avoid claiming a real 777's handling from generic coefficients.
- Sources to read: Flight lectures 51–53 (static stability, aerodynamic centre and CG), Design lecture 32 (wing geometry). For an aircraft-specific envelope, use an approved public handbook; otherwise label the aircraft and envelope fictional.
- Resource needed: a simple original schematic is sufficient. An optional general-aviation GLB and its licence can be added later. A public handbook with loading stations and CG limits is more valuable than a detailed mesh.
- Done when: moving equal mass leaves total mass constant, CG matches hand calculations, invalid loads are explained, and keyboard users have an equivalent station selector.

## Release 3 — You have one runway (deployed 2026-10-03)

Hook: “The runway does not get longer because your aircraft is heavier.”

- Link temperature, airport altitude, mass and runway length to the take-off experiment.
- Animate an aircraft accelerating along a runway, with a visible runway remaining marker and an honest outcome: airborne, unable to accelerate, or runway exhausted.
- Prediction first: ask which adjustment will help; allow a replay with the two trials side by side.
- Sources to read: Flight lectures 2–4 (atmosphere), 17–20 (airspeed and corrections), 61–63 (take-off and landing). These latter lecture names were visible in the supplied folder. Verify their actual contents before selecting equations.
- Start with a documented point-mass ground-run model: thrust, aerodynamic drag, rolling resistance and lift. State constant-coefficient or other simplifications. Do not present educational results as operational take-off distances.
- Resource needed: no new model for the first version; optional licensed aircraft model later. A complete, attributable parameter set is required before aircraft-specific presets.
- Done when: units and limiting cases pass independent calculations, impossible take-offs terminate cleanly, and mass/atmosphere effects follow the model with all assumptions shown.

## Release 4 — Design an aircraft for somebody

Combine the experiments into a small mission brief: cargo, short runway, or long endurance. Choose wing and payload parameters, evaluate constraints, and iterate. Show why an improvement in one area can cost another. Use Design lectures 2–8 (design stages/process, cost, design spiral, requirements), 18–19 (cargo and GA aircraft) and 24–27 (wing sweep, canards/flying wings, three surfaces, winglets) only after reading the relevant PDFs. Keep performance models separate from illustrative configuration graphics.

This comes after the three smaller releases. It is deliberately not a complete aircraft design optimiser or flight simulator.

## Shared experience and delivery gates

1. Enter through a visible challenge card with one sentence and one action.
2. Show the experiment immediately; do not put a long lesson in front of the first interaction.
3. Use consistent Reset, Compare and “Why did that happen?” controls.
4. Display units beside every input and explain the result in plain language. Put equations and assumptions in an expandable panel.
5. Respect reduced motion, support touch and keyboard, and provide textual equivalents of force plots and visual outcomes.
6. Validate calculations separately from visuals; test the complete challenge with the real controls on desktop and phone.
7. Add lecture/page-specific citations and any external datasets to References before release.

## Homepage invitation delivered first

The homepage now previews the Apollo journey and offers an opt-in, approximately three-minute guided scroll. Pause, resume, exit, manual takeover and hidden-tab pause are included. Reduced-motion visitors retain a direct chapter link. This uses the existing Apollo scene and camera path; it does not add new historical claims or promise a separate controllable lunar flight simulation.

Family test: show the first screen without explaining it. Ask what they expect the main action to do. Watch whether they start the tour or choose the exhibits, whether they know how to pause, and whether they can explain one thing they saw. If they still have to be told to scroll, the invitation has not done its job.

## Explicitly deferred

Rocket/Shuttle timeline 3D model acquisition remains bookmarked in rocket-timeline-models.md. Private-aircraft models, multiplayer, accounts, a full flight simulator, real mission prediction and automatic design optimisation are outside this expansion's initial scope.
