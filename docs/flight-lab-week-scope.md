# Flight Lab: one aircraft, one mission, consequences that carry through

Execution scope: 3–9 October 2026 (Asia/Kolkata). Prepared from the current checkout, existing expansion plan and the user's instructions. This is a priority order and effort allocation, not a promise of uninterrupted runtime or a requirement to consume the entire account allowance.

## Outcome

A visitor can discover a mission, make a prediction, load a fictional aircraft, correct its balance, attempt a ground run, explain the outcome, and improve a saved attempt. The experience should feel deliberately staged and visually coherent on a phone as well as a desktop. Preserve the existing site and Apollo journey.

## Starting point

- Wing challenge and Loading & Balance have production deployment records. Loading's live main interaction was checked on 2 October.
- Runway challenge is implemented locally, with force-balance tests, saved trials and comparison replay. The centreline correction is also local. Publish only after the remaining release review below; do not assume the live site already contains it.
- The wing uses a measured NACA 0012 airfoil series. Loading and runway use distinct fictional teaching models. They cannot be silently combined into measured aircraft performance.
- Existing working tree contains substantial earlier work. Preserve it; keep rollback copies of files before changing them. No broad staging, resets or unrelated clean-up.

## Priority 1 — Finish the runway release (20% of effort)

**Experience:** a legible aircraft silhouette following the centreline; a clear lift-off target and runway remaining; failure that says what to try next. Replace the font-dependent plane glyph with an original lightweight SVG, preserving the simple scene and avoiding new asset dependencies.

**Interaction:** explicitly label the accelerated playback rate. Add pause/resume and a useful scrub/replay control with keyboard equivalents. Pause while the page is hidden; do not jump to the end after returning. Make the A/B replay show each runway endpoint on its common scale, plus a visible colour legend. Give each run a coherent state: ready, playing, paused, complete. Editing, reset, clearing trials and switching modes must leave no stale animation or result button.

**Evidence:** retain the validated ground equation and bounds. Independently check near-zero acceleration, the lift-off boundary and unreachable speed. Ground roll is not total take-off distance. Verify storage failure/corruption and reduced-motion changes during both single and comparison playback. Test real controls at desktop and phone widths, then production after deployment. Record deployment identity and screenshots.

**Done:** runway and centreline fix available through production Flight Lab navigation; completed, exhausted and impossible cases all work; no console errors or layout overflow; sources linked.

## Priority 2 — Connected cargo mission (35%)

**Working title:** “The cargo has to go. The runway has opinions.”

Build one mission first inside Flight Lab. Reuse loading and runway evaluators. A short brief gives a required payload, fixed fuel load, loading limits and a fixed airport/runway. Choose a scenario only after checking that at least one valid solution and several informative failures exist.

1. Predict the likely problem: mass, balance or runway.
2. Load the aircraft using the existing accessible station controls. Show payload, fuel, total mass and CG together.
3. Carry the exact evaluated mass into the runway stage. Do not allow an independent mass slider to erase the loading decision. Show a small manifest so the connection is visible.
4. Run the ground experiment. Keep the airport conditions fixed in the mission; free exploration can vary them separately.
5. Return to loading, revise the manifest and compare complete mission attempts A/B. Mark old results stale whenever their upstream inputs change.
6. End with a short explanation of what changed and which constraint improved. No leaderboard or unexplained score.

Use one versioned fictional-aircraft definition for the mission; reconcile the current 1,100 kg loading limit with runway inputs. Keep standalone models backward compatible. A required fuel mass is a game constraint, not a calculated range or endurance guarantee. Do not model CG effects on take-off distance unless an additional validated model is introduced; show balance acceptance and ground-run acceptance as separate checks.

The measured wing challenge is an optional preparation link. Do not feed its two-dimensional coefficients into this fictional aircraft. No adjustable wing geometry in this release.

