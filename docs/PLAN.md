# SnakeEyes plan

## Decisions

| Area            | Decision                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Platform        | Web browser, Chrome only for now; local dev server, hosting decided later                                             |
| Display         | Fullscreen play area                                                                                                  |
| Movement        | Free steering towards gaze point; speed scales with gaze distance from the head (small minimum so it can almost stop) |
| Gaze marker     | Faint marker shown where the player is looking                                                                        |
| Calibration     | Every session: 9-point calibration then 4-point validation                                                            |
| Accuracy target | Median error under 150 px after calibration (go/no-go checkpoint)                                                     |
| Round           | Timed, 2 minutes (`roundSeconds`); 3 s countdown on start and resume                                                  |
| Score           | Fruit currently in the snake; a tail trim removes the lost fruit's points                                             |
| Fruit           | 3 on screen at once (`fruitCount`)                                                                                    |
| Walls           | Wrap around to the opposite edge                                                                                      |
| Self-collision  | Trims the tail at the crossing point; no game over                                                                    |
| Face lost       | Auto-pause after ~0.5 s; countdown on resume                                                                          |
| Fallback input  | Mouse, behind a debug flag only                                                                                       |
| v1 extras       | Local high score; sound effects and music generated in code (Web Audio)                                               |
| Visual style    | Modern smooth: curved body, soft gradients, glowing fruit                                                             |
| Voice (later)   | On-device only (`vosk-browser`), fixed vocabulary for start/pause                                                     |

## Technology

| Concern       | Choice                                                                            | Licence          |
| ------------- | --------------------------------------------------------------------------------- | ---------------- |
| Build         | Vite + TypeScript                                                                 | MIT / Apache-2.0 |
| Rendering     | Canvas 2D, custom fixed-timestep loop                                             | -                |
| Landmarks     | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`), model self-hosted          | Apache-2.0       |
| Gaze mapping  | In-house: iris + head-pose features, polynomial ridge regression, One Euro filter | -                |
| Audio         | Web Audio API, synthesised sounds                                                 | -                |
| Voice (later) | `vosk-browser` + small English model                                              | Apache-2.0       |
| Tests         | Vitest; Playwright with fake camera feed later                                    | MIT / Apache-2.0 |

WebGazer.js was rejected: GPL-3.0 and less accurate than MediaPipe iris landmarks.

## Gaze pipeline

1. `getUserMedia` at 640x480; Face Landmarker per video frame (478 landmarks, head transform, blink blendshapes).
2. Features: per-eye iris position normalised to eye corners and lids, plus head yaw/pitch/roll.
3. Calibration fits features to screen x,y; validation reports error and offers recalibration.
4. One Euro filter for smoothing; frames during blinks are discarded.
5. Low confidence or no face for ~0.5 s triggers auto-pause.

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
6. Polish: visuals, generated audio, screen flow, accessibility pass.
7. Later: on-device voice start/pause.

## Risks

- Accuracy (~100-200 px typical): steering towards a point tolerates this; checked early at milestone 3.
- Lighting, glasses, posture drift: validation step and one-key recalibration.
- Performance: move landmark inference to a Web Worker if it hurts frame rate.
