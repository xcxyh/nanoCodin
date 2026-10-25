import { describe, expect, it } from "vitest";
import { ConsoleInputBar } from "../../src/ui/components/ConsoleInputBar.js";
import { AskUserQuestionBox } from "../../src/ui/components/AskUserQuestionBox.js";
import { ConsoleHeader, BRAND_COLOR } from "../../src/ui/components/ConsoleHeader.js";
import { formatTotalTokenUsageText } from "../../src/ui/components/ConsoleFooter.js";

function text(node: any): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}
function highlighted(node: any, color: string): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((item) => highlighted(item, color));
  return [...(node.props?.backgroundColor === color ? [text(node)] : []), ...highlighted(node.props?.children, color)];
}
describe("retained presentation details", () => {
  it("keeps the selected file highlighted when the six-row window scrolls", () => {
    const files = Array.from({ length: 12 }, (_, i) => `file-${i}.ts`);
    const node = ConsoleInputBar({ input: "@", cursor: 1, busy: false, pickerFiles: files, pickerSelectedIndex: 10 });
    expect(highlighted(node, BRAND_COLOR).some((row) => row.includes("> file-10.ts"))).toBe(true);
    expect(text(node)).not.toContain("file-0.ts");
  });
  it("keeps yellow approval highlighting and command details", () => {
    const node = AskUserQuestionBox({ selectedIndex: 1, request: { title: "批准命令", details: [{ label: "Command", value: "npm test" }], options: [{ value: "once", label: "仅本次", shortcutKey: "y" }, { value: "all", label: "本次会话", shortcutKey: "a" }] } });
    expect(text(node)).toContain("Command: npm test");
    expect(highlighted(node, "yellow")).toContain("> 本次会话 [a]");
  });
  it("preserves the branded welcome and a compact ongoing-session header", () => {
    const props = { hint: "@ 文件选择", version: "test", modelName: "model", cwd: "/workspace" };
    expect(text(ConsoleHeader(props))).toContain("███");
    expect(text(ConsoleHeader({ ...props, compact: true }))).not.toContain("███");
    expect(text(ConsoleHeader({ ...props, compact: true }))).toContain("/workspace");
  });
  it("preserves token totals and usage source labels", () => {
    expect(formatTotalTokenUsageText(null)).toBe("0");
    expect(formatTotalTokenUsageText({ promptTokens: 1000, completionTokens: 250, totalTokens: 1250, source: "actual" })).toBe("1.25k");
    expect(formatTotalTokenUsageText({ promptTokens: 1000, completionTokens: 250, totalTokens: 1250, source: "mixed" })).toBe("1.25k (mixed)");
  });
});
