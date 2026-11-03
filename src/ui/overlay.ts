export interface Screen {
  readonly title: string;
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

/** HTML panel shown over the canvas for start, pause and game-over screens. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly button: HTMLButtonElement;
  private run: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.title = query(root, '[data-title]');
    this.text = query(root, '[data-text]');
    this.button = query<HTMLButtonElement>(root, '[data-action]');
    this.button.addEventListener('click', () => this.run?.());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(screen: Screen): void {
    this.title.textContent = screen.title;
    this.text.textContent = screen.text;
    this.run = screen.action?.run ?? null;
    this.button.hidden = !screen.action;
    this.button.textContent = screen.action?.label ?? '';
    this.root.hidden = false;
    if (screen.action) this.button.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}

function query<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}
