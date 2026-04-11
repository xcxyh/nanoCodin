import {
  AskUserQuestionController,
  type AskUserQuestionRequest
} from "./askUserQuestion.js";

export type PermissionDecision = "allow" | "deny";
export type PermissionPromptChoice = "allow_once" | "allow_all" | "deny";

export interface PermissionRequest {
  toolName: string;
  input: unknown;
  reason?: string;
}

export class PermissionController {
  readonly questionController: AskUserQuestionController;
  allowAll = false;

  constructor(questionController = new AskUserQuestionController()) {
    this.questionController = questionController;
  }

  async request(request: PermissionRequest): Promise<PermissionDecision> {
    if (this.allowAll) {
      return "allow";
    }
    if (!this.questionController.hasHandler()) {
      return "allow";
    }
    const choice = await this.questionController.ask(buildPermissionQuestion(request));
    if (choice === "allow_all") {
      this.allowAll = true;
      return "allow";
    }
    if (choice === "allow_once") {
      return "allow";
    }
    return "deny";
  }
}

export function buildPermissionQuestion(request: PermissionRequest): AskUserQuestionRequest<PermissionPromptChoice> {
  const { toolName, input: toolInput } = request;
  const inputRecord = toolInput as Record<string, unknown>;
  const detailLabel = toolName === "bash" ? "Command" : "Target";
  const detailValue = toolName === "bash"
    ? String(inputRecord.command ?? "(unknown)")
    : String(inputRecord.path ?? "(unknown)");

  return {
    title: "Permission required",
    body: request.reason,
    details: [
      { label: "Tool", value: toolName },
      { label: detailLabel, value: detailValue }
    ],
    options: [
      { value: "allow_once", label: "Allow once", shortcutKey: "y" },
      { value: "allow_all", label: "Allow for session", shortcutKey: "a" },
      { value: "deny", label: "Deny", shortcutKey: "n" }
    ],
    defaultIndex: 0
  };
}
