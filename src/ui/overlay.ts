export interface Action {
  readonly label: string;
  readonly run: () => void;
}

export interface Screen {
  readonly title: string;
  readonly text: string;
  readonly actions?: readonly Action[];
}

/** HTML panel shown over the canvas for start, pause, result and game-over screens. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly actions: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.title = query(root, '[data-title]');
    this.text = query(root, '[data-text]');
    this.actions = query(root, '[data-actions]');
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(screen: Screen): void {
    this.title.textContent = screen.title;
    this.text.textContent = screen.text;
    const buttons = (screen.actions ?? []).map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      return b;
    });
    this.actions.replaceChildren(...buttons);
    this.root.hidden = false;
    buttons[0]?.focus();
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
