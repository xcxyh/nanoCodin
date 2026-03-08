import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AgentStep, Message, ToolCall } from "../core/messageTypes.js";
import type { ToolContext } from "../core/toolTypes.js";
import type { ModelProvider } from "../llm/modelRouter.js";
import { buildAgentMessages, parseAgentResponse, type AgentEvent } from "./reactLoop.js";
import type { ToolRegistry } from "../tools/registry.js";
import { createLangSmithRunnableConfig } from "../observability/langsmith.js";

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

  constructor(
    private readonly model: ModelProvider,
    private readonly tools: ToolRegistry,
    private readonly toolContext: ToolContext,
    private readonly maxSteps: number = 12
  ) {
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
      stepCount: 0
    };

    const runnableConfig = createLangSmithRunnableConfig("coding-agent-run", {
      cwd: this.toolContext.cwd,
      maxSteps: this.maxSteps,
      initialMessageCount: options.messages.length
    });

    const result = runnableConfig
      ? await this.graph.invoke(input, runnableConfig)
      : await this.graph.invoke(input);

    this.onEvent = undefined;

    return {
      finalAnswer: result.finalAnswer ?? "No final answer produced.",
      steps: result.intermediate_steps
    };
  }

  private async agentNode(state: AgentGraphState) {
    if (state.stepCount >= this.maxSteps) {
      const finalAnswer = `Stopped after maxSteps=${this.maxSteps} without reaching a final action.`;
      this.onEvent?.({ type: "error", error: finalAnswer });
      return {
        finalAnswer,
        stepCount: state.stepCount + 1
      };
    }

    let parsed: ReturnType<typeof parseAgentResponse>;
    let responseText = "";
    try {
      const messages = await buildAgentMessages(
        state.messages,
        state.intermediate_steps,
        this.tools.formatToolsForPrompt()
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
        intermediate_steps: [...state.intermediate_steps, { thought: "LLM call failed." }],
        messages: [{ role: "assistant", content: finalAnswer }]
      };
    }

    const actionName = parsed.action.toLowerCase();

    this.onEvent?.({ type: "thought", thought: parsed.thought });

    if (actionName === "final") {
      const answer = typeof parsed.actionInput.answer === "string"
        ? parsed.actionInput.answer
        : responseText;

      this.onEvent?.({ type: "final", answer });
      return {
        finalAnswer: answer,
        pending_action: null,
        stepCount: state.stepCount + 1,
        intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought }],
        messages: [{ role: "assistant", content: answer }]
      };
    }

    const pendingAction: ToolCall = {
      name: parsed.action,
      input: parsed.actionInput
    };

    this.onEvent?.({ type: "action", action: pendingAction });

    return {
      pending_action: pendingAction,
      stepCount: state.stepCount + 1,
      intermediate_steps: [...state.intermediate_steps, { thought: parsed.thought, action: pendingAction }]
    };
  }

  private async toolsNode(state: AgentGraphState) {
    if (!state.pending_action) {
      return {};
    }

    let result;
    try {
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

    return {
      messages: [toolMessage],
      pending_action: null,
      intermediate_steps: [...state.intermediate_steps.slice(0, -1), updatedStep]
    };
  }
}
