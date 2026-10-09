import type { PausesWords } from "./billing-emails";
import type { PlanEndingStage } from "./plan-ending";
import { PLAN_ENDING_NOTICE_DAYS } from "./plan-ending";

/** What a `billing.email` job carries (`billing-email.job.ts`). */
export type BillingEmailPayload =
    | { kind: "INVOICE"; organizationId: string; invoiceId: string }
    | {
          kind: "PAYMENT_FAILED";
          organizationId: string;
          subscriptionId: string;
          /** The provider event that said so: one email per event. */
          eventKey: string;
          /** The provider gave up and the business is on Free. */
          final: boolean;
      }
    | {
          kind: "TRIAL_ENDING";
          organizationId: string;
          subscriptionId: string;
          /** When the trial ends, ISO: one email per trial end. */
          endsAt: string;
      }
    | {
          kind: "PLAN_ENDING";
          organizationId: string;
          /** The `plan` override that ends. */
          overrideId: string;
          /** Its end, ISO: one email per end and stage. */
          endsAt: string;
          stage: PlanEndingStage;
          planName: string;
          nextPlanName: string;
          /** The end in the business's words ("16 Nov 2026"). */
          endsOn: string;
          /** What pauses then (#801), as the sweep told it; none: nothing. */
          pauses?: PausesWords | null;
      }
    | {
          kind: "TERM_ENDING";
          organizationId: string;
          subscriptionId: string;
          /** The term's end, ISO: one email per end and stage. */
          endsAt: string;
          stage: PlanEndingStage;
          /** What pauses on Free (#801), as the sweep told it. */
          pauses?: PausesWords | null;
      }
    | {
          kind: "MOVE_DOWN";
          organizationId: string;
          /** The inbox notice's once-only key: one email per notice. */
          eventKey: string;
          /** The grace claim it started (`moveDownClaimKey`): gone, say nothing. */
          graceKey: string;
          mode: "scheduled" | "now";
          planName: string;
          nextPlanName: string | null;
          movesOn: string | null;
          pausesOn: string;
          lines: string[];
      };

function isPausesWords(v: unknown): v is PausesWords {
    if (!v || typeof v !== "object") return false;
    const w = v as Record<string, unknown>;
    return (
        typeof w.pausesOn === "string" &&
        Array.isArray(w.lines) &&
        w.lines.every((l) => typeof l === "string")
    );
}

/** A payload's `pauses`, checked: anything malformed reads as none. */
function pausesOf(p: Record<string, unknown>): PausesWords | null {
    return isPausesWords(p.pauses) ? p.pauses : null;
}

function nullableString(v: unknown): v is string | null {
    return v === null || typeof v === "string";
}

/** A job's payload, checked; null when it isn't one we send. */
export function parseBillingEmailPayload(
    payload: unknown,
): BillingEmailPayload | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.organizationId !== "string") return null;
    if (p.kind === "INVOICE" && typeof p.invoiceId === "string") {
        return p as unknown as BillingEmailPayload;
    }
    if (
        p.kind === "PAYMENT_FAILED" &&
        typeof p.subscriptionId === "string" &&
        typeof p.eventKey === "string"
    ) {
        return { ...(p as object), final: p.final === true } as never;
    }
    if (
        p.kind === "TRIAL_ENDING" &&
        typeof p.subscriptionId === "string" &&
        typeof p.endsAt === "string"
    ) {
        return p as unknown as BillingEmailPayload;
    }
    if (
        p.kind === "PLAN_ENDING" &&
        typeof p.overrideId === "string" &&
        typeof p.endsAt === "string" &&
        PLAN_ENDING_NOTICE_DAYS.includes(p.stage as PlanEndingStage) &&
        typeof p.planName === "string" &&
        typeof p.nextPlanName === "string" &&
        typeof p.endsOn === "string"
    ) {
        return { ...(p as object), pauses: pausesOf(p) } as never;
    }
    if (
        p.kind === "TERM_ENDING" &&
        typeof p.subscriptionId === "string" &&
        typeof p.endsAt === "string" &&
        PLAN_ENDING_NOTICE_DAYS.includes(p.stage as PlanEndingStage)
    ) {
        return { ...(p as object), pauses: pausesOf(p) } as never;
    }
    if (
        p.kind === "MOVE_DOWN" &&
        typeof p.eventKey === "string" &&
        typeof p.graceKey === "string" &&
        (p.mode === "scheduled" || p.mode === "now") &&
        typeof p.planName === "string" &&
        nullableString(p.nextPlanName) &&
        nullableString(p.movesOn) &&
        isPausesWords({ pausesOn: p.pausesOn, lines: p.lines })
    ) {
        return p as unknown as BillingEmailPayload;
    }
    return null;
}
