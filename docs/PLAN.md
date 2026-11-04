# SnakeEyes plan

## Decisions

| Area            | Decision                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform        | Web browser, Chrome only for now; local dev server, hosting decided later                                                                                                                         |
| Display         | Fullscreen play area                                                                                                                                                                              |
| Movement        | Free steering towards gaze point; speed scales with gaze distance from the head (small minimum so it can almost stop)                                                                             |
| Gaze marker     | Faint marker shown where the player is looking                                                                                                                                                    |
| Calibration     | Every session, hands-free: 9 dots with the head still (2.5 s each, first 0.8 s ignored), a 12 s head-move step on a centre dot (turn, nod, lean), then 4 validation dots; short dots retried once |
| Head movement   | Natural sitting movement tolerated (small turns, tilts, leans of a few cm) via the geometric model                                                                                                |
| Drift           | Each eaten fruit nudges a screen-space offset (30% of the gap, ignored beyond 300 px, capped at 250 px)                                                                                           |
| Camera position | Assumed at the top centre of the screen (weak prior)                                                                                                                                              |
| Failed check    | Above 150 px median error: offer recalibrate or continue anyway                                                                                                                                   |
| Accuracy target | Median error under 150 px after calibration (go/no-go checkpoint)                                                                                                                                 |
| Round           | Timed, 2 minutes (`roundSeconds`); 3 s countdown on start and resume                                                                                                                              |
| Score           | Fruit currently in the snake; a tail trim removes the lost fruit's points                                                                                                                         |
| Fruit           | 3 on screen at once (`fruitCount`)                                                                                                                                                                |
| Walls           | Wrap around to the opposite edge                                                                                                                                                                  |
| Self-collision  | Trims the tail at the crossing point; no game over                                                                                                                                                |
| Face lost       | No face, or eyes shut, for over 0.5 s auto-pauses; resume manually (Space or button), with countdown                                                                                              |
| Rounds          | Calibration carries over; pause and game-over screens offer Recalibrate and the camera picker                                                                                                     |
| Resizing        | On resume or play again, recalibrate if the play area differs from the calibrated size                                                                                                            |
| Fallback input  | Mouse, behind a debug flag only                                                                                                                                                                   |
| Camera choice   | Picker on the start screen and the gaze and tracking pages; remembered in the browser, falls back to Chrome's default if unplugged                                                                |
| v1 extras       | Local high score; sound effects and music generated in code (Web Audio)                                                                                                                           |
| Visual style    | Modern smooth: curved body, soft gradients, glowing fruit                                                                                                                                         |
| Voice (later)   | On-device only (`vosk-browser`), fixed vocabulary for start/pause                                                                                                                                 |

## Technology

| Concern       | Choice                                                                                                                   | Licence          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Build         | Vite + TypeScript                                                                                                        | MIT / Apache-2.0 |
| Rendering     | Canvas 2D, custom fixed-timestep loop                                                                                    | -                |
| Landmarks     | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`), model self-hosted                                                 | Apache-2.0       |
| Gaze mapping  | In-house: geometric model (head pose + eye rotation, ray to screen plane) fitted by Levenberg-Marquardt, One Euro filter | -                |
| Audio         | Web Audio API, synthesised sounds                                                                                        | -                |
| Voice (later) | `vosk-browser` + small English model                                                                                     | Apache-2.0       |
| Tests         | Vitest; Playwright with fake camera feed later                                                                           | MIT / Apache-2.0 |

WebGazer.js was rejected: GPL-3.0 and less accurate than MediaPipe iris landmarks.

## Gaze pipeline

1. `getUserMedia` at 640x480; frames go to Face Landmarker in a Web Worker (478 landmarks, head transform, blink blendshapes). Detection takes ~15 ms, which would otherwise stall 60 fps rendering.
2. Inputs: per-eye iris position normalised to eye corners and lids, eye openness, and the head's rotation and position from the facial transform.
3. Geometric model (`src/gaze/geometry.ts`): eye direction in the head's frame from the iris, corrected for the camera's viewing angle (the iris sits in front of the eye corners, so turning the head shifts it in the image); rotated by the head pose and cast from the eyes (canonical-mesh offset from the face origin) onto the screen plane (camera z = 0). Screen orientation is fixed by the physics; px per cm is fixed and absorbed by the eye gains; weak priors place the camera at the top centre.
4. Calibration fits the model by Levenberg-Marquardt to per-dot medians plus binned head-move samples; turning and nodding alone can't separate the vertical terms from leaning, hence the lean. Validation reports median error of filtered gaze. The earlier ridge model stays on `/gaze.html` for comparison only.
5. One Euro filter for smoothing; frames during blinks are discarded. Eaten fruit correct slow drift.
6. No face, or eyes shut, for over 0.5 s triggers auto-pause; blinks shorter than that keep the last gaze point.

## Architecture

```
src/
  camera/     webcam access and permission UX
  tracking/   Face Landmarker wrapper, feature extraction
  gaze/       calibration, regression, filtering, confidence
  input/      InputSource interface: GazeInput, MouseInput (debug), VoiceInput (later)
  game/       pure logic: snake, fruit, collisions, score
  render/     Canvas 2D drawing and effects
  audio/      synthesised sound effects and music
  ui/         intro, calibration, play, pause, game over
  debug/      camera preview, landmarks, gaze dot, FPS
```

Every input source emits `{ target, confidence, commands }`, so voice plugs in without touching game logic.

## Milestones

1. Scaffold: Vite, TypeScript, Vitest, ESLint, Prettier.
2. Playable game with debug mouse input: steering, fruit, growth, wrap, tail trimming, score, local high score.
3. Tracking spike: landmarks and debug overlay on the target Mac; measure FPS. Go/no-go checkpoint, using `/tracking.html`:
   - detection rate at least 25 fps, p95 inference at most 20 ms;
   - face found at least 95% of the time when seated normally;
   - iris range ÷ jitter at least 10 horizontally and 6 vertically (about 150 px resolution on a ~1500×900 px screen).
4. Gaze estimation and calibration, with unit-tested maths.
5. Integration: gaze steering, gaze marker, auto-pause, blink filtering, tuning.
   5b. Head-movement tolerance: geometric gaze model, head-move calibration step, fruit-based drift correction.
6. Polish: visuals, generated audio, screen flow, accessibility pass.
7. Later: on-device voice start/pause.

## Risks

- Accuracy (~100-200 px typical): steering towards a point tolerates this; checked early at milestone 3.
- Lighting, glasses, posture drift: validation step and one-key recalibration.
- Performance: move landmark inference to a Web Worker if it hurts frame rate.
