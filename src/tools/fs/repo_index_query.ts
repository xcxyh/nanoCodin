import { z } from "zod";
import type { Tool } from "../../core/toolTypes.js";

const schema = z.object({
  pathPrefix: z.string().optional(),
  symbol: z.string().optional(),
  keyword: z.string().optional(),
  maxResults: z.number().int().min(1).max(200).optional()
});

type Input = z.infer<typeof schema>;

export const repoIndexQueryTool: Tool<Input> = {
  name: "repo_index_query",
  description: "Query cached repository index by path prefix, symbol, or keyword",
  schema,
  execute: async (input, context) => {
    const snapshot = context.repoIndex.snapshot();
    if (!snapshot) {
      return { ok: false, output: "Repo index is disabled or unavailable. Fallback to tree/grep/view." };
    }
    const hits = context.repoIndex.query(input);
    if (hits.length === 0) {
      return { ok: true, output: "No index matches found." };
    }

    const lines = hits.map((entry) => {
      const symbols = entry.symbols.slice(0, 4).join(", ") || "(none)";
      return `${entry.path} | lang=${entry.lang} | symbols=${symbols} | summary=${entry.summary}`;
    });
    return {
      ok: true,
      output: [
        `index_generated_at=${new Date(snapshot.generatedAt).toISOString()}`,
        ...lines
      ].join("\n")
    };
  }
};

