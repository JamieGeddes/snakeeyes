# SnakeEyes

Snake, steered entirely by eye tracking via the webcam. Look where you want the snake to go.

All camera processing happens in the browser; no video leaves your machine.

## Requirements

- Node.js 22.12 or later
- Chrome, with a webcam

## Getting started

```sh
npm install
npm run dev
```

Open the URL Vite prints (served on `localhost`, which browsers treat as secure for camera access).

## Scripts

| Command          | Purpose                                 |
| ---------------- | --------------------------------------- |
| `npm run dev`    | Start the dev server                    |
| `npm run build`  | Type-check and build to `dist/`         |
| `npm test`       | Run unit tests                          |
| `npm run lint`   | Lint with ESLint                        |
| `npm run format` | Format with Prettier                    |
| `npm run check`  | Lint, format check, type-check and test |

## Plan

See [docs/PLAN.md](docs/PLAN.md).
