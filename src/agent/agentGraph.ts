import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type { ToolContext } from "../core/toolTypes.js";
import type { ModelProvider } from "../llm/modelRouter.js";
import { buildAgentMessagesWithContext, parseAgentResponse, type AgentEvent, type AgentPhase } from "./reactLoop.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createLangSmithRunnableConfig } from "../observability/langsmith.js";
import { CompressionManager } from "../services/compressionManager.js";
import { RecoveryEngine } from "../services/recoveryEngine.js";

const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  intermediate_steps: Annotation<AgentStep[]>({
    reducer: (_, right) => right,
    default: () => []
  }),
  pending_action: Annotation<ToolCall | null>({
    reducer: (_, right) => right,
    default: () => null
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null
  }),
  stepCount: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0
  }),
  phase: Annotation<AgentPhase>({
    reducer: (_, right) => right,
    default: () => "discover"
  }),
  phaseVisits: Annotation<Record<string, number>>({
    reducer: (_, right) => right,
    default: () => ({ discover: 0, plan: 0, execute: 0, verify: 0, finalize: 0 })
  }),
  requiresVerify: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false
  }),
  hasVerified: Annotation<boolean>({
    reducer: (_, right) => right,
    default: () => false
  }),
  stepRecoveryCount: Annotation<number>({
    reducer: (_, right) => right,
    default: () => 0
  }),
  recoverySignatures: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => []
  }),
  recoveryHistory: Annotation<string[]>({
    reducer: (_, right) => right,
    default: () => []
  })
});

type AgentGraphState = typeof AgentStateAnnotation.State;

export interface RunOptions {
  messages: Message[];
  onEvent?: (event: AgentEvent) => void;
}

export class CodingAgentGraph {
  private readonly graph;
  private onEvent?: (event: AgentEvent) => void;
  private readonly maxSteps: number;
  private readonly recursionLimit: number;
  private readonly compressionManager: CompressionManager;
  private readonly recoveryEngine: RecoveryEngine;

