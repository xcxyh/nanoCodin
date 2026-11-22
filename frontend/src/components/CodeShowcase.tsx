import { useState, type ReactNode } from "react";
import type { CodeExample } from "../content";
import { IconCheck, IconCopy } from "./Icons";

interface Props {
  examples: CodeExample[];
  copyLabel: string;
  copiedLabel: string;
}

const TOKEN_RE =
  /(\/\/[^\n]*|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b(?:import|from|const|async|await|return|new|true|false|null)\b|\b(?:createAgent|defineTool|createModelProvider|createDefaultTools|createTemplateInstructions|loadProjectContext|FileSessionStore|AbortController|requireVerification)\b|\b\d+(?:_\d+)*\b)/g;

const KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "async",
  "await",
  "return",
  "new",
  "true",
  "false",
  "null",
]);

function highlightLine(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    let cls = "tok-fn";
    if (token.startsWith("//")) cls = "tok-comment";
    else if (token.startsWith('"') || token.startsWith("`")) cls = "tok-string";
    else if (KEYWORDS.has(token)) cls = "tok-keyword";
    else if (/^\d/.test(token)) cls = "tok-number";

    nodes.push(
      <span key={`${match.index}-${token}`} className={cls}>
        {token}
      </span>,
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [" "];
}

export function CodeShowcase({ examples, copyLabel, copiedLabel }: Props) {
  const [activeId, setActiveId] = useState(examples[0]?.id ?? "minimal");
  const [copied, setCopied] = useState(false);

  const current = examples.find((item) => item.id === activeId) ?? examples[0];
  const lines = current.code.split("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard may be unavailable in restricted contexts. */
    }
  };

  return (
    <div className="code-window">
      <div className="code-toolbar">
        <div className="code-tabs" role="tablist" aria-label="SDK examples">
          {examples.map((example) => (
            <button
              key={example.id}
              role="tab"
              aria-selected={example.id === current.id}
              className={`code-tab ${example.id === current.id ? "is-active" : ""}`}
              onClick={() => {
                setActiveId(example.id);
                setCopied(false);
              }}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>
        <button className="copy-mini-btn" onClick={handleCopy} type="button">
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>

      <div className="code-meta">
        <code>{current.filename}</code>
        <span>{current.caption}</span>
      </div>

      <pre className="code-pre">
        <code>
          {lines.map((line, index) => (
            <div key={`${current.id}-${index}`} className="code-line">
              <span className="code-ln" aria-hidden="true">
                {index + 1}
              </span>
              <span className="code-text">{highlightLine(line)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
