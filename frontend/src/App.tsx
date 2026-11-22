import { useEffect, useState } from "react";
import {
  ARCH_DOC_URL,
  CONTENT,
  REPO_URL,
  VERSION,
  type EngineeringFeature,
  type Locale,
} from "./content";
import { ArchitectureExplorer } from "./components/ArchitectureExplorer";
import { CodeShowcase } from "./components/CodeShowcase";
import { TerminalShowcase } from "./components/TerminalShowcase";
import {
  IconArrowRight,
  IconCheck,
  IconCheckBadge,
  IconCopy,
  IconCpu,
  IconDatabase,
  IconFileCode,
  IconGitHub,
  IconLayers,
  IconShield,
  IconSpark,
  IconTerminal,
} from "./components/Icons";

const INSTALL_CMD = "npm install -g nano-codin";

function detectInitialLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return "en";
}

function FeatureIcon({ kind }: { kind: EngineeringFeature["icon"] }) {
  switch (kind) {
    case "cpu":
      return <IconCpu size={18} />;
    case "layers":
      return <IconLayers size={18} />;
    case "file":
      return <IconFileCode size={18} />;
    case "shield":
      return <IconShield size={18} />;
    case "database":
      return <IconDatabase size={18} />;
    case "check":
      return <IconCheckBadge size={18} />;
    case "spark":
      return <IconSpark size={18} />;
  }
}

