// Land on the right heading when a page is opened at a #fragment.
//
// Every page on this site is mostly custom elements, and a custom element is
// an empty inline box until its definition arrives and it renders. The
// browser resolves the fragment at parse time, against that empty layout, so
// by the time the headings and cards above the target have filled in, the
// target has moved down the page and the reader is looking at whatever
// happens to be at that scroll position instead.
//
// Measured on /references/#apollo: the browser leaves the heading 42 pixels
// above the top of the window, 122 short of where scroll-margin-top asks for
// it. Setting the fragment again once the elements have upgraded puts it at
// exactly 80.
//
// Only on a fresh load with a fragment, and only while the reader has not
// scrolled -- a correction that fires after somebody has started reading is
// worse than the problem.

const target = () => {
  const id = decodeURIComponent(location.hash.slice(1));
  return id ? document.getElementById(id) : null;
};

function land() {
  const el = target();
  // "instant" on purpose. The root sets scroll-behavior: smooth, which is
  // right for a reader clicking a link and wrong for this: a correction the
  // reader watches slide 122 pixels a moment after the page arrives looks
  // like a bug even when it is the fix.
  if (el) el.scrollIntoView({ block: "start", behavior: "instant" });
}

if (location.hash) {
  // What counts as "the reader has taken over" is a gesture, not a scroll
  // event. The browser's own jump to the fragment arrives as a scroll too,
  // and it usually arrives after this module runs -- watching scrollY here
  // suppressed the correction every single time, because the thing it
  // detected was the browser doing the very thing being corrected.
  let moved = false;
  const took = () => {
    moved = true;
  };
  const GESTURES = ["wheel", "touchstart", "keydown", "pointerdown"];
  for (const type of GESTURES) addEventListener(type, took, { passive: true, once: true });

  // Once the definitions this page needs have arrived, and once the frame
  // after that has been laid out. whenDefined resolves per name, so wait on
  // the ones actually in the document rather than on a list that would go
  // stale the next time a component is added.
  const names = [...new Set([...document.querySelectorAll("*")]
    .map((el) => el.tagName.toLowerCase())
    .filter((n) => n.includes("-")))];

  // Two things have to have happened, and the order they happen in is not
  // fixed: every definition on the page has to have upgraded, and the
  // browser has to have finished its own jump to the fragment. Correcting
  // before that jump is worse than not correcting at all -- the jump lands
  // afterwards and undoes it, which is what the first version of this did.
  // window.load is after both on every path that matters.
  const upgraded = Promise.race([
    Promise.all(names.map((n) => customElements.whenDefined(n))),
    // A definition that never arrives must not leave the page uncorrected.
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]);
  const loaded =
    document.readyState === "complete"
      ? Promise.resolve()
      : new Promise((resolve) => addEventListener("load", resolve, { once: true }));

  Promise.all([upgraded, loaded]).then(() => {
    requestAnimationFrame(() => {
      if (!moved) land();
      for (const type of GESTURES) removeEventListener(type, took);
    });
  });
}
