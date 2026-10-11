# Loading and balance — first local version

Route: `/flight-lab/loading-and-balance.html#loading`. Linked from Flight Lab and Flight Dynamics. This next release is local, not included in the wing deployment `dpl_FfU73KrToLwcFJewv7tPKo53agXd`.

## What is implemented

Prediction first; locked-mass challenge; free mass adjustment; three load rails with Pointer Events dragging and left/right/Home/End keyboard control; equivalent native station menus; live CG, total mass, payload and mass-moment table; explicit forward/aft/overweight/payload failures; an optional useful-move hint; reset; browser-persisted A/B comparison with an in-memory fallback. The visual and numerical outputs use one mass-balance evaluation. No continuous animation is required, so reduced-motion users get the same experiment without movement over time.

The aircraft and every numerical parameter are fictional and labelled. Mass balance and initial static pitching tendency are deliberately separate. The pitch button reports a moment increment for a declared +5-degree disturbance about an assumed trimmed reference. It does not integrate attitude or claim dynamic recovery.

## Sources read

- NPTEL Flight Lecture 51, supplied PDF: https://drive.google.com/file/d/1tVLz35OsDiqxcbirENMxLcFO5kVpLHwE/view . PDF p. 13 (CG depends on mass distribution); pp. 16–17 (neutral point); pp. 18–22 (static tendencies); pp. 2–9 (dynamic behaviour is a different question).
- NPTEL Flight Lecture 52: https://drive.google.com/file/d/14EyiVHXlopzyupeNQ6OGrZup0iQ2bHyo/view . PDF pp. 9–11: initial pitching response when CG is ahead of, at or behind NP. Both PDFs visually reviewed on 2026-09-28. PDF page numbers include the cover; footer lecture numbers differ.
- NASA Glenn: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/aircraft-center-of-gravity/ . Weight-moment sum and mass-weighted CG equation. Read 2026-09-28.
- The chosen dimensions, loads, loading band and lift slope are explicitly original teaching assumptions. They are not attributed to NASA or NPTEL as measured aircraft data. All claims and conditions are recorded in `references/index.html#loading-challenge`.

## Verification

- `node tools/loading-check.mjs`: independent 1,040 kg / 2,844 kg-m initial calculation, CG shift identity, preservation of mass across all 27 station arrangements (9 successes and 18 failures), forward CG failure, overload, insufficient payload, invalid inputs, initial pitching-moment signs and a useful hint.
- Browser: challenge success by moving baggage aft-to-centre, exact constant mass and 21.2 cm rounded forward shift; initial restoring and destabilizing moment outputs; free-mode overweight feedback; A/B save and reload; mode switching; native station menu; left-arrow movement; pointer drag at a 390 x 844 phone viewport; no document-wide horizontal overflow or console errors observed. Phone-size browser testing is not a physical touchscreen certification.
- Production build passes; existing large model-explorer/Apollo bundle warnings remain.
- Local preview stays on port 5500.

## Next: runway experiment

Keep this separate from loading safety claims. Read NPTEL Flight 61–63 and relevant atmosphere lecture pages before choosing the ground-run equations. Start with declared fictional thrust, drag, rolling resistance, lift and mass, prediction first, a runway remaining marker, and terminating outcomes for no acceleration and runway exhaustion. Do not borrow an operational distance or real-aircraft preset without a complete parameter source. No new 3D model is needed.


Production deployment 2026-10-02: dpl_BfFZ4Fq23XTy4ZANFc4jEJumTssL. Alias https://the-space-race-nu.vercel.app. Live browser verified prediction and centre-baggage success.
