const filters = document.querySelector('.development-filter');
const events = [...document.querySelectorAll('.development-event')];
const buttons = [...document.querySelectorAll('[data-filter]')];
const count = document.querySelector('#development-count');

function show(track) {
  let visible = 0;
  for (const event of events) {
    event.hidden = track !== 'all' && event.dataset.track !== track;
    if (!event.hidden) visible++;
  }
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === track));
  count.textContent = `${visible} milestones`;
}

if (filters && count) {
  filters.hidden = false;
  for (const button of buttons) button.addEventListener('click', () => show(button.dataset.filter));
  // A direct link must remain reachable even after a different track was selected.
  window.addEventListener('hashchange', () => {
    const target = events.find(event => `#${event.id}` === location.hash);
    if (target?.hidden) {
      show('all');
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
}
