import { useEffect, useState } from "react";
import type {
  AskUserQuestionController,
  AskUserQuestionRequest
} from "../../core/askUserQuestion.js";
import { clampQuestionSelectionIndex } from "../../core/askUserQuestion.js";

export interface AskUserQuestionState<T extends string = string> {
  request: AskUserQuestionRequest<T>;
  selectedIndex: number;
  resolve: (choice: string) => void;
}

export function useAskUserQuestion(questionController: AskUserQuestionController) {
  const [activeQuestion, setActiveQuestion] = useState<AskUserQuestionState | null>(null);

  useEffect(() => {
    const handler = async <T extends string>(request: AskUserQuestionRequest<T>) => new Promise<T>((resolve) => {
      setActiveQuestion({
        request,
        selectedIndex: clampQuestionSelectionIndex(request.defaultIndex ?? 0, request.options.length),
        resolve: (choice) => resolve(choice as T)
      });
    });

    questionController.setHandler(handler);
    return () => {
      questionController.setHandler(null);
    };
  }, [questionController]);

  return {
    activeQuestion,
    setActiveQuestion
  };
}
