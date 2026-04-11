export interface AskUserQuestionOption<T extends string = string> {
  value: T;
  label: string;
  shortcutKey?: string;
}

export interface AskUserQuestionDetail {
  label: string;
  value: string;
}

export interface AskUserQuestionRequest<T extends string = string> {
  title: string;
  body?: string;
  details?: AskUserQuestionDetail[];
  options: AskUserQuestionOption<T>[];
  defaultIndex?: number;
}

export type AskUserQuestionHandler = <T extends string>(request: AskUserQuestionRequest<T>) => Promise<T>;

export class AskUserQuestionController {
  private handler: AskUserQuestionHandler | null = null;

  setHandler(handler: AskUserQuestionHandler | null): void {
    this.handler = handler;
  }

  hasHandler(): boolean {
    return this.handler !== null;
  }

  async ask<T extends string>(request: AskUserQuestionRequest<T>): Promise<T> {
    if (!this.handler) {
      throw new Error("AskUserQuestion handler is not set.");
    }

    return this.handler(request);
  }
}

export function clampQuestionSelectionIndex(selectedIndex: number, optionCount: number): number {
  if (optionCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(selectedIndex, optionCount - 1));
}

export function findQuestionOptionByShortcut<T extends string>(
  options: AskUserQuestionOption<T>[],
  input: string
): AskUserQuestionOption<T> | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return options.find((option) => option.shortcutKey?.toLowerCase() === normalized) ?? null;
}
