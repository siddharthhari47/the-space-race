// The ignition flare, as DOM.
//
// This is the second thing on this layer that is not drawn in WebGL, and
// unlike the countdown it is not here by preference. It is here because of
// a measurement.
//
// The page paints a readability scrim over the whole visualisation: a
// vertical wash on `main` that reaches 0.83 by about eleven hundred pixels
// into the document, which is what it takes for every line of text sitting
// on the backdrop rather than on a card to hold its contrast. That wash is
// not negotiable and it is not a bug -- it is the reason the site is
// readable over a live planet.
//
// What it means for a light is arithmetic. Below that point nothing drawn
// into the canvas can exceed about forty-five of two hundred and fifty-five
// on screen, however bright it is in the framebuffer. This was measured
// directly rather than assumed: with the flare drawn as an additive sprite,
// gl.readPixels at the pad returned (255, 255, 255) and the same pixel in a
// screenshot of the page returned (45, 47, 52). A sixth of the range. Every
// attempt to fix that inside the canvas -- a tighter core, a wider halo,
// glare arms, a larger quad -- is an attempt to exceed a ceiling, and none
// of them can.
//
// Most of the layer does not care. A white rocket at 45 against a
// background at 20 is still better than two to one, and the vehicle reads
// perfectly well. But "an insanely bright light from the spot it comes
// from" is a statement about absolute luminance, and absolute luminance is
// exactly what the scrim removes.
//
// So the flare is drawn above the scrim and below the text. That ordering
// is the whole point: the text still paints last, so its contrast is
// untouched by the flare being bright -- which is the difference between
// this and the other obvious fix, weakening the scrim, which would have
// bought the same brightness directly out of the readability the scrim was
// measured to provide.
//
// Everything else about it still comes from launchsite.js: the intensity
// curve, the core radius, the pad's projected position and the limb
// occlusion. This file is a renderer, not a model.

/* =========================================================================
   WHAT IT IS ALLOWED TO COVER
   =========================================================================

   Painting above the scrim buys brightness at one cost, and it is not
   contrast against the type -- the type is still on top -- it is that a
   line of light text sitting over a patch the flare has made bright is
   unreadable no matter what order things painted in.

   That cost was measured rather than guessed, on every run of type whose
   glyph rectangle fell inside the flare, at five points through the
   ignition:

     peak       flare 233 px radius, full intensity   worst cost  -0.41
     holddown   275 px, 0.93                                      -0.82
     liftoff    312 px, 0.87                                      -1.87
     tower      400 px, 0.58                                      -5.78
     climbing   508 px, 0.30                                      -3.52

   The brightest moment is the safest one. What breaks the page is the
   spreading: at tower clear the light is a little over half strength and
   nearly twice as wide, and "Atmosphere & Altitude" falls from 7.17 to
   1.39 -- a heading that has effectively gone.

   So this element does not spread. It is the core and the glare arms and
   nothing else, sized from launchsite's flashCoreRadiusKm, which runs 120
   to 260 km rather than 560 to 1500. The wide spill is still drawn -- as a
   sprite in the scene, under the scrim, dimmed to a sixth, which for a
   broad soft bloom behind a column of type is not a compromise but the
   right place for it.

   =========================================================================
   THE SHAPE
   =========================================================================

   Photography's answer to a light brighter than the medium can record is
   not to render the brightness -- it cannot -- but to render the artefacts
   of it. Two of them, plus the source:

   - a small saturated core that grades white to sodium orange, because a
     clipped channel is white and an RP-1 flame is not;
   - a horizontal glare arm, and
   - a shorter vertical mast.

   The arms matter more than the core. Nothing in a photograph produces a
   streak except a light that has overwhelmed the lens, so the eye reads
   "too bright to record" from the shape alone, at any luminance -- which
   is a useful property for something that has to be small.

   Three background layers on one element, each with its own
   background-size so the arms can be long and thin while the core stays
   compact. The alternative -- sizing everything in per-cent of one box --
   ties arm thickness to arm length, and a streak thick enough to see at
   its ends is a bar across a line of text at its middle. */

