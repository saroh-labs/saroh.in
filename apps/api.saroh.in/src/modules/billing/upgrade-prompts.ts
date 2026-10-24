import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { offeredPlans } from "@saroh/pricing-catalog";

import {
    captureProductEvent,
    telemetryOn,
} from "../../common/observability/posthog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { istDay } from "../admin/admin-billing";
import type { UpgradePromptEvent } from "../analytics/product-milestones";
import { authorize } from "../organizations/organization-policy";
import type { BusinessAccess } from "./catalogue-access.service";
import { CatalogueAccessService } from "./catalogue-access.service";

/**
 * The upgrade prompts the workspace shows (#1197, DEC-187), each with the
 * catalogue row it sells: the plan it offers is that row's first plan above
 * the business's own, as the locks say it (`upgradeTo`). A limit notice or
 * a plan's refusal sells no one row (null): it offers the plan above.
 *
 * A fixed list, never a caller's own key: `Organization.promptsShown` holds
 * only these. A new prompt is a line here and the same line in the
 * workspace's `lib/billing/upgrade-prompts.ts`.
 *
 * `memberships` reads as the app's lock does: subscriptions, else payments.
 */
export const PROMPT_ROWS = {
    deposits: ["payments"],
    online_payments: ["payments"],
    // Team's extra permissions for one person: roles of your own.
    team_member: ["roles"],
    own_domain: ["website"],
    memberships: ["subscriptions", "payments"],
    near_limit: null,
    at_limit: null,
    plan_refusal: null,
} as const satisfies Record<string, readonly string[] | null>;

export type PromptKey = keyof typeof PROMPT_ROWS;
export const PROMPT_KEYS = Object.keys(PROMPT_ROWS) as PromptKey[];

export const PROMPT_ACTIONS = ["shown", "pressed"] as const;
export type PromptAction = (typeof PROMPT_ACTIONS)[number];

const EVENT_BY_ACTION: Record<PromptAction, UpgradePromptEvent> = {
    shown: "upgrade_prompt_shown",
    pressed: "upgrade_prompt_pressed",
};

export function isPromptKey(value: unknown): value is PromptKey {
    return (
        typeof value === "string" &&
        Object.prototype.hasOwnProperty.call(PROMPT_ROWS, value)
    );
}

export function isPromptAction(value: unknown): value is PromptAction {
    return (
        typeof value === "string" &&
        (PROMPT_ACTIONS as readonly string[]).includes(value)
    );
}

/**
 * The plan a prompt offers, and the plan the business is on, as catalogue
 * plan ids ("none" for neither). Never the client's word: read from the
 * business's own access. A business the catalogue doesn't reach has none.
 */
export function promptPlans(
    access: BusinessAccess,
    key: PromptKey,
): { offered: string; current: string } {
    if (access.source !== "catalogue") {
        return { offered: "none", current: "none" };
    }
    const rows = PROMPT_ROWS[key];
    let offered: string | undefined;
    if (rows) {
        // The row that stops it, in the list's order, as the app's lock
        // picks; else any of them with a plan above.
        const inOrder = rows.flatMap((id) =>
            access.modules.filter((m) => m.moduleId === id),
        );
        offered = [...inOrder.filter((m) => m.state !== "on"), ...inOrder]
            .map((m) => m.upgradePlanId)
            .find((id) => id !== "");
    } else {
        const plans = offeredPlans(access.catalog);
        const at = plans.findIndex((p) => p.id === access.planId);
        // As the locks pick (`resolveAccess`): the next offered plan, if any.
        offered = plans.find((_, i) => i > at)?.id;
    }
    return { offered: offered ?? "none", current: access.planId };
}

/**
 * "Shown" and "pressed" for an upgrade prompt, to PostHog (DEC-187): their
 * own send path, not the activation ledger. "Pressed" always goes; "shown"
 * once per business, prompt and IST day, decided here, not in the browser
 * (sessionStorage there only saves requests). With PostHog off, nothing is
 * read or written.
 *
 * `org:read`, as moments: anyone who works in the business may see a
 * prompt, and saying so changes nothing else.
 */
@Injectable()
export class UpgradePromptsService {
    private readonly logger = new Logger(UpgradePromptsService.name);

    constructor(private readonly access: CatalogueAccessService) {}

    async record(
        ctx: OrganizationContext,
        key: string,
        action: string,
        now: Date = new Date(),
    ): Promise<void> {
        authorize(ctx, "org:read");
        if (!isPromptKey(key)) {
            throw new BadRequestException("That isn't a prompt Saroh shows.");
        }
        if (!isPromptAction(action)) {
            throw new BadRequestException("A prompt is shown or pressed.");
        }
        if (!telemetryOn()) return;
        if (action === "shown" && !(await this.firstToday(ctx, key, now))) {
            return;
        }
        try {
            const plans = promptPlans(
                await this.access.resolve(ctx.organizationId, now),
                key,
            );
            captureProductEvent(EVENT_BY_ACTION[action], ctx.organizationId, {
                prompt: key,
                plan_offered: plans.offered,
                plan_key: plans.current,
            });
        } catch (error) {
            // Degraded: only PostHog's copy is missing. Never the owner's.
            this.logger.warn(
                `upgrade_prompt_not_sent ${key} org=${ctx.organizationId}: ${
                    error instanceof Error ? error.name : "unknown"
                }`,
            );
        }
    }

    /**
     * Marks the prompt shown today, in one statement so two tabs at once
     * send it once; true when today wasn't already marked.
     */
    private async firstToday(
        ctx: OrganizationContext,
        key: PromptKey,
        now: Date,
    ): Promise<boolean> {
        const day = istDay(now);
        const changed = await prisma.$executeRaw`
            UPDATE "Organization"
            SET "promptsShown" = COALESCE("promptsShown", '{}'::jsonb)
                || jsonb_build_object(${key}::text, ${day}::text)
            WHERE "id" = ${ctx.organizationId}
              AND ("promptsShown" ->> ${key}::text) IS DISTINCT FROM ${day}::text`;
        return changed > 0;
    }
}
