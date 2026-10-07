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
      }
    | {
          kind: "TERM_ENDING";
          organizationId: string;
          subscriptionId: string;
          /** The term's end, ISO: one email per end and stage. */
          endsAt: string;
          stage: PlanEndingStage;
      };

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
        return p as unknown as BillingEmailPayload;
    }
    if (
        p.kind === "TERM_ENDING" &&
        typeof p.subscriptionId === "string" &&
        typeof p.endsAt === "string" &&
        PLAN_ENDING_NOTICE_DAYS.includes(p.stage as PlanEndingStage)
    ) {
        return p as unknown as BillingEmailPayload;
    }
    return null;
}