function App() {
  const [locale, setLocale] = useState<Locale>(detectInitialLocale);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver === "undefined") {
      sections.forEach((section) => section.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.04, rootMargin: "0px 0px -16px 0px" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      /* Clipboard may be unavailable in restricted contexts. */
    }
  };

  const t = CONTENT[locale];

  return (
    <div className="page-shell">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow-top" aria-hidden="true" />
      <div className="bg-glow bg-glow-mid" aria-hidden="true" />

      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <IconTerminal size={15} />
            </span>
            <span className="brand-name">nano-codin</span>
            <span className="brand-version">{VERSION}</span>
          </a>

          <nav className="site-nav" aria-label="Primary">
            <a href="#architecture">{t.nav.architecture}</a>
            <a href="#engineering">{t.nav.engineering}</a>
            <a href="#cli">{t.nav.cli}</a>
            <a href="#sdk">{t.nav.sdk}</a>
          </nav>

          <div className="header-actions">
            <div className="locale-toggle" role="tablist" aria-label="Language">
              <button
                className={locale === "en" ? "active" : ""}
                onClick={() => setLocale("en")}
                type="button"
              >
                EN
              </button>
              <button
                className={locale === "zh" ? "active" : ""}
                onClick={() => setLocale("zh")}
                type="button"
              >
                中文
              </button>
            </div>
            <a className="github-pill" href={REPO_URL} target="_blank" rel="noreferrer">
              <IconGitHub size={15} />
              <span>{t.nav.github}</span>
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero container">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="hero-badge">
                <span className="badge-pulse" aria-hidden="true" />
                <span>{t.hero.badge}</span>
              </div>

              <h1 className="hero-title">
                <span>{t.hero.titleLine1}</span>
                <span className="hero-title-accent">{t.hero.titleLine2}</span>
              </h1>

              <p className="hero-subtitle">{t.hero.subtitle}</p>

              <div className="hero-cta-row">
                <a className="btn-primary" href="#cli">
                  <span>{t.hero.primaryCta}</span>
                  <IconArrowRight size={16} />
                </a>
                <a className="btn-secondary" href={REPO_URL} target="_blank" rel="noreferrer">
                  <IconGitHub size={16} />
                  <span>{t.hero.secondaryCta}</span>
                </a>
              </div>

              <div className="install-bar">
                <span className="install-prompt" aria-hidden="true">
                  $
                </span>
                <code>{INSTALL_CMD}</code>
                <button
                  className="install-copy-btn"
                  onClick={() => copyText("hero-install", INSTALL_CMD)}
                  type="button"
                >
                  {copiedKey === "hero-install" ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  <span>{copiedKey === "hero-install" ? t.hero.copied : t.hero.copy}</span>
                </button>
              </div>
            </div>

            <div className="hero-showcase">
              <TerminalShowcase scenarios={t.scenarios} />
            </div>
          </div>

          <div className="stats-strip">
            {t.hero.stats.map((stat) => (
              <div key={stat.label} className="stat-item">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ARCHITECTURE */}
        <section className="section container reveal" data-reveal id="architecture">
          <div className="section-head">
            <p className="eyebrow">{t.architecture.eyebrow}</p>
            <h2>{t.architecture.title}</h2>
            <p className="section-subtitle">{t.architecture.subtitle}</p>
          </div>
          <ArchitectureExplorer data={t.architecture} />
        </section>

        {/* ENGINEERING BENTO GRID */}
        <section className="section container reveal" data-reveal id="engineering">
          <div className="section-head">
            <p className="eyebrow">{t.engineering.eyebrow}</p>
            <h2>{t.engineering.title}</h2>
            <p className="section-subtitle">{t.engineering.subtitle}</p>
          </div>

          <div className="bento-grid">
            {t.engineering.features.map((feature) => (
              <article
                key={feature.id}
                className={`bento-card accent-${feature.accent} ${feature.span === "wide" ? "bento-wide" : ""}`}
              >
                <div className="bento-card-head">
                  <span className="bento-icon">
                    <FeatureIcon kind={feature.icon} />
                  </span>
                  <span className="bento-badge">{feature.badge}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <div className="bento-metrics">
                  {feature.metrics.map((metric) => (
                    <span key={metric} className="metric-chip">
                      {metric}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* DESIGN PHILOSOPHY COMPARISON */}
        <section className="section container reveal" data-reveal>
          <div className="section-head">
            <p className="eyebrow">{t.comparison.eyebrow}</p>
            <h2>{t.comparison.title}</h2>
            <p className="section-subtitle">{t.comparison.subtitle}</p>
          </div>

          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>{t.comparison.colDimension}</th>
                  <th className="col-nano">{t.comparison.colNano}</th>
                  <th className="col-heavy">{t.comparison.colHeavy}</th>
                </tr>
              </thead>
              <tbody>
                {t.comparison.rows.map((row) => (
                  <tr key={row.dimension}>
                    <td className="cell-dim">{row.dimension}</td>
                    <td className="cell-nano">
                      <span className="cell-check" aria-hidden="true">
                        <IconCheck size={14} />
                      </span>
                      <span>{row.nano}</span>
                    </td>
                    <td className="cell-heavy">{row.heavy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CLI & TUI QUICK START */}
        <section className="section container reveal" data-reveal id="cli">
          <div className="section-head">
            <p className="eyebrow">{t.cli.eyebrow}</p>
            <h2>{t.cli.title}</h2>
            <p className="section-subtitle">{t.cli.subtitle}</p>
          </div>

          <div className="cli-grid">
            <div className="cli-panel">
              <h3>{t.cli.commandsTitle}</h3>
              <div className="cli-cmd-list">
                {t.cli.commands.map((item) => {
                  const isCopied = copiedKey === item.cmd;
                  return (
                    <div key={item.cmd} className="cli-cmd-row">
                      <div className="cli-cmd-main">
                        <div className="cli-cmd-code">
                          <span className="cli-dollar" aria-hidden="true">
                            $
                          </span>
                          <code>{item.cmd}</code>
                        </div>
                        <p>{item.desc}</p>
                      </div>
                      <button
                        className="icon-copy-btn"
                        aria-label={`Copy ${item.cmd}`}
                        onClick={() => copyText(item.cmd, item.cmd)}
                        type="button"
                      >
                        {isCopied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="cli-side">
              <div className="cli-panel">
                <h3>{t.cli.shortcutsTitle}</h3>
                <ul className="shortcut-list">
                  {t.cli.shortcuts.map((shortcut) => (
                    <li key={shortcut.keys}>
                      <kbd>{shortcut.keys}</kbd>
                      <span>{shortcut.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="cli-panel exit-panel">
                <h3>{t.cli.exitCodesTitle}</h3>
                <div className="exit-grid">
                  {t.cli.exitCodes.map((exitItem) => (
                    <div key={exitItem.code} className="exit-chip">
                      <code>{exitItem.code}</code>
                      <span>{exitItem.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EMBEDDABLE SDK */}
        <section className="section container reveal" data-reveal id="sdk">
          <div className="section-head">
            <p className="eyebrow">{t.sdk.eyebrow}</p>
            <h2>{t.sdk.title}</h2>
            <p className="section-subtitle">{t.sdk.subtitle}</p>
          </div>

          <div className="sdk-layout">
            <div className="sdk-code-col">
              <CodeShowcase
                examples={t.sdk.examples}
                copyLabel={t.hero.copy}
                copiedLabel={t.hero.copied}
              />
            </div>

            <aside className="sdk-points-col">
              <div className="points-card">
                <h3>{t.sdk.extensionPointsTitle}</h3>
                <ul className="points-list">
                  {t.sdk.extensionPoints.map((point) => (
                    <li key={point.name}>
                      <code>{point.name}</code>
                      <span>{point.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section container reveal" data-reveal>
          <div className="cta-box">
            <p className="eyebrow">{t.cta.eyebrow}</p>
            <h2>{t.cta.title}</h2>
            <p className="cta-subtitle">{t.cta.subtitle}</p>
            <div className="cta-actions">
              <a className="btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
                <IconGitHub size={16} />
                <span>{t.cta.primary}</span>
              </a>
              <button
                className="btn-secondary"
                onClick={() => copyText("cta-install", INSTALL_CMD)}
                type="button"
              >
                {copiedKey === "cta-install" ? <IconCheck size={15} /> : <IconCopy size={15} />}
                <span>{copiedKey === "cta-install" ? t.cta.copied : t.cta.secondary}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer container">
        <span>{t.cta.footerNote}</span>
        <div className="footer-links">
          <a href={ARCH_DOC_URL} target="_blank" rel="noreferrer">
            ARCHITECTURE.md
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
