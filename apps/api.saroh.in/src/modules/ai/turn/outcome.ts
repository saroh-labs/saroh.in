import type { AiTurnOutcome } from "@saroh/database";

/**
 * Whether a turn counts against the business's questions (DEC-220, spec
 * §3.3), decided once, server-side, from how it ended. One row per outcome;
 * `outcome.spec.ts` holds each row.
 */
export const OUTCOME_COUNTED: Readonly<Record<AiTurnOutcome, boolean>> = {
    /** Still going (or never finished: the stuck-turn sweep fails it). */
    RUNNING: false,
    ANSWERED: true,
    /** Ended with a draft card to confirm. */
    DRAFT: true,
    /** Stop pressed before any answer text. */
    STOPPED_BEFORE: false,
    /** Stop pressed after the answer began: the person got part of it. */
    STOPPED_AFTER: true,
    /** Failed (or unavailable) before any answer text. */
    FAILED: false,
    /** The provider failed after the answer began. */
    CUT_OFF: false,
    /** Refused at the door: the business's day is spent (U7). */
    DAILY_LIMIT: false,
    /** Answered that the person may not see what they asked about. */
    NO_ACCESS: true,
};

export const isCounted = (outcome: AiTurnOutcome) => OUTCOME_COUNTED[outcome];
