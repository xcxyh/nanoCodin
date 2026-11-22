import { useState } from "react";
import type { LandingCopy } from "../content";
import { IconArrowRight, IconLayers } from "./Icons";

interface Props {
  data: LandingCopy["architecture"];
}

export function ArchitectureExplorer({ data }: Props) {
  const [selectedLayerId, setSelectedLayerId] = useState(data.layers[0]?.id ?? "core");
  const activeLayer = data.layers.find((layer) => layer.id === selectedLayerId) ?? data.layers[0];

  return (
    <div className="arch-container">
      {/* Event Sourcing Ribbon */}
      <div className="es-banner">
        <div className="es-source">
          <div className="es-head">
            <span className="es-icon">
              <IconLayers size={16} />
            </span>
            <h3>{data.sourceOfTruthTitle}</h3>
          </div>
          <p>{data.sourceOfTruthBody}</p>
          <div className="es-events" aria-label="Event types">
            {data.eventTags.map((tag) => (
              <code key={tag} className="event-pill">
                {tag}
              </code>
            ))}
          </div>
        </div>

        <div className="es-arrow" aria-hidden="true">
          <IconArrowRight size={20} />
        </div>

        <div className="es-projections">
          <span className="es-proj-label">{data.projectionsLabel}</span>
          <div className="es-proj-grid">
            {data.projections.map((item) => (
              <div key={item} className="es-proj-chip">
                <span className="es-proj-dot" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Layer Stack + Inspector */}
      <div className="arch-split">
        <div className="arch-stack" role="tablist" aria-label="Architecture layers">
          {data.layers.map((layer, index) => {
            const selected = layer.id === activeLayer.id;
            return (
              <button
                key={layer.id}
                role="tab"
                aria-selected={selected}
                className={`arch-layer-btn accent-${layer.accent} ${selected ? "is-selected" : ""}`}
                onClick={() => setSelectedLayerId(layer.id)}
                type="button"
              >
                <div className="arch-layer-top">
                  <span className="arch-layer-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="arch-layer-badge">{layer.badge}</span>
                </div>
                <strong>{layer.title}</strong>
                <code>{layer.files}</code>
              </button>
            );
          })}
        </div>

        <div className={`arch-inspector accent-${activeLayer.accent}`} key={activeLayer.id}>
          <div className="arch-inspector-head">
            <span className="arch-inspector-badge">{activeLayer.badge}</span>
            <code className="arch-inspector-files">{activeLayer.files}</code>
          </div>
          <h3>{activeLayer.title}</h3>
          <p className="arch-inspector-summary">{activeLayer.summary}</p>
          <ul className="arch-inspector-list">
            {activeLayer.details.map((detail) => (
              <li key={detail}>
                <span className="arch-bullet" aria-hidden="true" />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 6 Subpath Exports */}
      <div className="exports-panel">
        <div className="exports-head">
          <div>
            <h3>{data.exportsTitle}</h3>
            <p>{data.exportsSubtitle}</p>
          </div>
          <code className="exports-tag">package.json#exports</code>
        </div>
        <div className="exports-grid">
          {data.exports.map((entry) => (
            <div key={entry.subpath} className="export-card">
              <div className="export-card-top">
                <code className="export-path">{entry.subpath}</code>
                <span className="export-role">{entry.role}</span>
              </div>
              <p>{entry.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
