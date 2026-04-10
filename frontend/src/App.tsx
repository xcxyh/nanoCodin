import { useEffect, useState } from "react";

type Locale = "en" | "zh";

type Copy = {
  nav: {
    mark: string;
    sections: string[];
    github: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    installLabel: string;
    note: string;
  };
  manifesto: {
    lead: string;
    statements: { title: string; body: string }[];
  };
  proof: {
    eyebrow: string;
    title: string;
    body: string;
    bullets: string[];
  };
  features: {
    eyebrow: string;
    title: string;
    items: { title: string; body: string }[];
  };
  install: {
    eyebrow: string;
    title: string;
    steps: string[];
    body: string;
  };
  cta: {
    title: string;
    body: string;
    primary: string;
    secondary: string;
  };
};

const repoUrl = "https://github.com/xcxyh/nanoCodin";

const copy: Record<Locale, Copy> = {
  en: {
    nav: {
      mark: "nano-codin",
      sections: ["manifesto", "flow", "features", "start"],
      github: "GitHub",
    },
    hero: {
      eyebrow: "Lightweight. Production-ready. Terminal-native.",
      title: "Your coding agent, visible and in control.",
      body:
        "Nano Codin is a TypeScript-based coding agent CLI with a ReAct loop you can follow, tools you can inspect, and a terminal UI that stays out of your way. Skills, phases, and sandbox policies—built for real work.",
      primary: "Get Started",
      secondary: "See how it works",
      installLabel: "Install",
      note: "v0.1.7 — Now with Skills & Slash Commands",
    },
    manifesto: {
      lead:
        "Most AI tools hide the process. Nano Codin makes it visible. Every thought, action, and observation stays in view—so you can understand, trust, and control what happens.",
      statements: [
        {
          title: "See the loop.",
          body:
            "Thought → Action → Observation → Verification. A clear rhythm you can follow, inspect, and debug. No black boxes.",
        },
        {
          title: "Stay in control.",
          body:
            "Sandbox policies (allow/ask/deny), phase-aware execution, and explicit tools. You decide what runs and when.",
        },
        {
          title: "Extend with Skills.",
          body:
            "New in v0.1.7: Define custom behaviors with Skills and slash commands. Extend the agent without touching core code.",
        },
      ],
    },
    proof: {
      eyebrow: "How it works",
      title: "Real capabilities, not magic.",
      body:
        "Under the hood: a ReAct loop with phase tracking, repo indexing for faster understanding, context compression for long tasks, and delegated research for complex problems.",
      bullets: [
        "Phase-aware: discover → plan → execute → verify → finalize",
        "Repo index cache for instant code navigation",
        "Token-threshold context compression",
        "Single-step error recovery",
        "Skills & slash commands (v0.1.7)",
      ],
    },
    features: {
      eyebrow: "Core features",
      title: "Everything you need, nothing you don't.",
      items: [
        {
          title: "ReAct Loop",
          body:
            "Structured tool calling with text fallback. Every step is logged, every decision traceable.",
        },
        {
          title: "Layered Context",
          body:
            "AGENTS.md guidelines, workspace context, and session memory. The agent knows your project.",
        },
        {
          title: "Sandbox Control",
          body:
            "Shell commands go through policy checks. Allow safe operations, ask for risky ones, deny the dangerous.",
        },
        {
          title: "Provider Flexibility",
          body:
            "OpenAI, Anthropic, or any compatible API. Custom base URLs supported. Your model, your choice.",
        },
      ],
    },
    install: {
      eyebrow: "Quick start",
      title: "Up and running in 30 seconds.",
      steps: [
        "npm install -g nano-codin",
        "nano-codin",
        "→ Enter your API key on first run",
        "→ Start coding",
      ],
      body:
        "Zero config needed. The CLI guides you through setup. Or clone the repo and customize everything.",
    },
    cta: {
      title: "Ready to code with clarity?",
      body:
        "Star the repo, try the CLI, or read the architecture. Built for developers who value visibility over magic.",
      primary: "Star on GitHub",
      secondary: "Copy install command",
    },
  },
  zh: {
    nav: {
      mark: "nano-codin",
      sections: ["宣言", "流程", "能力", "开始"],
      github: "GitHub",
    },
    hero: {
      eyebrow: "轻量。生产就绪。终端原生。",
      title: "看得见的 coding agent，掌控在你手中。",
      body:
        "Nano Codin 是一个基于 TypeScript 的 coding agent CLI。ReAct 循环清晰可见，工具可检查，终端 UI 不打扰。Skills、阶段执行、沙箱策略——为真实工作而生。",
      primary: "立即开始",
      secondary: "了解原理",
      installLabel: "安装",
      note: "v0.1.7 — 新增 Skills 与斜杠命令",
    },
    manifesto: {
      lead:
        "大多数 AI 工具隐藏过程。Nano Codin 让它可见。每一步思考、行动、观察都在视野中——你可以理解、信任、控制发生的一切。",
      statements: [
        {
          title: "看见循环。",
          body:
            "Thought → Action → Observation → Verification。清晰的节奏，可跟随、可检查、可调试。没有黑盒。",
        },
        {
          title: "保持控制。",
          body:
            "沙箱策略 (allow/ask/deny)、阶段感知执行、显式工具。你决定什么可以运行，什么时候需要确认。",
        },
        {
          title: "用 Skills 扩展。",
          body:
            "v0.1.7 新特性：用 Skills 和斜杠命令定义自定义行为。无需修改核心代码即可扩展 agent 能力。",
        },
      ],
    },
    proof: {
      eyebrow: "工作原理",
      title: "真实能力，不是魔法。",
      body:
        "底层是 ReAct 循环加阶段追踪、repo 索引加速理解、长任务的上下文压缩、复杂问题的委托研究。",
      bullets: [
        "阶段感知：discover → plan → execute → verify → finalize",
        "Repo 索引缓存，即时代码导航",
        "Token 阈值上下文压缩",
        "单步错误自动恢复",
        "Skills 与斜杠命令 (v0.1.7)",
      ],
    },
    features: {
      eyebrow: "核心能力",
      title: "你需要的一切，没有多余。",
      items: [
        {
          title: "ReAct 循环",
          body:
            "结构化工具调用，支持文本回退。每一步都有日志，每一个决策都可追溯。",
        },
        {
          title: "分层上下文",
          body:
            "AGENTS.md 指南、工作区上下文、会话记忆。Agent 了解你的项目。",
        },
        {
          title: "沙箱控制",
          body:
            "Shell 命令经过策略检查。安全操作自动允许，风险操作询问确认，危险操作直接拒绝。",
        },
        {
          title: "Provider 灵活性",
          body:
            "OpenAI、Anthropic 或任何兼容 API。支持自定义 base URL。你的模型，你做主。",
        },
      ],
    },
    install: {
      eyebrow: "快速开始",
      title: "30 秒启动。",
      steps: [
        "npm install -g nano-codin",
        "nano-codin",
        "→ 首次运行输入 API key",
        "→ 开始编码",
      ],
      body:
        "零配置。CLI 会引导你完成设置。或者克隆仓库，自定义一切。",
    },
    cta: {
      title: "准备好清晰编码了吗？",
      body:
        "Star 仓库，试用 CLI，或阅读架构。为重视可见性胜过魔法的开发者打造。",
      primary: "GitHub Star",
      secondary: "复制安装命令",
    },
  },
};

