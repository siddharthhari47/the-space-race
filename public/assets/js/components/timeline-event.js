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
//     archive footage attached, shows a preview of it on hover or focus.
//
// The preview shows YouTube's thumbnail rather than mounting an iframe.
// Fourteen hover-triggered iframes on one page would be genuinely heavy,
// and a thumbnail plus a play affordance communicates "there is footage
// here" just as well. The actual embed lives on the detail page, where
// there's only ever one of them.
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

    // The preview is aria-hidden and the link carries the full context in
    // its own label instead, so a screen reader gets one coherent
    // announcement rather than a thumbnail it can't do anything with.
    const preview = video
      ? `
        <div class="timeline-preview" aria-hidden="true">
          <img
            class="timeline-preview-thumb"
            src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg"
            alt=""
            loading="lazy"
            width="480"
            height="360"
          />
          <span class="timeline-preview-play"></span>
          <span class="timeline-preview-caption">${video.label}</span>
        </div>`
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
  }
}

customElements.define("timeline-event", TimelineEvent);
