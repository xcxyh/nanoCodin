export type PermissionDecision = "allow" | "deny";
export type PermissionPromptChoice = "allow_once" | "allow_all" | "deny";

export interface PermissionRequest {
  toolName: string;
  input: unknown;
  reason?: string;
}

export type PermissionPromptHandler = (request: PermissionRequest) => Promise<PermissionPromptChoice>;

export class PermissionController {
  private promptHandler: PermissionPromptHandler | null = null;
  allowAll = false;

  setPromptHandler(handler: PermissionPromptHandler | null): void {
    this.promptHandler = handler;
  }

  async request(request: PermissionRequest): Promise<PermissionDecision> {
    if (this.allowAll) {
      return "allow";
    }
    if (!this.promptHandler) {
      return "allow";
    }
    const choice = await this.promptHandler(request);
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
