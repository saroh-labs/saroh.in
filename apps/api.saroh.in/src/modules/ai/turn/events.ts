import type { AiTurnOutcome } from "@saroh/database";

import type { AskAiRefusal } from "../access/refusal";

/**
 * What a turn tells the panel, in Saroh's words (DEC-220). The stream (U9)
 * writes these as server-sent events; nothing here carries money.
 */
export interface TurnUsageSummary {
    rounds: number;
    inputTokens: number;
    outputTokens: number;
}

/** Why a turn ended without an answer, as the panel words it. */
export type TurnErrorReason =
    /** Halted, the rollout switch off, the business switch off, or a setting missing. */
    | "unavailable"
    /** The provider failed; try again. */
    | "provider"
    /** A guard ended the turn before any answer (cost or token cap). */
    | "turn-limit"
    /** The model ended without saying anything. */
    | "no-answer";

export type TurnEvent =
    | { type: "status"; tool: string; words: string }
    | { type: "text-delta"; text: string }
    | { type: "card"; kind: string; data: Record<string, unknown> }
    | { type: "error"; reason: TurnErrorReason }
    /** Not asked (plan U7): nothing was sent and nothing counts. */
    | { type: "refused"; refusal: AskAiRefusal }
    | {
          type: "done";
          turnId: string;
          outcome: AiTurnOutcome;
          counted: boolean;
          usage: TurnUsageSummary;
      };
