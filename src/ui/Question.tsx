import React, { useState } from "react";
import { useInput } from "ink";
import { AskUserQuestionBox } from "./components/AskUserQuestionBox.js";
import type { AskUserQuestionRequest } from "../core/askUserQuestion.js";

export function Question({ request, choose }: { request: AskUserQuestionRequest; choose: (choice: string) => void }) {
  const [selected, setSelected] = useState(Math.max(0, Math.min(request.defaultIndex ?? 0, request.options.length - 1)));
  useInput((char, key) => {
    if (key.ctrl || key.meta || key.escape) return;
    if (key.upArrow) setSelected((index) => (index + request.options.length - 1) % request.options.length);
    else if (key.downArrow) setSelected((index) => (index + 1) % request.options.length);
    else if (key.return) choose(request.options[selected].value);
    else {
      const option = request.options.find((item) => item.shortcutKey?.toLowerCase() === char.toLowerCase());
      if (option) choose(option.value);
    }
  });
  return <AskUserQuestionBox request={request} selectedIndex={selected} />;
}
