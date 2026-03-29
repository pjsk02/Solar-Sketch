# Solar-Sketch (SolarSketch)

**Stylus-first rooftop solar feasibility MVP.** Upload an aerial or map screenshot, calibrate scale, sketch the installable roof and keep-out zones, and get an indicative panel layout plus rough DC/AC capacity and annual energy—all in the browser.

> This is a fast feasibility tool, not a substitute for detailed engineering (e.g. HelioScope), structural review, or AHJ setbacks.

## Features

- **Background image** — Upload a satellite or map screenshot; draw directly on it in an SVG canvas (mouse or stylus).
- **Calibration** — Draw a line over a known real-world distance and enter its length in feet to establish pixels-per-foot.
- **Installable area** — Freehand polygon for the roof region where modules may go.
- **Keep-outs** — Multiple polygons for HVAC, paths, and obstructions; layout avoids them. **Undo keep-out** removes the last one.
- **Panel layout** — Grid of rectangles sized from panel length/width, row spacing, module spacing, and an inner setback buffer. **Auto** orientation aligns to the longest roof edge and picks the angle that maximizes panel count; **manual** uses a fixed angle in degrees.
- **Results** — Calibrated scale, roof and keep-out areas (sf), panel count, kWdc, kWac (from DC/AC ratio), annual kWh (from specific yield × kWdc), and layout angle.

## Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 19 |
| Build | Vite 8 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Lint | ESLint 9 (flat config) + typescript-eslint |

Application logic lives mainly in [`src/App.tsx`](src/App.tsx) (geometry, calibration, packing, and canvas interaction).

## Getting started

**Requirements:** [Node.js](https://nodejs.org/) 20+ recommended (LTS).

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | TypeScript project build + production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Suggested workflow

1. Upload your image (e.g. Google Maps satellite capture).
2. Switch to **Calibrate**, draw a line along a dimension you know, enter **Known distance (ft)**.
3. **Installable** — outline the usable roof; **Keep-out** — add obstruction zones as needed.
4. Tune **Project inputs** (module watts, dimensions, gaps, setback, DC/AC ratio, specific yield).
5. Read **Results** and review the overlay on the canvas.

**Reset** clears the image, roof, keep-outs, and calibration line.

## Project layout

```
├── index.html          # Vite entry
├── vite.config.ts      # React + Tailwind plugins
├── public/             # Static assets (favicon, etc.)
└── src/
    ├── main.tsx        # React root
    ├── App.tsx         # SolarSketch UI and logic
    ├── index.css       # Tailwind import
    └── assets/
```

## Limitations (by design for MVP)

- No shading or irradiance model; **specific yield** is a single user-supplied factor.
- No automated code setbacks or structural checks.
- Layout is a simplified grid in calibrated 2D space, not a full production model.

Ideas called out in-app for future work include address-based irradiance, smarter azimuth logic, and portrait/landscape module switching.

## License

Private project (`"private": true` in `package.json`). Add a license file if you intend to open-source.
