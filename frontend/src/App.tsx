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
      mark: "nano-codin / terminal-native coding agent",
      sections: ["manifesto", "flow", "features", "start"],
      github: "GitHub",
    },
    hero: {
      eyebrow: "Quiet tools. Clear feedback.",
      title: "A coding agent that stays close to the terminal.",
      body:
        "Nano Codin is a production-minded coding agent CLI built with TypeScript, LangGraph, and a quiet terminal UI. It is designed to keep the loop visible, the tools explicit, and the work close to the repo you are actually touching.",
      primary: "Star on GitHub",
      secondary: "Read the manifesto",
      installLabel: "Quick start",
      note: "Made for developers who like a little more clarity in the loop.",
    },
    manifesto: {
      lead:
        "A lot of AI tooling aims to feel effortless. Nano Codin leans a little more toward visibility. The structure stays in view. The decisions remain readable. The work stays connected to the repo that matters.",
      statements: [
        {
          title: "Let the loop stay visible.",
          body:
            "Thought. Action. Observation. Verification. A working rhythm you can follow, inspect, and gradually learn to trust.",
        },
        {
          title: "Keep the architecture close to the hand.",
          body:
            "A focused TypeScript codebase, explicit tools, layered context, and a terminal-first surface that stays readable when the task gets real.",
        },
        {
          title: "Keep control near the operator.",
          body:
            "Sandbox policy, prompt layering, repo indexing, and delegated research all stay near the working surface, so the behavior feels easier to understand.",
        },
      ],
    },
    proof: {
      eyebrow: "Flow",
      title: "Built for real repo work, with a little more calm.",
      body:
        "The page is restrained, but the mechanics are doing real work underneath it: ReAct phases, repo-aware context, shell control, recovery, compression, and delegated subtask research.",
      bullets: [
        "LangGraph-powered single-agent loop",
        "Layered context from AGENTS.md and .nanocodin/",
        "Repo index cache for faster code understanding",
        "Sandbox-aware shell execution and recovery",
      ],
    },
    features: {
      eyebrow: "Capabilities",
      title: "A few useful ideas, kept concrete.",
      items: [
        {
          title: "Phase-aware execution",
          body:
            "Moves through discover, plan, execute, verify, and finalize with an operating rhythm that stays explicit from start to finish.",
        },
        {
          title: "Pluggable tool registry",
          body:
            "File system, editing, shell, and planning tools remain modular, inspectable, and straightforward to extend.",
        },
        {
          title: "Structured memory",
          body:
            "Context compression and session memory help the agent stay more coherent through longer tasks, with less repetition and drift.",
        },
        {
          title: "Provider flexibility",
          body:
            "Supports OpenAI-compatible and Anthropic-compatible APIs, including custom base URLs when that fits the stack better.",
        },
      ],
    },
    install: {
      eyebrow: "Start",
      title: "A small setup, and then you can begin.",
      steps: [
        "npm install -g nano-codin",
        "export MODEL_PROVIDER=openai",
        "export OPENAI_API_KEY=your_key",
        "nano-codin",
      ],
      body:
        "You can use it as a lightweight open-source coding companion, or read the architecture as a compact reference for building your own agent stack.",
    },
    cta: {
      title: "If the terminal is still where your thinking feels most natural, this project may feel familiar.",
      body:
        "Read the repo, follow the architecture, and try the CLI. If this approach resonates with you, a GitHub star would mean a lot.",
      primary: "Visit GitHub",
      secondary: "Copy install command",
    },
  },
  zh: {
    nav: {
      mark: "nano-codin / 终端原生 coding agent",
      sections: ["宣言", "流程", "能力", "开始"],
      github: "GitHub",
    },
    hero: {
      eyebrow: "安静一点，清楚一点。",
      title: "一个愿意贴近终端工作的 coding agent。",
      body:
        "Nano Codin 是一个偏 production-minded 的 Coding Agent CLI，基于 TypeScript、LangGraph 和安静克制的终端 UI 构建。它希望让循环保持可见、工具保持明确、工作始终贴着你真正正在修改的仓库发生。",
      primary: "去 GitHub Star",
      secondary: "阅读宣言",
      installLabel: "快速开始",
      note: "给希望在工作流里保留更多清晰感的开发者。",
    },
    manifesto: {
      lead:
        "很多 AI 工具希望把一切处理得足够顺滑。Nano Codin 则更偏向另一种感觉：让结构留在视野里，让决策依然可读，让执行始终贴着真正重要的仓库。",
      statements: [
        {
          title: "让循环留在视野里。",
          body:
            "Thought。Action。Observation。Verification。这是一种你可以跟随、检查、并慢慢建立信任的工作节奏。",
        },
        {
          title: "让架构贴近手边。",
          body:
            "聚焦的 TypeScript 代码库、显式工具、分层上下文，以及在任务变复杂时仍然可读的终端优先交互方式。",
        },
        {
          title: "让控制权留在操作者附近。",
          body:
            "Sandbox 策略、prompt layering、repo index、delegate research 都尽量靠近真实工作界面，让行为更容易理解，也更容易调整。",
        },
      ],
    },
    proof: {
      eyebrow: "流程",
      title: "为了真实仓库工作而设计，也尽量保持平静。",
      body:
        "页面语气比较克制，但底层机制是实打实在工作的：ReAct phases、repo-aware context、shell control、recovery、compression，以及委托式子任务研究。",
      bullets: [
        "基于 LangGraph 的单代理循环",
        "从 AGENTS.md 与 .nanocodin/ 分层读取上下文",
        "通过 repo index cache 加速代码理解",
        "具备 sandbox 感知的 shell 执行与恢复机制",
      ],
    },
    features: {
      eyebrow: "能力",
      title: "一些真正有用的能力，尽量说得具体。",
      items: [
        {
          title: "阶段感知执行",
          body:
            "以 discover、plan、execute、verify、finalize 的清晰节奏推进任务，从开始到结束都不失真。",
        },
        {
          title: "可插拔工具注册表",
          body:
            "文件系统、编辑、shell、planning 工具相互独立，容易检查，也比较容易沿着现有结构继续扩展。",
        },
        {
          title: "结构化记忆",
          body:
            "上下文压缩与 session memory 让它在更长任务里不那么容易失焦、重复或漂移。",
        },
        {
          title: "灵活的 provider 路由",
          body:
            "支持 OpenAI-compatible 与 Anthropic-compatible API，也允许在合适的时候接入自定义 base URL。",
        },
      ],
    },
    install: {
      eyebrow: "开始",
      title: "很小的准备，然后就可以开始。",
      steps: [
        "npm install -g nano-codin",
        "export MODEL_PROVIDER=openai",
        "export OPENAI_API_KEY=your_key",
        "nano-codin",
      ],
      body:
        "你可以把它当成一个轻量开源 coding companion 来使用，也可以把它当成一份紧凑、可研究、可改造的 agent architecture 参考实现。",
    },
    cta: {
      title: "如果终端仍然是你最自然的思考空间，这个项目也许会让你觉得熟悉。",
      body:
        "去读读仓库，顺着架构看一遍，亲手跑一下 CLI。如果这条方向也让你有共鸣，欢迎给它一个 Star。",
      primary: "访问 GitHub",
      secondary: "复制安装命令",
    },
  },
};

const terminalLines = [
  "$ nano-codin",
  "> inspect the repo and propose a 3-step plan",
  "",
  "[discover] reading AGENTS.md",
  "[discover] indexing src/ and tests/",
  "[plan] 1. inspect flow  2. patch files  3. verify build",
  "[execute] updated src/agent/reactLoop.ts",
  "[verify] npm run typecheck",
  "[finalize] summarized changes with file references",
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
