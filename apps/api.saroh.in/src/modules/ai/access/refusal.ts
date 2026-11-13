import type { Prisma } from "@saroh/database";

import type { MeterWindow } from "../../billing/metering";

/**
 * Why a question isn't asked (plan 2026-11-13-001 U7), in the order the
 * checks run. Nothing is sent to the provider and nothing counts; the
 * stream (U9) words each one for the panel.
 */
export type AskAiRefusal =
    /** Saroh halted every agent, or Ask AI isn't rolled out here, or a setting is missing. */
    | { reason: "unavailable" }
    /** The plan leaves Ask AI off; `upgradeTo` names the first plan with it ("" none). */
    | { reason: "locked"; upgradeTo: string }
    /** The person doesn't hold `ai:use`. */
    | { reason: "no-permission" }
    /** The business turned Ask AI off; `askName` is the owner to ask. */
    | { reason: "business-off"; askName: string | null }
    /**
     * This period's questions are used. `resetsAt` is the window's end.
     * Whoever may ask for more (`requestMore`) gets the button; anyone else
     * is told whom to ask (`askName`).
     */
    | {
          reason: "allowance";
          limit: number;
          resetsAt: Date;
          requestMore: boolean;
          askName: string | null;
      }
    /** The business's day (or Saroh's) has no room for another question's cost. */
    | { reason: "daily-limit"; scope: "business" | "saroh" }
    /** A question of the person's own is still running, or the business has as many as it may. */
    | { reason: "busy"; who: "you" | "business" }
    /** Too many questions in the last minute. */
    | { reason: "rate-limit" };

/** Checks a turn start runs on its own transaction, with the RUNNING row written after. */
export type TurnAdmit = (
    tx: Prisma.TransactionClient,
    window: MeterWindow & { zone: string },
) => Promise<AskAiRefusal | null>;
