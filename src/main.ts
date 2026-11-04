import { Game, type GameEvent } from './game/game';
import { HighScore, type KeyValueStore } from './game/highScore';
import { MouseInput } from './input/mouse';
import { noInput, type InputSource } from './input/types';
import { Renderer } from './render/renderer';
import { Overlay } from './ui/overlay';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const overlayRoot = document.querySelector<HTMLElement>('#overlay');
if (!canvas || !overlayRoot) throw new Error('Missing page elements');

const debug = new URLSearchParams(window.location.search).has('debug');
const input: InputSource = debug ? new MouseInput() : noInput;
const renderer = new Renderer(canvas);
const overlay = new Overlay(overlayRoot);
const highScore = new HighScore(safeStorage());
const game = new Game(boardSize());

function boardSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function safeStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function enterFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => undefined);
  }
}

function start(): void {
  enterFullscreen();
  overlay.hide();
  game.start();
}

function pause(): void {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return;
  game.pause();
  overlay.show({
    title: 'Paused',
    text: 'Press Space or the button to carry on.',
    actions: [{ label: 'Resume', run: resume }],
  });
}

function resume(): void {
  enterFullscreen();
  overlay.hide();
  game.resume();
}

function showReady(): void {
  overlay.show(
    debug
      ? {
          title: 'SnakeEyes',
          text: 'Debug mode: steer with the mouse. Eat fruit to grow; crossing yourself trims your tail. Two minutes on the clock.',
          actions: [{ label: 'Start', run: start }],
        }
      : {
          title: 'SnakeEyes',
          text: 'Eye tracking arrives in a later milestone. For now, add ?debug to the URL to steer with the mouse.',
        },
  );
}

function handle(events: readonly GameEvent[]): void {
  for (const e of events) {
    if (e.type !== 'over') continue;
    const isBest = highScore.submit(e.score);
    overlay.show({
      title: "Time's up",
      text: isBest ? `New best: ${e.score}!` : `You scored ${e.score}. Best: ${highScore.best}.`,
      actions: [{ label: 'Play again', run: start }],
    });
  }
}

function resize(): void {
  const board = boardSize();
  renderer.resize(board.width, board.height);
  game.resize(board);
}

window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    pause();
    return;
  }
  if (e.code !== 'Space' || e.repeat) return;
  // Let a focused overlay button handle its own activation.
  if (overlay.visible && document.activeElement instanceof HTMLButtonElement) return;
  e.preventDefault();
  if (game.phase === 'playing' || game.phase === 'countdown') pause();
  else if (game.phase === 'paused') resume();
  else if (debug) start();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', pause);
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) pause();
});

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  accumulator += Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  const { target } = input.sample();
  while (accumulator >= STEP) {
    handle(game.step(STEP, target));
    accumulator -= STEP;
  }
  document.body.classList.toggle('playing', game.phase === 'playing' || game.phase === 'countdown');
  renderer.draw(game, { target, best: highScore.best, time: now / 1000 });
  requestAnimationFrame(frame);
}

resize();
showReady();
requestAnimationFrame(frame);
