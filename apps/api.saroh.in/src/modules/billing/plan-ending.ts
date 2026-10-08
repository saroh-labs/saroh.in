/**
 * A plan that ends on a date (#805): a `plan` override with `expiresAt` —
 * the waitlist's launch offer, or one an operator set — after which the
 * business reads its own plan again. Nothing runs at that date
 * (PRICING_ROLLOUT U5), so the hourly billing sweep tells the business
 * ahead of it: 30, 7 and 1 days before, by email and in its inbox, and
 * Settings › Plan and the app's countdown read the same end.
 *
 * Only an end that moves the business to a cheaper plan is told: one that
 * has since chosen a plan as good or better loses nothing when it ends.
 */

/** Days ahead of the end the business hears, furthest first. */
export const PLAN_ENDING_NOTICE_DAYS = [30, 7, 1] as const;

export type PlanEndingStage = (typeof PLAN_ENDING_NOTICE_DAYS)[number];

/** How far ahead the app shows the countdown: the first notice's. */
export const PLAN_ENDING_SHOWN_DAYS = PLAN_ENDING_NOTICE_DAYS[0];

/** The inbox notice (`Notification.type`). */
export const PLAN_ENDING_NOTIFICATION_TYPE = "plan.ending";

/** The once-only claim on each notice (`CustomerNotice.kind`). */
export const PLAN_ENDING_NOTICE_KIND = "PLAN_ENDING";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which notice is due: the nearest of 30, 7 and 1 days the end is now
 * within. Null once it has passed, or while it is more than 30 days off.
 * A plan given for ten days is told at once (the 30-day notice), then at
 * 7 and 1.
 */
export function planEndingStage(
    endsAt: Date,
    now: Date,
): PlanEndingStage | null {
    const left = endsAt.getTime() - now.getTime();
    if (left <= 0) return null;
    let stage: PlanEndingStage | null = null;
    for (const days of PLAN_ENDING_NOTICE_DAYS) {
        if (left <= days * DAY_MS) stage = days;
    }
    return stage;
}

/** One notice per override, end and stage: an extension is told again. */
export function planEndingEventKey(
    overrideId: string,
    endsAt: Date,
    stage: PlanEndingStage,
): string {
    return `plan-ending:${overrideId}:${endsAt.toISOString()}:${stage}`;
}
