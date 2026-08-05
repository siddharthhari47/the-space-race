# The Space Race

An interactive aerospace education platform — "The Space Race never ended,
it evolved." Plain HTML/CSS/JS, no build step, deployed as a static site.
Reusable UI is built from vanilla Web Components rather than a framework, so
new pages and new interactive modules can be added without a redesign.

## Structure

- `index.html` — home page ("Mission Control")
- `blog/` — narrative blog posts (`index.html` is the listing page)
- `flight-lab/`, `space-lab/`, `engineering-lab/` — topic reference pages, one
  `index.html` per section plus flat sibling pages for each sub-topic
- `timeline/`, `playground/` — single-page sections for now
- `assets/css/style.css` — all styling, including design tokens in `:root`
- `assets/js/components/` — Web Components (`<site-header>`, `<info-card>`,
  `<mission-card>`, `<simulation-container>`, ...). Every page loads them all
  via one script tag: `<script type="module" src="/assets/js/components/index.js">`
- `assets/js/simulators/` — Playground plugin modules, keyed by id in
  `registry.js`. Adding a simulator = one module file + one registry entry +
  a `<simulation-container type="...">` tag wherever it should appear.
- `assets/images/` — logo and page imagery

## Local preview

Just open `index.html` in a browser, or serve the folder with any static
file server, e.g.:

```
npx serve .
```

## Deploying to Vercel

This is a static site with no build command — Vercel will detect it
automatically. `vercel.json` holds redirects from the site's old URL
structure. From this folder:

```
npx vercel
```

Follow the prompts to link/create a project, then `npx vercel --prod` to
deploy to production.
