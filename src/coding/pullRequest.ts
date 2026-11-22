import type { CommandEvidence } from "../agent/tools.js";
import { splitCommandList, splitSingleCommand } from "../tools/shellCommand.js";

type RepositoryAction = "commit" | "push" | "metadata" | "create" | "view" | "head" | "inspect";

export interface RepositoryCommand {
  action: RepositoryAction;
  words: string[];
}

function inWorkspace(command: string, cwd: string): string {
  const first = command.indexOf("&&");
  if (first < 0) return command.trim();
  const cd = splitSingleCommand(command.slice(0, first));
  if (cd?.length === 2 && cd[0] === "cd" && (cd[1] === cwd || cd[1] === ".")) return command.slice(first + 2).trim();
  return command.trim();
}

/** Verification scope only. Authorization still examines the original shell command. */
export function repositoryCommand(command: string, cwd: string): RepositoryCommand | undefined {
  const source = inWorkspace(command, cwd);
  const words = splitSingleCommand(source);
  if (words) return classify(words);
  // A chain of metadata operations still doesn't edit source. Its single exit
  // code cannot certify any particular commit, URL or SHA within the chain.
  const parts = splitCommandList(source);
  if (!parts || parts.length < 2) return;
  const operations = parts.map(part => classify(splitSingleCommand(part)));
  if (operations.some(op => !op)) return;
  const readsOnly = operations.every(op => op && ["inspect", "view", "head"].includes(op.action));
  return { action: readsOnly ? "inspect" : "metadata", words: [] };
}

function classify(words: string[] | null): RepositoryCommand | undefined {
  if (!words) return;
  const [bin, sub, arg] = words;
  let action: RepositoryAction;
  if (bin === "git") {
    if (sub === "rev-parse" && words.length === 3 && arg === "HEAD") action = "head";
    else if (sub === "commit") action = "commit";
    else if (sub === "push") action = "push";
    else if (["add", "fetch"].includes(sub) || (sub === "switch" && arg === "-c" && words.length === 4)) action = "metadata";
    else if (["log", "diff", "show"].includes(sub) && !words.some(word => /^--(?:output|ext-diff|textconv)(?:=|$)/.test(word))) action = "inspect";
    else if (["status", "rev-parse", "rev-list", "ls-remote", "remote", "branch"].includes(sub) &&
      (sub !== "remote" || arg === "-v") && (sub !== "branch" || arg === "--show-current")) action = "inspect";
    else return;
  } else if (bin === "gh" && sub === "pr") {
    if (arg === "create") action = "create";
    else if (arg === "view") action = "view";
    else if (arg === "list" || arg === "checks") action = "inspect";
    else return;
  } else return;
  return { action, words };
}

const fullOid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const prUrl = /^https:\/\/[\w.-]+(?::\d+)?\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/;
export function prCreationCommand(command: string, cwd: string) {
  // Older runs used heredocs and follow-up commands. Their URL is a lead for
  // readback only; a compound command's exit code cannot establish delivery.
  return /^gh\s+pr\s+create(?:\s|$)/.test(inWorkspace(command, cwd));
}

export function newDelivery(task = "") {
  const requested = task.split(/[,，。;；]|然后|并且|接着|\band\b/i).some(clause => {
    const directive = clause.trim().replace(/^(?:请|帮我|再|并|please\s+)+/i, "");
    return /^(?:提|提交|开|创建|新建|发起)\s*(?:一个|个)?\s*(?:github\s*)?(?:pr|mr|pull request)\b(?!\s*(?:的|按钮|流程|工具))|^(?:open|create|submit|raise)\s+(?:(?:a|the|an|github|new)\s+)*(?:pr|mr|pull request)\b(?!\s+(?:button|workflow|tool|command))/i.test(directive);
  });
  return {
    requested, commits: 0, url: "", created: false,
    localHead: "", prHead: "", state: "", lookupIssue: "",
    base: "", branch: "", observedBase: "", observedBranch: ""
  };
}
type Delivery = ReturnType<typeof newDelivery>;

export function invalidateHeads(delivery: Delivery) {
  delivery.localHead = "";
  delivery.prHead = "";
  delivery.lookupIssue = "";
}

