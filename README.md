# The Space Race

A small static blog about the history of the Space Race, the Boeing/Airbus
rivalry, and the present state of space exploration. Rebuilt from an original
Wix site as plain HTML/CSS/JS with no build step.

## Structure

- `index.html` — home page
- `blog.html` — full post listing
- `posts/` — individual blog posts
- `assets/css/style.css` — all styling
- `assets/js/main.js` — small nav helper
- `assets/images/` — logo and post images

## Local preview

Just open `index.html` in a browser, or serve the folder with any static
file server, e.g.:

```
npx serve .
```

## Deploying to Vercel

This is a static site with no build command — Vercel will detect it
automatically. From this folder:

```
npx vercel
```

Follow the prompts to link/create a project, then `npx vercel --prod` to
deploy to production.
