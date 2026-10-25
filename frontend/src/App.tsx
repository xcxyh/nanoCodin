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
      eyebrow: "Small core. Typed tools. Your application.",
      title: "Read it. Customize it. Embed it.",
      body:
        "Nano Codin is a small TypeScript coding-agent Harness. Inject your model, tools and instructions, embed it in your application, or use the included terminal CLI.",
      primary: "Get Started",
      secondary: "See how it works",
      installLabel: "Install",
      note: "Embeddable API · Custom tools · Project skills",
    },
    manifesto: {
      lead:
        "One async loop connects your model and tools. Explicit interfaces let you change behavior, inspect results and build your own application around the same core.",
      statements: [
        {
          title: "See the loop.",
          body:
            "Request → Tool call → Result → Continue. Read the loop, inject a model, and follow actual execution events.",
        },
        {
          title: "Stay in control.",
          body:
            "Select the tools, supply interaction callbacks, and replace completion rules through beforeFinish.",
        },
        {
          title: "Extend with Skills.",
          body:
            "Load project rules and invoke skills when needed. Keep behavior instructions outside the execution loop.",
        },
      ],
    },
    proof: {
      eyebrow: "How it works",
      title: "Real capabilities, not magic.",
      body:
        "The core runs independently of the terminal UI, model providers and user config. Optional adapters add coding tools, project context and session storage.",
      bullets: [
        "createAgent({ model, tools, instructions })",
        "Typed tool schemas and replaceable models",
        "Bounded prompt history, retained session events",
        "Tool errors returned for correction",
        "Project rules and on-demand skills",
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
          title: "Project Context",
          body:
            "AGENTS.md rules, optional project notes and explicitly invoked skills are assembled outside the core.",
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
      eyebrow: "小核心。明确接口。自由扩展。",
      title: "读得懂，改得动，嵌入你的程序。",
      body:
        "Nano Codin 是一个精简的 TypeScript coding-agent Harness。注入自己的模型、工具和指令，嵌入程序，或直接使用配套终端 CLI。",
      primary: "立即开始",
      secondary: "了解原理",
      installLabel: "安装",
      note: "可嵌入 API · 自定义工具 · 项目 skills",
    },
    manifesto: {
      lead:
        "一个普通异步循环连接模型与工具。通过明确接口调整行为、检查执行结果，并把同一个核心接入自己的应用。",
      statements: [
        {
          title: "看见循环。",
          body:
            "请求 → 工具调用 → 执行结果 → 继续。可以直接阅读执行循环，注入模型，订阅真实事件。",
        },
        {
          title: "保持控制。",
          body:
            "选择工具、提供交互回调，并通过 beforeFinish 替换完成条件。",
        },
        {
          title: "用 Skills 扩展。",
          body:
            "加载项目规则，按需调用 skills。行为指令与通用执行循环分开维护。",
        },
      ],
    },
    proof: {
      eyebrow: "工作原理",
      title: "真实能力，不是魔法。",
      body:
        "核心可以独立于终端 UI、模型适配器和用户配置运行。按需组合 coding 工具、项目上下文与会话存储。",
      bullets: [
        "createAgent({ model, tools, instructions })",
        "工具 schema 校验，模型可替换",
        "有限 prompt 历史，保留会话事件",
        "工具错误返回给模型纠正",
        "项目规则与按需 skills",
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
          title: "项目上下文",
          body:
            "AGENTS.md 规则、可选项目说明与显式调用的 skills，由上下文适配器加载。",
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
  '$ nano-codin "fix the failing test"',
  "❯ fix the failing test",
  "",
  "✓ view src/math.ts",
  "✓ str_replace src/math.ts",
  "✓ bash npm test",
  "",
  "Fixed add(); npm test passed.",
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
              <span>Harness</span>
              <span>Typed Tools</span>
              <span>Skills</span>
              <span>Embeddable</span>
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