**Source work before copy:** read the relevant supplied Aircraft Design requirements/design-process lectures. Record exact PDF pages and which claims they support. Existing Flight 51/52, 61/62 and 3 support the already implemented calculations. If new source access fails, finish other independent work and omit unsupported teaching claims.

**Done:** one fully playable mission; a shared input-to-result contract; recoverable progress; consistent reset/start-over; A/B includes the entire manifest, conditions and model identity. Tests detect mismatched mass, stale results and incompatible saved versions. Browser walkthrough completes and fails the mission using real controls.

## Priority 3 — Make the route obvious and the interactions satisfying (20%)

Add a concise “Start a mission” entry to the existing Flight Lab and an appropriate homepage invitation near the existing exploration choices. Preserve Apollo's opening invitation and camera system. Use one sentence that promises the actual interaction; no new long introduction.

Show the three existing experiments as a readable sequence, with a resume action for unfinished local progress. Keep direct access to free exploration. Completion records mean a game objective was met; never imply flight competence.

Unify the placement and wording of Predict, Run, Reset, Save A/B and Why across these experiences where it improves usability. Keep the experiment and its consequence visible together. Use restrained motion for changed loads, CG and runway progression; every transition should explain a cause or outcome. Avoid decorative camera sweeps and sudden viewpoint changes.

Maintain the site's conversational voice: concrete, curious, occasionally funny, never invented personal anecdotes. Short explanations first; equations, limitations and source details one disclosure away. Validate text contrast, visible focus, labels, touch targets, empty states and blocked controls.

**Done:** a new visitor can see where to begin and what will happen without being told to scroll; a returning visitor can continue; mobile controls stay close to the result. Treat browser inspection as evidence, not as proof of a human usability study.

## Priority 4 — Release quality and resilience (20%)

Reserve this effort throughout, rather than leaving it until the end. Audit local-versus-production differences, route links, source anchors, scene alignment, saved-state recovery and asset loading. Keep small original SVGs instead of introducing a heavy engine for these widgets. Investigate bundle/asset cost before attempting performance optimisations; avoid unrelated refactors.

Run relevant physics checks and the production build. Browser-test the full mission on desktop and a narrow phone viewport: keyboard-only path, pointer/touch equivalents, reduced motion, background/resume, refresh, storage unavailable, repeated reset and rapid mode changes. Test the affected existing wing/loading/runway interactions after shared changes. Capture representative screenshots and console evidence. Publish completed increments to the existing Vercel project and verify the public alias, not merely the build URL.

## Priority 5 — Conditional extension (5%, cut first)

Only if priorities 1–4 pass: add a second mission using the same validated machinery, such as the same payload at a hotter/higher airport. It must teach a distinct constraint and have proven solutions. Do not add range, fuel burn, engine-out operations, landing or obstacle clearance under this allowance. Those require further model and source work.

## Resources and autonomy

No new user-supplied resource is required for the core scope. Use the supplied NPTEL folders, existing local assets and original SVG diagrams. Optional future upgrades: a licensed lightweight general-aviation model and a complete public aircraft handbook, with matching configuration and conditions. Their absence must not hold up this fictional mission.

Proceed independently with source reading, code, reversible design choices, tests, local reviews and verified deployments to the existing site. Report meaningful releases, material blockers or scope changes; do not request approval for routine choices. Do not purchase services, change access permissions, publish private course PDFs, send messages to others, or invent missing data. Preserve the user's deferred rocket/shuttle model timeline.

Do not spend quota simply because it exists. If available runtime/usage becomes constrained, finish and verify the current increment, checkpoint accurately, and cut the optional second mission first. Do not call an untested result complete.

## Execution checkpoints

For every increment, update `docs/flight-lab-progress.md` with source pages read, files touched, tests actually run, screenshots, blockers, next action and deployment state. Continue from that record rather than redoing completed work. Keep claims about local and live status separate. A scheduled continuation must stop at the end of 9 October local time or when the core scope is complete, whichever comes first.
