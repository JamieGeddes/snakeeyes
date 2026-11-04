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

## Playing

1. Click **Start** and allow the camera. The game goes fullscreen.
2. Keep your head still and follow the 9 calibration dots, then the 4 accuracy dots.
3. Click **Play**. The snake heads for where you look; look further away to go faster.

| Key   | Action        |
| ----- | ------------- |
| Space | Pause, resume |
| Esc   | Pause         |

The game pauses when it can't see your face, when your eyes stay shut for more than 0.5 s, when the window loses focus or when it leaves fullscreen. Resume with Space or the button. Calibration carries over between rounds; the pause and game-over screens offer **Recalibrate** and the camera dropdown. If the play area has changed size since calibrating, the game recalibrates before resuming.

Add `?debug` to the URL (e.g. `http://localhost:5173/?debug`) to steer with the mouse instead; no camera is used.

## Choosing a camera

The start screen, `/tracking.html` and `/gaze.html` have a camera dropdown. The choice is remembered in this browser; if that camera is unplugged, Chrome's default is used and the page says so. Changing camera on `/gaze.html` starts calibration again, and on `/tracking.html` it clears the signal-quality measurements.

## Tracking check

`/tracking.html` (e.g. `http://localhost:5173/tracking.html`) shows the camera with eye landmarks, detection rate, inference time, head pose and blink scores. Its signal-quality panel measures iris jitter while staring at one spot against the range covered looking edge to edge; the ratio indicates whether the accuracy target is reachable. Chrome will ask for camera permission.

The face model is self-hosted in `public/models/` (see its README for source, checksum and licence). MediaPipe's WASM runtime is bundled from `node_modules`, so no requests go to Google at runtime.

## Gaze check

`/gaze.html` runs the full calibration (9 dots, then 4 to check accuracy) and then shows a marker where it thinks you are looking, with reference crosses to test against. Press R to recalibrate, or C to change camera.

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