const terminalLines = [
  "$ nano-codin",
  "> add a new skill for generating API docs",
  "",
  "[discover] reading AGENTS.md and skill templates",
  "[discover] indexing src/tools/",
  "[plan] 1. create skill file  2. add prompts  3. test",
  "[execute] created .agents/skills/api-docs/SKILL.md",
  "[verify] skill loaded successfully",
  "[finalize] skill ready — use /api-docs to generate docs",
];

function App() {
  const [locale, setLocale] = useState<Locale>("en");

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
      { threshold: 0.18 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const t = copy[locale];

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="site-header">
        <a className="brand" href="#top">
          {t.nav.mark}
        </a>
        <div className="header-actions">
          <nav className="site-nav" aria-label="Primary">
            {t.nav.sections.map((section, index) => (
              <a key={section} href={sectionHref(index)}>
                {section}
              </a>
            ))}
          </nav>
          <div className="locale-toggle" role="tablist" aria-label="Language toggle">
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
          <a className="ghost-link" href={repoUrl} target="_blank" rel="noreferrer">
            {t.nav.github}
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{t.hero.eyebrow}</p>
            <h1>{t.hero.title}</h1>
            <p className="hero-body">{t.hero.body}</p>
            <div className="hero-actions">
              <a className="primary-button" href={repoUrl} target="_blank" rel="noreferrer">
                {t.hero.primary}
              </a>
              <a className="secondary-link" href="#manifesto">
                {t.hero.secondary}
              </a>
            </div>
            <div className="install-chip">
              <span>{t.hero.installLabel}</span>
              <code>npm install -g nano-codin</code>
            </div>
            <p className="hero-note">{t.hero.note}</p>
          </div>

          <div className="hero-terminal">
            <div className="terminal-window">
              <div className="terminal-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="terminal-body">
                {terminalLines.map((line) => (
                  <div key={line} className="terminal-line">
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="terminal-caption">
              <span>ReAct</span>
              <span>LangGraph</span>
              <span>Sandbox</span>
              <span>Delegate</span>
            </div>
          </div>
        </section>

        <section className="manifesto section reveal" data-reveal id="manifesto">
          <p className="section-lead">{t.manifesto.lead}</p>
          <div className="statement-list">
            {t.manifesto.statements.map((statement) => (
              <article key={statement.title} className="statement">
                <h2>{statement.title}</h2>
                <p>{statement.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="proof section reveal" data-reveal id="flow">
          <div className="section-heading">
            <p className="eyebrow">{t.proof.eyebrow}</p>
            <h2>{t.proof.title}</h2>
          </div>
          <div className="proof-grid">
            <p className="proof-body">{t.proof.body}</p>
            <ul className="proof-list">
              {t.proof.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="features section reveal" data-reveal id="features">
          <div className="section-heading">
            <p className="eyebrow">{t.features.eyebrow}</p>
            <h2>{t.features.title}</h2>
          </div>
          <div className="feature-rows">
            {t.features.items.map((item, index) => (
              <article key={item.title} className="feature-row">
                <span className="feature-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="install section reveal" data-reveal id="start">
          <div className="section-heading">
            <p className="eyebrow">{t.install.eyebrow}</p>
            <h2>{t.install.title}</h2>
          </div>
          <div className="install-layout">
            <div className="command-stack">
              {t.install.steps.map((step) => (
                <div key={step} className="command-line">
                  <span>$</span>
                  <code>{step}</code>
                </div>
              ))}
            </div>
            <p className="install-body">{t.install.body}</p>
          </div>
        </section>

        <section className="cta section reveal" data-reveal>
          <h2>{t.cta.title}</h2>
          <p>{t.cta.body}</p>
          <div className="hero-actions">
            <a className="primary-button" href={repoUrl} target="_blank" rel="noreferrer">
              {t.cta.primary}
            </a>
            <button
              className="secondary-button"
              onClick={() => navigator.clipboard.writeText("npm install -g nano-codin")}
              type="button"
            >
              {t.cta.secondary}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function sectionHref(index: number) {
  const ids = ["#manifesto", "#flow", "#features", "#start"];
  return ids[index] ?? "#top";
}

export default App;