// The element's box: the arm span, at scale 1. Everything is a fraction or
// a fixed count of pixels within it, and one transform scales the lot.
const BASE_PX = 520;

// Core diameter at scale 1. The arms reach a little over twice as far as
// the core does, which is enough to read as glare and not so far that the
// bright part of a streak crosses a paragraph.
const CORE_PX = 232;

// Arm thickness. Small numbers on purpose: at nine pixels the gradient's
// own falloff leaves about three that are genuinely bright, which is
// thinner than the gap between two lines of body copy.
const ARM_H = 9;
const MAST_W = 7;

const CORE =
  "radial-gradient(closest-side circle," +
  "rgba(255,255,255,0.99) 0%," +
  "rgba(255,246,226,0.94) 9%," +
  "rgba(255,206,140,0.62) 24%," +
  "rgba(255,158,72,0.22) 46%," +
  "rgba(255,128,44,0) 72%)";

const ARM =
  "radial-gradient(closest-side ellipse," +
  "rgba(255,251,240,0.95) 0%," +
  "rgba(255,216,160,0.42) 26%," +
  "rgba(255,178,96,0) 74%)";

const MAST =
  "radial-gradient(closest-side ellipse," +
  "rgba(255,251,240,0.8) 0%," +
  "rgba(255,216,160,0.3) 26%," +
  "rgba(255,178,96,0) 74%)";

export function createFlare({ mount }) {
  const root = document.createElement("div");
  root.className = "launch-flare";
  root.setAttribute("aria-hidden", "true");

  root.style.width = BASE_PX + "px";
  root.style.height = BASE_PX + "px";
  // Order is paint order, first layer on top: core over arm over mast, so
  // the middle stays the brightest part of the picture.
  root.style.backgroundImage = CORE + "," + ARM + "," + MAST;
  root.style.backgroundRepeat = "no-repeat";
  root.style.backgroundPosition = "center, center, center";
  root.style.backgroundSize =
    CORE_PX + "px " + CORE_PX + "px," +
    "100% " + ARM_H + "px," +
    MAST_W + "px 68%";

  // Last written values. Same argument as the countdown's: the scene draws
  // at the display's rate, and a transform string that has not changed is
  // still a style recalculation.
  let lastTransform = "";
  let lastOpacity = -1;

  mount.appendChild(root);

  /**
   * @param {{x:number,y:number,radiusPx:number,intensity:number}|null} f
   *   what launchSite.screenFlare() returned, or null for "nothing to
   *   draw", which is true for most of the page. radiusPx is the core's
   *   radius, not the spill's.
   */
  function set(f) {
    const opacity = f ? Math.round(f.intensity * 100) / 100 : 0;
    if (opacity !== lastOpacity) {
      root.style.opacity = String(opacity);
      // Gone means gone. An invisible fixed element a third of the
      // viewport across is still a compositing layer.
      root.style.visibility = opacity <= 0 ? "hidden" : "visible";
      lastOpacity = opacity;
    }
    if (!f || opacity <= 0) return;

    // Rounded to a tenth of a pixel and a thousandth of a scale factor.
    // Below that the transform is the same picture and the write is waste.
    const k = Math.round(((f.radiusPx * 2) / CORE_PX) * 1000) / 1000;
    const transform =
      "translate3d(" +
      Math.round(f.x * 10) / 10 +
      "px," +
      Math.round(f.y * 10) / 10 +
      "px,0) translate(-50%,-50%) scale(" +
      k +
      ")";
    if (transform !== lastTransform) {
      root.style.transform = transform;
      lastTransform = transform;
    }
  }

  set(null);

  return {
    element: root,
    set,
    destroy() {
      root.remove();
    },
  };
}
