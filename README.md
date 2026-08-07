# The Space Race

An interactive aerospace education platform — "The Space Race never ended,
it evolved." Almost the entire site is plain HTML/CSS/JS with no build step;
reusable UI is built from vanilla Web Components rather than a framework, so
new pages and new interactive modules can be added without a redesign. The
one exception is the 3D aircraft viewer, which needs React Three Fiber and
is compiled by Vite.

## Structure

- `public/` — the actual static site, copied verbatim by Vite (no bundling,
  no hashing, no HTML parsing — see `vite.config.ts` for why that matters).
  This is where almost everything lives:
  - `index.html` — home page ("Mission Control")
  - `blog/` — narrative blog posts (`index.html` is the listing page)
  - `flight-lab/`, `space-lab/`, `engineering-lab/` — topic reference pages
  - `timeline/`, `playground/` — single-page sections for now
  - `assets/css/style.css` — all styling, including design tokens in `:root`
  - `assets/js/components/` — Web Components (`<site-header>`, `<info-card>`,
    `<mission-card>`, `<simulation-container>`, ...). Every page loads them
    all via one script tag:
    `<script type="module" src="/assets/js/components/index.js">`
  - `assets/js/simulators/` — Playground plugin modules, keyed by id in
    `registry.js`. Adding a simulator = one module file + one registry entry
    + a `<simulation-container type="...">` tag wherever it should appear.
  - `assets/images/`, `assets/data/` — imagery and JSON data for interactive
    diagrams
- `src/model-explorer/` — the one part of the site that isn't static HTML: a
  reusable React Three Fiber GLTF viewer (`<InteractiveModelExplorer>`-style
  framework). `main.tsx` reads a `data-model="<key>"` attribute off its
  mount div (e.g. `#model-explorer-root` on
  `flight-lab/interactive-aircraft.html`), resolves the matching config in
  `configs/*.ts` via `import.meta.glob`, and mounts `ExplorerShell`. Adding a
  new model is a new GLB in `public/models/` + a new config file + a
  `data-model` attribute on a page — no viewer code changes. Vite builds
  this to a fixed path, `assets/js/dist/model-explorer.js`, so the HTML
  script tag never needs to change between builds.

## Local preview

```
npm install
npm run build
npm run preview
```

`npm run dev` (Vite's live dev server) works for iterating on the 3D
component itself, but most pages are plain static HTML referenced by
absolute paths outside Vite's module graph — build-then-preview is the
reliable way to check the whole site together.

## Deploying to Vercel

`vercel.json` sets `buildCommand: npm run build` and `outputDirectory: dist`,
plus redirects from the site's old URL structure. From this folder:

```
npx vercel
```

Follow the prompts to link/create a project, then `npx vercel --prod` to
deploy to production.