export function recordDelivery(delivery: Delivery, op: RepositoryCommand | undefined, createAttempt: boolean, log: CommandEvidence, ok: boolean) {
  const stdout = log.stdout.trim();
  if (createAttempt) {
    delivery.requested = true;
    invalidateHeads(delivery);
    delivery.url = "";
    delivery.created = false;
    delivery.state = "";
    const args = op?.words ?? [];
    const option = (name: string, short: string) => {
      const index = args.findIndex(arg => arg === name || arg === short);
      return index >= 0 ? args[index + 1] ?? "" : args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1) ?? "";
    };
    delivery.base = option("--base", "-B");
    delivery.branch = option("--head", "-H").split(":").at(-1) ?? "";
    const firstLine = stdout.split(/\r?\n/, 1)[0];
    if (ok && prUrl.test(firstLine)) {
      delivery.url = firstLine;
      delivery.created = op?.action === "create";
    }
  } else if (op?.action === "commit" || op?.action === "push" || op?.action === "metadata") {
    invalidateHeads(delivery);
    if (ok && op.action === "commit" && !op.words.some(arg => ["--dry-run", "--help", "-h", "--short", "--porcelain", "--long"].includes(arg))) delivery.commits++;
  } else if (op?.action === "head") {
    delivery.localHead = ok && fullOid.test(stdout) ? stdout.toLowerCase() : "";
  } else if (op?.action === "view") {
    // Only the plain JSON view can establish the remote OID. Formatted text,
    // custom jq/templates and arbitrary command output are never receipts.
    const args = op.words.slice(3);
    const target = args[0]?.startsWith("--") ? undefined : args.shift();
    if (args.length !== 2 || args[0] !== "--json" || !args[1].split(",").includes("headRefOid")) return;
    delivery.prHead = "";
    delivery.lookupIssue = ok ? "PR 查询未返回可核对的 URL、状态和完整 HEAD。" : `PR 查询未成功（exit=${log.exitCode ?? "unknown"}）。`;
    if (!ok) return;
    let pr;
    try { pr = JSON.parse(stdout); } catch { return; }
    if (!pr || typeof pr.url !== "string" || !prUrl.test(pr.url) || (typeof pr.headRefOid !== "string" || !fullOid.test(pr.headRefOid)) ||
      !["OPEN", "CLOSED", "MERGED"].includes(pr.state)) return;
    if (target && prUrl.test(target) && pr.url !== target) return;
    if (target && /^\d+$/.test(target) && !pr.url.endsWith("/" + target)) return;
    if (delivery.url && pr.url !== delivery.url) {
      delivery.lookupIssue = `返回的 PR 与目标不一致，预期 ${delivery.url}，实际 ${pr.url}。`;
      return;
    }
    delivery.lookupIssue = "";
    delivery.url = pr.url;
    delivery.prHead = pr.headRefOid.toLowerCase();
    delivery.state = pr.state;
    delivery.observedBase = pr.baseRefName ?? "";
    delivery.observedBranch = pr.headRefName ?? "";
  }
}

export function deliveryIssue(d: Delivery): string | undefined {
  if (!d.requested) return;
  const query = `gh pr view${d.url ? " " + d.url : ""} --json url,state,headRefOid,baseRefName,headRefName`;
  if (!d.prHead) return `PR 交付待核对：${d.lookupIssue}请单独运行 git rev-parse HEAD 和 ${query}，取得本地与 PR 的完整提交号。`;
  if (d.state !== "OPEN") return `PR 当前状态为 ${d.state}，请确认目标 PR。核对命令：${query}`;
  if ((d.base && d.base !== d.observedBase) || (d.branch && d.branch !== d.observedBranch)) {
    return `PR 分支待核对：目标为 ${d.base || "默认基线"} ← ${d.branch || "当前分支"}，查询返回 ${d.observedBase || "未知"} ← ${d.observedBranch || "未知"}。请核对 ${query}。`;
  }
  if (!d.localHead) return "请单独运行 git rev-parse HEAD，核对本地完整提交号。";
  if (d.prHead !== d.localHead) return `HEAD 不一致：本地 ${d.localHead}，PR ${d.prHead}。请核对推送的分支后重新读取两端 HEAD。`;
}

export function deliveryFacts(d: Delivery) {
  const facts: string[] = [];
  if (d.commits) facts.push(`成功执行 ${d.commits} 次 git commit。`);
  if (d.url) facts.push(`${d.created ? "已创建 PR" : "已取得 PR 链接"}：${d.url}`);
  if (d.requested && d.prHead && !deliveryIssue(d)) facts.push(`已确认 PR 为 OPEN，本地与 PR 的 HEAD 均为 ${d.prHead}。`);
  return facts;
}
