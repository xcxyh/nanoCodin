import { useState } from "react";
import type { TerminalScenario } from "../content";
import { IconTerminal } from "./Icons";

interface Props {
  scenarios: TerminalScenario[];
}

export function TerminalShowcase({ scenarios }: Props) {
  const [activeId, setActiveId] = useState(scenarios[0]?.id ?? "verify");
  const current = scenarios.find((item) => item.id === activeId) ?? scenarios[0];

  return (
    <div className="terminal-card">
      <div className="terminal-chrome">
        <div className="terminal-dots" aria-hidden="true">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
        </div>
        <div className="terminal-tabs" role="tablist" aria-label="Terminal scenarios">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              role="tab"
              aria-selected={scenario.id === current.id}
              className={`terminal-tab ${scenario.id === current.id ? "is-active" : ""}`}
              onClick={() => setActiveId(scenario.id)}
              type="button"
            >
              {scenario.label}
            </button>
          ))}
        </div>
      </div>

      <div className="terminal-subbar">
        <span className="terminal-subbar-label">
          <IconTerminal size={13} />
          <span>{current.caption}</span>
        </span>
        <span className="terminal-live-pill">LIVE TRACE</span>
      </div>

      <div className="terminal-screen" key={current.id}>
        {current.lines.map((line, index) => (
          <div
            key={`${current.id}-${index}`}
            className={`t-line t-tone-${line.tone}`}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            {line.prefix ? <span className="t-prefix">{line.prefix}</span> : null}
            <span className="t-text">{line.text}</span>
            {line.tag ? <span className="t-tag">{line.tag}</span> : null}
          </div>
        ))}
      </div>

      <div className="terminal-footer">
        <span className="terminal-status-dot" aria-hidden="true" />
        <code>{current.footer}</code>
      </div>
    </div>
  );
}
