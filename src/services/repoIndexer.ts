import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepoIndexConfig } from "../core/runtimeConfig.js";
import type { RepoIndexEntry, RepoIndexProvider, RepoIndexQuery, RepoIndexSnapshot } from "../core/toolTypes.js";

interface PersistedRepoIndex {
  generatedAt: number;
  entries: RepoIndexEntry[];
}

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".txt", ".yml", ".yaml",
  ".toml", ".py", ".go", ".rs", ".java", ".rb", ".sh"
]);

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return "unknown";
  return ext.slice(1);
}

function scorePath(filePath: string): number {
  if (filePath.startsWith("src/")) return 4;
  if (filePath.startsWith("app/")) return 3;
  if (filePath.startsWith("lib/")) return 2;
  return 1;
}

function extractTopSymbols(lines: string[]): string[] {
  const symbols = new Set<string>();
  const patterns = [
    /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
    /^\s*(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
    /^\s*export\s+class\s+([A-Za-z0-9_]+)/,
    /^\s*class\s+([A-Za-z0-9_]+)/,
    /^\s*export\s+interface\s+([A-Za-z0-9_]+)/,
    /^\s*interface\s+([A-Za-z0-9_]+)/,
    /^\s*export\s+type\s+([A-Za-z0-9_]+)/,
    /^\s*export\s+const\s+([A-Za-z0-9_]+)/,
    /^\s*const\s+([A-Za-z0-9_]+)\s*=/
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        symbols.add(match[1]);
      }
    }
    if (symbols.size >= 12) {
      break;
    }
  }
  return [...symbols];
}

function extractImports(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+.*?from\s+["'](.+?)["']/);
    if (importMatch?.[1]) {
      out.add(importMatch[1]);
    }
    const requireMatch = line.match(/require\(["'](.+?)["']\)/);
    if (requireMatch?.[1]) {
      out.add(requireMatch[1]);
    }
    if (out.size >= 12) {
      break;
    }
  }
  return [...out];
}

function makeSummary(filePath: string, symbols: string[], imports: string[]): string {
  if (symbols.length > 0) {
    return `${path.basename(filePath)} exports/defines ${symbols.slice(0, 3).join(", ")}${symbols.length > 3 ? "..." : ""}.`;
  }
  if (imports.length > 0) {
    return `${path.basename(filePath)} imports ${imports.slice(0, 2).join(", ")}${imports.length > 2 ? "..." : ""}.`;
  }
  return `${path.basename(filePath)} source file.`;
}

export class RepoIndexer implements RepoIndexProvider {
  private entries = new Map<string, RepoIndexEntry>();
  private generatedAt = Date.now();
  private readonly indexPath: string;

  constructor(
    private readonly cwd: string,
    private readonly config: RepoIndexConfig
  ) {
    this.indexPath = path.join(this.cwd, ".nanocodin", "index.json");
  }

  async init(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    await this.loadFromDisk();
    await this.refreshIncremental();
  }

  snapshot(): RepoIndexSnapshot | null {
    if (!this.config.enabled) {
      return null;
    }
    return {
      generatedAt: this.generatedAt,
      entries: [...this.entries.values()]
    };
  }

  query(input: RepoIndexQuery): RepoIndexEntry[] {
    const entries = [...this.entries.values()];
    const pathPrefix = input.pathPrefix?.trim();
    const symbol = input.symbol?.trim().toLowerCase();
    const keyword = input.keyword?.trim().toLowerCase();
    const maxResults = Math.max(1, Math.min(200, input.maxResults ?? 30));

    const result = entries.filter((entry) => {
      if (pathPrefix && !entry.path.startsWith(pathPrefix)) {
        return false;
      }
      if (symbol && !entry.symbols.some((item) => item.toLowerCase().includes(symbol))) {
        return false;
      }
      if (keyword) {
        const haystack = `${entry.path}\n${entry.summary}\n${entry.symbols.join(" ")}\n${entry.imports.join(" ")}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    });

    return result
      .sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
      .slice(0, maxResults);
  }

  async refreshIncremental(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    const files = await this.collectFiles(this.cwd);
    const existing = new Set(this.entries.keys());

    for (const file of files) {
      const rel = path.relative(this.cwd, file);
      existing.delete(rel);
      const fileStat = await stat(file);
      const prev = this.entries.get(rel);
      if (prev && prev.mtimeMs === Math.floor(fileStat.mtimeMs)) {
        continue;
      }
      const next = await this.buildEntry(file, rel, Math.floor(fileStat.mtimeMs));
      if (next) {
        this.entries.set(rel, next);
      }
    }

    for (const removed of existing) {
      this.entries.delete(removed);
    }

    this.generatedAt = Date.now();
    this.enforceBudget();
    await this.persist();
  }

  private async loadFromDisk(): Promise<void> {
    if (!existsSync(this.indexPath)) {
      return;
    }
    try {
      const text = await readFile(this.indexPath, "utf8");
      const parsed = JSON.parse(text) as PersistedRepoIndex;
      if (!Array.isArray(parsed.entries)) {
        return;
      }
      for (const entry of parsed.entries) {
        if (!entry.path || typeof entry.path !== "string") {
          continue;
        }
        this.entries.set(entry.path, entry);
      }
      if (typeof parsed.generatedAt === "number") {
        this.generatedAt = parsed.generatedAt;
      }
    } catch {
      this.entries.clear();
    }
  }

  private async persist(): Promise<void> {
    const payload: PersistedRepoIndex = {
      generatedAt: this.generatedAt,
      entries: [...this.entries.values()]
    };
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private enforceBudget(): void {
    let list = [...this.entries.values()];
    const asJson = (items: RepoIndexEntry[]) => JSON.stringify({
      generatedAt: this.generatedAt,
      entries: items
    });

    if (Buffer.byteLength(asJson(list), "utf8") <= this.config.maxBytes) {
      return;
    }

    list = list.sort((a, b) => {
      const scoreDiff = scorePath(b.path) - scorePath(a.path);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return b.mtimeMs - a.mtimeMs;
    });

    while (list.length > 0 && Buffer.byteLength(asJson(list), "utf8") > this.config.maxBytes) {
      list.pop();
    }

    this.entries = new Map(list.map((item) => [item.path, item]));
  }

  private async collectFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (this.config.ignore.includes(entry.name)) {
        continue;
      }
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.collectFiles(full)));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext) || ext === "") {
          files.push(full);
        }
      }
    }
    return files;
  }

  private async buildEntry(absolutePath: string, relativePath: string, mtimeMs: number): Promise<RepoIndexEntry | null> {
    let text: string;
    try {
      text = await readFile(absolutePath, "utf8");
    } catch {
      return null;
    }
    const lines = text.split(/\r?\n/);
    const symbols = extractTopSymbols(lines);
    const imports = extractImports(lines);
    const summary = makeSummary(relativePath, symbols, imports);

    return {
      path: relativePath,
      lang: detectLanguage(relativePath),
      symbols,
      imports,
      summary,
      mtimeMs
    };
  }
}

