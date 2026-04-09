import { useEffect, useState } from "react";
import type { PermissionController, PermissionPromptChoice, PermissionRequest } from "../../core/permission.js";

export interface PermissionPromptState {
  request: PermissionRequest;
  resolve: (choice: PermissionPromptChoice) => void;
}

export function usePermissionPrompt(permissionController: PermissionController) {
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptState | null>(null);

  useEffect(() => {
    const handler = async (request: PermissionRequest) => new Promise<PermissionPromptChoice>((resolve) => {
      setPermissionPrompt({ request, resolve });
    });

    permissionController.setPromptHandler(handler);
    return () => {
      permissionController.setPromptHandler(null);
    };
  }, [permissionController]);

  return {
    permissionPrompt,
    setPermissionPrompt
  };
}
