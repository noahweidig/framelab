# FrameLab

A static React + Tailwind web app for generating social-media-ready images of websites in a styled desktop browser frame.

## Features

- URL input with instant capture attempt.
- Social-size presets + custom canvas dimensions.
- Browser frame controls:
  - Browser viewport size
  - Padding/margins
  - Border radius and shadow depth
  - Light/dark mac-style frame
  - Optional URL bar
- Background controls:
  - Solid color
  - 2-stop and 3-stop gradients + angle
- Export:
  - PNG @2x and @3x (retina)
  - JPG @2x
  - Copy PNG to clipboard
  - Shareable URL with encoded config
- Responsive editor + live preview.
- Fallback upload if screenshot capture fails.

## Important note on static hosting

Since this app is **fully static** (GitHub Pages, no backend, no proxy), it cannot run a server-side headless browser.

The app keeps capture local by using browser screen-capture APIs (you select a tab/window to snapshot), and provides a manual image upload fallback.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages deployment

1. Push to `main`.
2. In GitHub repository settings, enable **Pages** with **GitHub Actions** source.
3. Workflow in `.github/workflows/deploy.yml` builds and deploys `dist/`.

## Performance

All compositing is done in-browser on a `<canvas>` to keep interactions fast and avoid backend render latency.
