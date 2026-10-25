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
