export type TurnStatus = "final" | "error" | "cancelled";

export interface ActivityEntry {
  id: string;
  kind: "loading" | "thinking" | "tool" | "note" | "error";
  text: string;
  detail?: string;
  sourceTool?: string;
}

export interface CompletedTurn {
  id: string;
  user: string;
  result: string;
  status: TurnStatus;
}

export interface CurrentTurn {
  id: string;
  user: string;
  activity: ActivityEntry[];
  finalText: string | null;
}

export function createCurrentTurn(id: string, user: string): CurrentTurn {
  return {
    id,
    user,
    activity: [],
    finalText: null
  };
}

export function appendActivity(turn: CurrentTurn, entry: ActivityEntry): CurrentTurn {
  return {
    ...turn,
    activity: [...turn.activity, entry]
  };
}

export function setFinalText(turn: CurrentTurn, finalText: string): CurrentTurn {
  return {
    ...turn,
    finalText
  };
}

export function finalizeTurn(turn: CurrentTurn, result: string, status: TurnStatus): CompletedTurn {
  return {
    id: turn.id,
    user: turn.user,
    result,
    status
  };
}
