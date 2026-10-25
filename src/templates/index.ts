import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import type { Session } from "../session/types.js";

export interface TemplateOptions {
  helpers?: Record<string, Handlebars.HelperDelegate>;
  partials?: Record<string, string>;
}

/** Plain-text prompt rendering. Each renderer owns its helpers and partials. */
export function createTemplateRenderer(options: TemplateOptions = {}) {
  const engine = Handlebars.create();
  for (const [name, helper] of Object.entries(options.helpers ?? {})) engine.registerHelper(name, helper);
  for (const [name, partial] of Object.entries(options.partials ?? {})) engine.registerPartial(name, partial);
  return (source: string, data: object): string => engine.compile(source, { noEscape: true })(data);
}

/** An optional instructions adapter; editing the file takes effect on the next run. */
export function createTemplateInstructions(options: TemplateOptions & {
  file: string | URL;
  data?: (task: string, session: Session) => object | Promise<object>;
}) {
  const render = createTemplateRenderer(options);
  return async (task: string, session: Session): Promise<string> => {
    try {
      const source = await readFile(options.file, "utf8");
      const data = await options.data?.(task, session) ?? {};
      return render(source, { task, cwd: session.cwd, session, ...data });
    } catch (error) {
      throw new Error(`Prompt template ${String(options.file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
