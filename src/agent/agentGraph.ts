import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type { ToolContext } from "../core/toolTypes.js";
import type { ModelProvider } from "../llm/modelRouter.js";
import {
  buildAgentExecutionSnapshot,
  buildAgentMessagesWithContext,
  formatExecutionStateForPrompt,
  parseAgentResponse,
  type AgentEvent,
  type AgentPhase
} from "./reactLoop.js";
import { ToolRegistry } from "../tools/registry.js";
import { createLangSmithRunnableConfig } from "../observability/langsmith.js";
import { CompressionManager } from "../services/compressionManager.js";
import { buildFinalSummary, classifyVerificationResult, isVerificationAction as isVerificationToolAction } from "../services/executionSummary.js";
import { RecoveryEngine } from "../services/recoveryEngine.js";
import type { RunSubtaskInput, SubtaskResult } from "../core/toolTypes.js";
import { buildToolHelp, canExecuteAction, inferPhaseForAction, isDelegationTool, isMutatingTool, isReadOnlyTool, isSummaryTool, isVerificationTool } from "../services/agentPolicy.js";

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
  }),
  latestVerification: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null
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
  private readonly readonlyTools: ToolRegistry;

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
    this.readonlyTools = new (this.tools.constructor as typeof ToolRegistry)(
      this.tools.list().filter((tool) => this.isReadOnlyTool(tool.name))
    );
    this.toolContext.runSubtask = this.runSubtask.bind(this);

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
    await this.restoreCheckpointIfNeeded(options.messages);
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
      recoveryHistory: [],
      latestVerification: null
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
        this.toolContext.sessionMemory
      );
      if (compressed.compressed && compressed.sessionMemory) {
        this.toolContext.sessionMemory = compressed.sessionMemory;
      }

      const messages = await buildAgentMessagesWithContext(
        state.messages,
        compressed.stepsForPrompt,
        this.tools.formatToolsForPrompt(),
        state.phase,
        this.toolContext.sessionMemory,
        this.toolContext.contextSources,
        formatExecutionStateForPrompt(this.toolContext.todos, state.latestVerification),
        buildToolHelp(this.tools.list(), state.phase)
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
      const summary = buildFinalSummary({
        sessionMemory: this.toolContext.sessionMemory,
        todos: this.toolContext.todos,
        subtasks: this.toolContext.todos.taskBundle.results,
        latestVerification: state.latestVerification
      });
      const finalAnswer = `${answer}\n\nExecution summary:\n${summary}`;
      await this.toolContext.checkpoint?.clear();

      this.onEvent?.({ type: "final", answer: finalAnswer });
      return {
        finalAnswer,
        pending_action: null,
        stepCount: state.stepCount + 1,
        phase: "finalize" as AgentPhase,
        phaseVisits: this.bumpPhaseVisit(state.phaseVisits, "finalize"),
        intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, phase: "finalize" }],
        messages: [{ role: "assistant", content: finalAnswer }]
      };
    }

    const pendingAction: ToolCall = {
      name: parsed.action,
      input: parsed.actionInput
    };

    this.onEvent?.({ type: "action", action: pendingAction });

    const nextPhase = this.inferPhase(state, pendingAction);
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

    const plannerHint = this.buildPlannerHintIfNeeded(state, nextPhase, pendingAction);
    if (plannerHint) {
      this.onEvent?.({ type: "observation", observation: plannerHint });
    }

    return {
      pending_action: pendingAction,
      phase: nextPhase,
      phaseVisits,
      stepCount: state.stepCount + 1,
      stepRecoveryCount: 0,
      messages: plannerHint ? [{ role: "tool", name: "planner_hint", content: `HINT: ${plannerHint}` }] : [],
      intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, action: pendingAction, phase: nextPhase }]
    };
  }

  private async toolsNode(state: AgentGraphState) {
    if (!state.pending_action) {
      return {};
    }

    let result;
    try {
      const gate = this.canExecuteAction(state.phase, state.pending_action);
      if (!gate.ok) {
        const blockedObservation = `ERROR: ${gate.reason}`;
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
    const latestVerification = this.isVerificationAction(state.pending_action)
      ? `${classifyVerificationResult(observation)}: ${observation.split("\n")[0]}`
      : state.latestVerification;

    this.updateVerificationState(state.pending_action, observation, result.ok);
    this.updateSessionMemoryFromAction(state.pending_action, observation);
    await this.maybeSaveCheckpoint(state.messages, state.pending_action, latestVerification);
    this.emitStateSnapshot(state.phase, latestVerification);

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
      latestVerification,
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

  private inferPhase(state: AgentGraphState, action: ToolCall): AgentPhase {
    const tool = this.tools.getToolByName(action.name);
    if (action.name === "todo") {
      const input = action.input as { operation?: unknown };
      const operation = typeof input?.operation === "string" ? input.operation : "";
      if (operation === "create_todo_list") {
        return "plan";
      }
      return "execute";
    }
    return inferPhaseForAction(state.phaseVisits, action, tool);
  }

  private buildPlannerHintIfNeeded(state: AgentGraphState, nextPhase: AgentPhase, action: ToolCall): string | null {
    if (action.name === "todo") {
      return null;
    }
    if (nextPhase !== "discover") {
      return null;
    }
    if (this.toolContext.todos.items.length > 0) {
      return null;
    }
    if ((state.phaseVisits.discover ?? 0) < 2) {
      return null;
    }
    return "Consider creating a todo plan with 1-3 items before further exploration.";
  }

  private isVerificationAction(action: ToolCall): boolean {
    const tool = this.tools.getToolByName(action.name);
    return isVerificationTool(tool) && isVerificationToolAction(action);
  }

  private canExecuteAction(phase: AgentPhase, action: ToolCall): { ok: boolean; reason?: string } {
    return canExecuteAction(phase, action, this.tools.getToolByName(action.name), this.toolContext.todos);
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

  private isReadOnlyTool(name: string): boolean {
    return isReadOnlyTool(this.tools.getToolByName(name));
  }

  private updateSessionMemoryFromAction(action: ToolCall, observation: string): void {
    const current = this.toolContext.sessionMemory ?? {
      goal: "Complete the current coding task.",
      decisions: [],
      touchedFiles: [],
      pendingVerification: [],
      failureNotes: [],
      nextAction: "Continue with the highest-priority open issue."
    };
    const input = action.input as { path?: unknown };
    if (typeof input.path === "string" && !current.touchedFiles.includes(input.path)) {
      current.touchedFiles = [...current.touchedFiles, input.path].slice(0, 20);
    }
    if (action.name === "todo" && this.toolContext.todos.verification.commands.length > 0) {
      current.pendingVerification = this.toolContext.todos.verification.commands.map((command) => `${this.toolContext.todos.verification.goal}: ${command}`);
    }
    if (/error|failed|exception/i.test(observation)) {
      current.failureNotes = [...current.failureNotes, observation.split("\n")[0]].slice(0, 8);
    }
    current.nextAction = isSummaryTool(this.tools.getToolByName(action.name))
      ? "Return a concise final answer with verification and residual risks."
      : "Continue based on the latest tool observation.";
    this.toolContext.sessionMemory = current;
  }

  private updateVerificationState(action: ToolCall, observation: string, ok: boolean): void {
    if (!this.isVerificationAction(action)) {
      return;
    }
    const input = action.input as { command?: unknown };
    const command = typeof input.command === "string" ? input.command : null;
    if (command && !this.toolContext.todos.verification.commands.includes(command)) {
      this.toolContext.todos.verification.commands = [...this.toolContext.todos.verification.commands, command];
    }
    this.toolContext.todos.verification.latestCommand = command;
    this.toolContext.todos.verification.latestSummary = observation.split("\n")[0] ?? observation;
    this.toolContext.todos.verification.status = ok ? "passed" : "failed";
  }

  private async maybeSaveCheckpoint(messages: Message[], action: ToolCall, latestVerification: string | null): Promise<void> {
    if (!this.toolContext.checkpoint) {
      return;
    }
    const tool = this.tools.getToolByName(action.name);
    if (!isMutatingTool(tool) && !isVerificationTool(tool) && !isSummaryTool(tool)) {
      return;
    }
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    await this.toolContext.checkpoint.save({
      task: latestUser?.content ?? this.toolContext.todos.taskBundle.primaryTask ?? "unknown task",
      updatedAt: Date.now(),
      sessionMemory: this.toolContext.sessionMemory,
      todos: this.toolContext.todos,
      latestVerification
    });
  }

  private async restoreCheckpointIfNeeded(messages: Message[]): Promise<void> {
    if (!this.toolContext.checkpoint) {
      return;
    }
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    const latestTask = latestUser?.content?.trim() ?? "";
    const checkpoint = await this.toolContext.checkpoint.load();
    if (!checkpoint) {
      return;
    }
    const shouldRestore = latestTask.toLowerCase() === "continue"
      || latestTask === checkpoint.task
      || latestTask.startsWith("continue ");
    if (!shouldRestore) {
      return;
    }
    this.toolContext.sessionMemory = checkpoint.sessionMemory;
    this.toolContext.todos = checkpoint.todos;
    this.emitStateSnapshot("plan", checkpoint.latestVerification);
  }

  private emitStateSnapshot(phase: AgentPhase, latestVerification: string | null): void {
    this.onEvent?.({
      type: "state",
      snapshot: buildAgentExecutionSnapshot(phase, this.toolContext.todos, this.toolContext.sessionMemory, latestVerification)
    });
  }

  private async runSubtask(input: RunSubtaskInput): Promise<SubtaskResult> {
    const subgraph = new CodingAgentGraph(
      this.model,
      this.readonlyTools,
      {
        ...this.toolContext,
        todos: {
          items: [],
          verification: {
            goal: "",
            commands: [],
            latestCommand: null,
            latestSummary: null,
            status: "pending"
          },
          taskBundle: { primaryTask: input.task, subtasks: [], results: [] }
        },
        commandLogs: [],
        sessionMemory: null,
        delegationDepth: (this.toolContext.delegationDepth ?? 0) + 1,
        runSubtask: undefined,
        checkpoint: undefined
      },
      Math.min(input.maxSteps ?? 4, 8),
      Math.max(8, Math.min(this.recursionLimit, 20))
    );
    const result = await subgraph.run({
      messages: [{ role: "user", content: input.task }]
    });
    const evidence = result.steps
      .map((step) => step.observation ?? "")
      .filter(Boolean)
      .slice(-3)
      .map((entry) => entry.split("\n")[0]);
    const touchedFiles = Array.from(new Set(
      result.steps
        .map((step) => {
          const actionInput = step.action?.input;
          if (actionInput && typeof actionInput === "object" && actionInput !== null && "path" in actionInput) {
            const pathValue = (actionInput as { path?: unknown }).path;
            return typeof pathValue === "string" ? pathValue : null;
          }
          return null;
        })
        .filter((value): value is string => Boolean(value))
    ));

    const status: SubtaskResult["status"] = result.finalAnswer.includes("Stopped after maxSteps=")
      ? "limit_reached"
      : evidence.length === 0
        ? "no_conclusion"
        : "success";
    return {
      id: `subtask-${Date.now().toString(36)}`,
      task: input.task,
      summary: result.finalAnswer.split("\n")[0] ?? "Subtask completed.",
      evidence,
      touchedFiles,
      nextActionSuggestion: status === "success"
        ? "Use the summarized evidence to continue the main task."
        : "Review the subtask output before relying on it.",
      status
    };
  }
}
