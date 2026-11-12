"""Render the sourced timeline as static HTML; no browser JavaScript needed to read it."""
import json
from html import escape
from pathlib import Path

root = Path(__file__).resolve().parents[1]
events = json.loads((root / 'public/assets/data/rocket-development.json').read_text(encoding='utf-8'))
assert events == sorted(events, key=lambda e: e['date'])
assert len({e['id'] for e in events}) == len(events)
cards = []
refs = []
for e in events:
    esc = lambda key: escape(e[key], quote=True)
    links = [(e['source'], e['sourceLabel'])]
    for src, lab in (('extraSource', 'extraLabel'), ('thirdSource', 'thirdLabel')):
        if e.get(src):
            links.append((e[src], e[lab]))
    link_html = [f'<a href="{escape(u, quote=True)}">{escape(l, quote=True)} ↗</a>' for u, l in links]
    extra = ''.join(link_html[1:])
    refs.append(f'        <li><strong>{esc("label")}</strong> {esc("title")}<span class="development-ref-links">{"".join(link_html)}</span></li>')
    cards.append(f'''      <li class="development-event" data-track="{esc('track')}" id="{esc('id')}" data-model-key="{esc('model')}">
        <div class="development-date"><span>{esc('date')[:4]}</span><time datetime="{esc('date')}">{esc('label')}</time></div>
        <article class="development-card">
          <p class="development-meta">{esc('phase')} <span aria-hidden="true">/</span> {esc('vehicle')}</p>
          <h2>{esc('title')}</h2>
          <p>{esc('text')}</p>
          <div class="development-lesson"><span>What to notice</span><p>{esc('lesson')}</p></div>
          <details><summary>Read the source</summary><div class="development-sources">{link_html[0]}{extra}</div></details>
          <a class="development-permalink" href="#{esc('id')}" aria-label="Link to {esc('title')}">#{esc('id')}</a>
        </article>
      </li>''')

page = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rocket &amp; Space Shuttle Development — The Space Race</title>
  <meta name="description" content="Fourteen sourced milestones in rocket and Space Shuttle development, from Goddard’s 1926 flight through Artemis I. Explore prototypes, orbital flight, setbacks and reuse." />
  <link rel="icon" href="../assets/images/logo.webp" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&amp;family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../assets/css/style.css" />
  <link rel="stylesheet" href="../assets/css/museum.css" />
  <link rel="stylesheet" href="../assets/css/rocket-development.css" />
  <script type="module" src="/assets/js/components/index.js"></script>
  <script type="module" src="/assets/js/pages/rocket-development.js"></script>
</head>
<body data-world="space">
  <site-header current="space-lab"></site-header>
  <main class="development-page frame">
    <header class="development-hero">
      <a class="back-link" href="../space-lab/index.html">← Space Lab</a>
      <p class="tag tag-accent">A development history · 1926—2022</p>
      <h1>From first fire<br />to return flight.</h1>
      <p class="development-deck">Rocket &amp; Space Shuttle development</p>
      <p>Experiments become launch systems. Prototypes become spacecraft. Reuse becomes something to demonstrate in flight. Follow fourteen milestones—and the setbacks between them.</p>
      <div class="development-range" aria-label="Timeline spans 1926 to 2022"><span>1926</span><span class="development-range-line" aria-hidden="true"></span><span>2022</span></div>
      <p class="development-scope">A selected history of early rocketry, the US–Soviet space race, NASA’s Shuttle and later launch systems. This is not a complete world history. Dates distinguish programme decisions, tests, launches and landings. Sources checked 17 October 2026.</p>
    </header>
    <nav class="development-filter" aria-label="Filter development timeline" hidden>
      <button type="button" data-filter="all" aria-pressed="true">All milestones</button>
      <button type="button" data-filter="rockets" aria-pressed="false">Rockets</button>
      <button type="button" data-filter="shuttle" aria-pressed="false">Space Shuttle</button>
      <span id="development-count" role="status" aria-live="polite">14 milestones</span>
    </nav>
    <ol class="development-list" aria-label="Development milestones">
''' + '\n'.join(cards) + '''
    </ol>
    <section class="development-references" id="references" aria-labelledby="development-references-title">
      <h2 id="development-references-title">References</h2>
      <p>Every date and figure on this page comes from one of these sources. The same list is on the <a href="../references/index.html#rocket-timeline">references page</a>.</p>
      <ul>
''' + chr(10).join(refs) + '''
      </ul>
    </section>
    <footer class="development-footer">
      <h2>Keep exploring</h2>
      <a href="../space-lab/rockets.html">Try the rocket launch bench →</a>
      <a href="../space-lab/spacecraft.html">Explore spacecraft systems →</a>
      <a href="index.html">Flight &amp; exploration timeline →</a>
      <p>Summaries adapted from linked primary and institutional sources. “What to notice” connects the historical record to the exhibit’s engineering or interpretation choices. No model dimensions or performance values are inferred from appearance.</p>
    </footer>
  </main>
  <site-footer></site-footer>
</body>
</html>
'''
with open(root / 'public/timeline/rocket-development.html', 'w', encoding='utf-8', newline=chr(10)) as f:
    f.write(page)
print(f'Rendered {len(events)} sourced milestones.')
