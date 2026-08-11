import { TIMELINE_EVENTS, findEvent } from "../data/timeline-events.js";

// Renders /timeline/event.html from ?id=<event-id>.
//
// One page rather than fourteen near-identical files. Every event's
// content already lives in timeline-events.js because the timeline itself
// needs it, so generating static pages would mean maintaining the same
// prose in two places and re-running a build step every time a date gets
// corrected. Adding an event is now a single data entry.
//
// The YouTube embed uses youtube-nocookie.com, which doesn't set tracking
// cookies until the viewer actually presses play.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function questionBlock(label, text) {
  return `
    <section class="event-q">
      <h3>${label}</h3>
      <p>${esc(text)}</p>
    </section>`;
}

function render() {
  const root = document.getElementById("timeline-event-root");
  if (!root) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const data = id ? findEvent(id) : null;

  if (!data) {
    document.title = "Event not found — The Space Race";
    root.innerHTML = `
      <a class="back-link" href="/timeline/index.html">&larr; Timeline</a>
      <h1 class="lab-title">That event isn't on the timeline</h1>
      <p class="lab-intro">
        Either the link is wrong or this one hasn't been written yet. The full timeline is
        <a href="/timeline/index.html">here</a>.
      </p>`;
    return;
  }

  document.title = `${data.title} (${data.date}) — The Space Race`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", `${data.date}: ${data.blurb}`);

  const video = data.video
    ? `
      <figure class="event-video">
        <div class="event-video-frame">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(data.video.id)}"
            title="${esc(data.video.label)}"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        </div>
        <figcaption>
          ${esc(data.video.label)} &middot; published by ${esc(data.video.channel)} on YouTube.
          <a href="https://www.youtube.com/watch?v=${encodeURIComponent(data.video.id)}"
             target="_blank" rel="noopener noreferrer">Watch on YouTube</a>.
          Embedded here under YouTube's standard player; the footage belongs to its publisher,
          not to this site.
        </figcaption>
      </figure>`
    : `
      <p class="lab-intro spaced">
        No archive footage is attached to this one yet. Rather than embed something that might
        not be what it claims to be, this page waits until a clip has actually been checked.
      </p>`;

  const related = (data.related || [])
    .map((r) => `<li><a href="${r.href}">${esc(r.label)}</a></li>`)
    .join("");

  const index = TIMELINE_EVENTS.findIndex((e) => e.id === data.id);
  const prev = TIMELINE_EVENTS[index - 1];
  const next = TIMELINE_EVENTS[index + 1];

  root.innerHTML = `
    <a class="back-link" href="/timeline/index.html">&larr; Timeline</a>
    <span class="eyebrow">${esc(data.date)}</span>
    <h1 class="lab-title">${esc(data.title)}</h1>
    <p class="lab-intro">${esc(data.blurb)}</p>

    ${video}

    <div class="event-questions">
      ${questionBlock("What happened", data.what)}
      ${questionBlock("Where", data.where)}
      ${questionBlock("When", data.when)}
      ${questionBlock("Who", data.who)}
      ${questionBlock("Why it mattered", data.why)}
      ${questionBlock("How it was done", data.how)}
    </div>

    <callout-box type="did-you-know">
      <p>${esc(data.legacy)}</p>
    </callout-box>

    <div class="event-nav">
      ${prev ? `<a class="btn btn-secondary" href="/timeline/event.html?id=${prev.id}">&larr; ${esc(prev.date)} ${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="btn btn-secondary" href="/timeline/event.html?id=${next.id}">${esc(next.date)} ${esc(next.title)} &rarr;</a>` : "<span></span>"}
    </div>

    <div class="continue-explore">
      ${related ? `<h2>Go Deeper</h2><ul>${related}</ul>` : ""}
      <h2>Next Steps</h2>
      <ul>
        <li><a href="/timeline/index.html">Back to the Timeline</a></li>
        <li><a href="/references/index.html">References</a></li>
      </ul>
    </div>`;
}

render();
window.addEventListener("popstate", render);
