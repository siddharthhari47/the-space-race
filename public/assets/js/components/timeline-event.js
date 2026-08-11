import { findEvent } from "../data/timeline-events.js";

// A single entry on the timeline.
//
// Two modes, deliberately:
//
//   <timeline-event date="1969" title="Apollo 11">blurb</timeline-event>
//     The original static form. Still used on the homepage, where the
//     timeline is a three-item teaser rather than the real thing.
//
//   <timeline-event event-id="apollo-11"></timeline-event>
//     Data-driven. Pulls date, title and blurb from timeline-events.js,
//     links through to the full write-up, and if that event has verified
//     archive footage attached, starts playing it on hover or focus.
//
// The player is created on hover and destroyed on leave, so at most one
// iframe exists on the page at any moment no matter how many events have
// footage. Mounting all thirteen up front would be genuinely heavy; this
// costs one embed, only once someone actually reaches for an event.
//
// Autoplay is muted, which is what browsers require for it to be allowed
// at all without a click, and is the right default anyway when a video
// starts because a cursor passed over something. The thumbnail sits
// underneath as a poster so there's an image immediately rather than a
// black rectangle while the player loads.
const PLAYER_PARAMS = [
  "autoplay=1",
  "mute=1",
  "controls=0",
  "modestbranding=1",
  "rel=0",
  "playsinline=1",
  "disablekb=1",
].join("&");

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

class TimelineEvent extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("side")) {
      this.setAttribute("side", "left");
    }

    const eventId = this.getAttribute("event-id");
    const data = eventId ? findEvent(eventId) : null;

    const date = data?.date ?? this.getAttribute("date") ?? "";
    const title = data?.title ?? this.getAttribute("title") ?? "";
    const description = data?.blurb ?? this.innerHTML.trim();

    const body = `
      ${date ? `<span class="timeline-date">${date}</span>` : ""}
      <h4>${title}</h4>
      ${description ? `<p>${description}</p>` : ""}
    `;

    if (!data) {
      this.innerHTML = `
        <span class="timeline-dot" aria-hidden="true"></span>
        <div class="timeline-card">${body}</div>
      `;
      return;
    }

    const href = `/timeline/event.html?id=${encodeURIComponent(data.id)}`;
    const video = data.video;

    // aria-hidden on the preview, with the link carrying the context in its
    // own label, so a screen reader gets one coherent announcement rather
    // than a decorative thumbnail it can't act on.
    const preview = video
      ? `
        <span class="timeline-preview" aria-hidden="true">
          <img
            class="timeline-preview-thumb"
            src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg"
            alt=""
            loading="lazy"
            width="480"
            height="360"
          />
          <span class="timeline-preview-stage"></span>
          <span class="timeline-preview-caption">${video.label}</span>
        </span>`
      : "";

    const cue = video
      ? `<span class="timeline-cue">Watch it happen &rarr;</span>`
      : `<span class="timeline-cue">Read the full story &rarr;</span>`;

    this.innerHTML = `
      <span class="timeline-dot" aria-hidden="true"></span>
      <a class="timeline-card is-linked" href="${href}"
         aria-label="${title}, ${date}. ${video ? "Includes archive footage. " : ""}Read the full story.">
        ${body}
        ${cue}
        ${preview}
      </a>
    `;

    if (video && !prefersReducedMotion) {
      this._wirePlayer(video);
    }
  }

  _wirePlayer(video) {
    const card = this.querySelector(".timeline-card");
    const stage = this.querySelector(".timeline-preview-stage");
    if (!card || !stage) return;

    const start = () => {
      if (stage.firstChild) return;
      const frame = document.createElement("iframe");
      frame.src = `https://www.youtube-nocookie.com/embed/${video.id}?${PLAYER_PARAMS}`;
      frame.title = video.label;
      frame.allow = "autoplay; encrypted-media; picture-in-picture";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("aria-hidden", "true");
      stage.appendChild(frame);
    };

    // Removing the iframe is what actually stops playback and frees the
    // player; hiding it would leave audio and network activity running.
    const stop = () => {
      stage.replaceChildren();
    };

    card.addEventListener("mouseenter", start);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("focus", start);
    card.addEventListener("blur", stop);

    // A card scrolled out of view while the pointer sits still would
    // otherwise keep playing off-screen.
    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (!entry.isIntersecting) stop();
      },
      { threshold: 0 }
    );
    this._observer.observe(this);
    this._stop = stop;
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._stop?.();
  }
}

customElements.define("timeline-event", TimelineEvent);