  constructor(
    private readonly model: ModelProvider,
    private readonly tools: ToolRegistry,
    private readonly toolContext: ToolContext,
    maxSteps: number = 12,
    recursionLimit?: number
  ) {
    this.maxSteps = maxSteps;
    this.recursionLimit = Math.max(recursionLimit ?? (maxSteps * 2 + 8), maxSteps + 2);
    this.compressionManager = new CompressionManager(this.toolContext.runtimeConfig.agent.compression);
    this.recoveryEngine = new RecoveryEngine(this.toolContext.runtimeConfig.recovery);

    const graphBuilder = new StateGraph(AgentStateAnnotation)
      .addNode("agent", this.agentNode.bind(this))
      .addNode("tools", this.toolsNode.bind(this))
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state) => {
        if (state.finalAnswer) {
          return END;
        }
        return "tools";
      })
      .addEdge("tools", "agent");

    this.graph = graphBuilder.compile();
  }

  async run(options: RunOptions): Promise<{ finalAnswer: string; steps: AgentStep[] }> {
    this.onEvent = options.onEvent;
    const input = {
      messages: options.messages,
      intermediate_steps: [],
      pending_action: null,
      finalAnswer: null,
      stepCount: 0,
      phase: "discover" as AgentPhase,
      phaseVisits: { discover: 0, plan: 0, execute: 0, verify: 0, finalize: 0 },
      requiresVerify: this.requiresVerify(options.messages),
      hasVerified: false,
      stepRecoveryCount: 0,
      recoverySignatures: [],
      recoveryHistory: []
    };

    const runnableConfig = createLangSmithRunnableConfig("coding-agent-run", {
      cwd: this.toolContext.cwd,
      maxSteps: this.maxSteps,
      recursionLimit: this.recursionLimit,
      initialMessageCount: options.messages.length
    });

    const invocationConfig: RunnableConfig = runnableConfig
      ? { ...runnableConfig, recursionLimit: this.recursionLimit }
      : { recursionLimit: this.recursionLimit };

    const result = await this.graph.invoke(input, invocationConfig);

    this.onEvent = undefined;

    return {
      finalAnswer: result.finalAnswer ?? "No final answer produced.",
      steps: result.intermediate_steps
    };
  }

  private async agentNode(state: AgentGraphState) {
    if (state.stepCount >= this.maxSteps) {
      const finalAnswer = this.buildFailureSummary(state);
      this.onEvent?.({ type: "error", error: finalAnswer });
      return {
        finalAnswer,
        stepCount: state.stepCount + 1
      };
    }

    let parsed: ReturnType<typeof parseAgentResponse>;
    let responseText = "";
    try {
      const compressed = this.compressionManager.maybeCompress(
        state.messages,
        state.intermediate_steps,
        this.toolContext.workingMemory
      );
      if (compressed.compressed && compressed.workingMemory) {
        this.toolContext.workingMemory = compressed.workingMemory;
      }

      const messages = await buildAgentMessagesWithContext(
        state.messages,
        compressed.stepsForPrompt,
        this.tools.formatToolsForPrompt(),
        state.phase,
        this.toolContext.workingMemory ? JSON.stringify(this.toolContext.workingMemory, null, 2) : null,
        this.toolContext.runtimeConfig.agentsGuidelines
      );
      const response = await this.model.generate(messages);
      responseText = response.text;
      parsed = parseAgentResponse(responseText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalAnswer = `Agent failed before selecting action: ${message}`;
      this.onEvent?.({ type: "error", error: finalAnswer });
      return {
        finalAnswer,
        pending_action: null,
        stepCount: state.stepCount + 1,
        intermediate_steps: [...state.intermediate_steps, { thought: "LLM call failed.", phase: state.phase }],
        messages: [{ role: "assistant", content: finalAnswer }]
      };
    }

    const actionName = parsed.action.toLowerCase();

    this.onEvent?.({ type: "thought", thought: parsed.thought });

    if (actionName === "final") {
      if (state.requiresVerify && !state.hasVerified) {
        const observation = "ERROR: Verification required before final answer. Run test/lint/typecheck or equivalent validation first.";
        this.onEvent?.({ type: "observation", observation });
        return {
          messages: [{ role: "tool", name: "verification_guard", content: observation }],
          stepCount: state.stepCount + 1,
          pending_action: null,
          phase: "verify" as AgentPhase,
          phaseVisits: this.bumpPhaseVisit(state.phaseVisits, "verify"),
          intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, observation, phase: "verify" }]
        };
      }

      const answer = typeof parsed.actionInput.answer === "string"
        ? parsed.actionInput.answer
        : responseText;

      this.onEvent?.({ type: "final", answer });
      return {
        finalAnswer: answer,
        pending_action: null,
        stepCount: state.stepCount + 1,
        phase: "finalize" as AgentPhase,
        phaseVisits: this.bumpPhaseVisit(state.phaseVisits, "finalize"),
        intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, phase: "finalize" }],
        messages: [{ role: "assistant", content: answer }]
      };
    }

    const pendingAction: ToolCall = {
      name: parsed.action,
      input: parsed.actionInput
    };

    this.onEvent?.({ type: "action", action: pendingAction });

    const nextPhase = this.inferPhase(state.phase, pendingAction);
    const phaseVisits = this.bumpPhaseVisit(state.phaseVisits, nextPhase);
    if (!this.withinPhaseBudget(phaseVisits)) {
      const finalAnswer = this.buildPhaseBudgetFailure(phaseVisits);
      this.onEvent?.({ type: "error", error: finalAnswer });
      return {
        finalAnswer,
        pending_action: null,
        stepCount: state.stepCount + 1
      };
    }

    return {
      pending_action: pendingAction,
      phase: nextPhase,
      phaseVisits,
      stepCount: state.stepCount + 1,
      stepRecoveryCount: 0,
      intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, action: pendingAction, phase: nextPhase }]
    };
  }

  private async toolsNode(state: AgentGraphState) {
    if (!state.pending_action) {
      return {};
    }

    let result;
    try {
      if (!this.canExecuteAction(state.pending_action)) {
        const blockedObservation = "ERROR: Plan gate requires todo.create_todo_list with 1-3 items before execute phase mutating actions.";
        this.onEvent?.({ type: "observation", observation: blockedObservation });
        return {
          messages: [{ role: "tool", name: state.pending_action.name, content: blockedObservation }],
          pending_action: null,
          phase: "plan" as AgentPhase,
          phaseVisits: this.bumpPhaseVisit(state.phaseVisits, "plan"),
          intermediate_steps: [
            ...state.intermediate_steps.slice(0, -1),
            {
              thought: state.intermediate_steps[state.intermediate_steps.length - 1]?.thought ?? "",
              action: state.pending_action,
              observation: blockedObservation,
              phase: "plan"
            }
          ]
        };
      }

      result = await this.tools.execute(
        state.pending_action.name,
        state.pending_action.input,
        this.toolContext
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const observation = `ERROR: Tool execution threw exception: ${message}`;
      this.onEvent?.({ type: "observation", observation });

      const latestStep = state.intermediate_steps[state.intermediate_steps.length - 1];
      const updatedStep: AgentStep = {
        thought: latestStep?.thought ?? "",
        action: state.pending_action,
        observation
      };

      return {
        messages: [{ role: "tool", name: state.pending_action.name, content: observation }],
        pending_action: null,
        stepRecoveryCount: state.stepRecoveryCount + 1,
        intermediate_steps: [...state.intermediate_steps.slice(0, -1), updatedStep]
      };
    }

    const observation = `${result.ok ? "OK" : "ERROR"}: ${result.output}`;
    this.onEvent?.({ type: "observation", observation });

    const toolMessage: Message = {
      role: "tool",
      name: state.pending_action.name,
      content: observation
    };

    const latestStep = state.intermediate_steps[state.intermediate_steps.length - 1];
    const updatedStep: AgentStep = {
      thought: latestStep?.thought ?? "",
      action: state.pending_action,
      observation
    };

    const hasVerified = this.isVerificationAction(state.pending_action) && result.ok
      ? true
      : state.hasVerified;

    if (!result.ok) {
      const recovered = await this.tryRecovery(state, observation);
      if (recovered) {
        return recovered;
      }
    }

    return {
      messages: [toolMessage],
      pending_action: null,
      hasVerified,
      intermediate_steps: [...state.intermediate_steps.slice(0, -1), updatedStep]
    };
  }

  private requiresVerify(messages: Message[]): boolean {
    const latestUser = [...messages].reverse().find((m) => m.role === "user");
    if (!latestUser) {
      return false;
    }
    const text = latestUser.content.toLowerCase();
    return this.toolContext.runtimeConfig.agent.verifyRequiredKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  private inferPhase(current: AgentPhase, action: ToolCall): AgentPhase {
    const actionName = action.name.toLowerCase();
    if (actionName === "todo") {
      return "plan";
    }
    if (actionName === "repo_index_query" || actionName === "tree" || actionName === "ls" || actionName === "grep" || actionName === "view") {
      return current === "plan" ? "execute" : "discover";
    }
    if (this.isVerificationAction(action)) {
      return "verify";
    }
    return "execute";
  }

  private isVerificationAction(action: ToolCall): boolean {
    if (action.name !== "bash") {
      return false;
    }
    const input = action.input as { command?: unknown };
    if (typeof input.command !== "string") {
      return false;
    }
    return /\b(test|lint|typecheck|build)\b/i.test(input.command);
  }

  private canExecuteAction(action: ToolCall): boolean {
    if (action.name === "todo" || action.name === "repo_index_query" || action.name === "ls" || action.name === "tree" || action.name === "grep" || action.name === "view") {
      return true;
    }
    const isMutating = action.name === "create" || action.name === "insert" || action.name === "str_replace";
    if (!isMutating) {
      return true;
    }
    const count = this.toolContext.todos.items.length;
    return count > 0 && count <= 3;
  }

  private bumpPhaseVisit(visits: Record<string, number>, phase: AgentPhase): Record<string, number> {
    return {
      ...visits,
      [phase]: (visits[phase] ?? 0) + 1
    };
  }

  private withinPhaseBudget(visits: Record<string, number>): boolean {
    const limits = this.toolContext.runtimeConfig.agent.phaseLimits;
    if ((visits.discover ?? 0) > limits.discover) {
      return false;
    }
    if ((visits.plan ?? 0) > limits.plan) {
      return false;
    }
    return ((visits.execute ?? 0) + (visits.verify ?? 0)) <= limits.executeVerify;
  }

  private buildPhaseBudgetFailure(visits: Record<string, number>): string {
    const limits = this.toolContext.runtimeConfig.agent.phaseLimits;
    return [
      "Stopped due to phase budget limit.",
      `Visits: discover=${visits.discover ?? 0}, plan=${visits.plan ?? 0}, execute=${visits.execute ?? 0}, verify=${visits.verify ?? 0}`,
      `Limits: discover<=${limits.discover}, plan<=${limits.plan}, execute+verify<=${limits.executeVerify}`
    ].join("\n");
  }

  private buildFailureSummary(state: AgentGraphState): string {
    const lastStep = state.intermediate_steps[state.intermediate_steps.length - 1];
    const recovery = state.recoveryHistory.length > 0 ? state.recoveryHistory.join(" | ") : "none";
    return [
      `Stopped after maxSteps=${this.maxSteps} without reaching final.`,
      `Current phase: ${state.phase}`,
      `Last action: ${lastStep?.action ? `${lastStep.action.name} ${JSON.stringify(lastStep.action.input)}` : "(none)"}`,
      `Last observation: ${lastStep?.observation ?? "(none)"}`,
      `Recovery Tried: ${recovery}`,
      "Suggested next step: inspect the last tool error and issue a narrower follow-up task."
    ].join("\n");
  }

  private async tryRecovery(state: AgentGraphState, observation: string) {
    const signature = this.recoveryEngine.createSignature(state.pending_action!, observation);
    const recent = state.recoverySignatures.slice(-this.toolContext.runtimeConfig.recovery.dedupeWindowSteps);
    if (!this.recoveryEngine.shouldAttempt(state.stepRecoveryCount, recent, signature)) {
      return null;
    }

    const attempt = this.recoveryEngine.suggest(state.pending_action!, observation);
    const updatedHistory = [...state.recoveryHistory, `${attempt.type}:${attempt.note}`];
    if (!attempt.action) {
      return {
        recoveryHistory: updatedHistory,
        recoverySignatures: [...state.recoverySignatures, attempt.signature]
      };
    }

    this.onEvent?.({ type: "observation", observation: `RECOVERY: ${attempt.note}` });
    const retryResult = await this.tools.execute(attempt.action.name, attempt.action.input, this.toolContext);
    const retryObservation = `${retryResult.ok ? "OK" : "ERROR"}: ${retryResult.output}`;
    this.onEvent?.({ type: "observation", observation: `RECOVERY RESULT: ${retryObservation}` });

    const latestStep = state.intermediate_steps[state.intermediate_steps.length - 1];
    const updatedStep: AgentStep = {
      thought: latestStep?.thought ?? "",
      action: attempt.action,
      observation: `${observation}\n\nRecovery Tried: ${attempt.note}\n${retryObservation}`,
      phase: latestStep?.phase
    };

    return {
      messages: [{ role: "tool", name: attempt.action.name, content: retryObservation }],
      pending_action: null,
      stepRecoveryCount: state.stepRecoveryCount + 1,
      hasVerified: this.isVerificationAction(attempt.action) && retryResult.ok ? true : state.hasVerified,
      recoveryHistory: updatedHistory,
      recoverySignatures: [...state.recoverySignatures, attempt.signature],
      intermediate_steps: [...state.intermediate_steps.slice(0, -1), updatedStep]
    };
  }
}
