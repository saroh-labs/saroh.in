import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-policy";
import { allows } from "../organizations/organization-policy";

/**
 * The customer powers (DEC-039, C13; permission matrix §2) and how a refusal
 * reads. The app hides what a role can't do, so a refusal reaches someone
 * only when their role changed while they looked; it still reads as a
 * sentence, never as a code (`saroh-product.md`).
 *
 * | Endpoint                                            | Asks                  |
 * | --------------------------------------------------- | --------------------- |
 * | GET customers, unlinked, :id/detail, timeline, …     | `contact:read`        |
 * | GET :id/attention                                    | `contact:read`; sensitive entries `customer:sensitive` |
 * | POST/PATCH/DELETE notes, attention, links, details  | `contact:write` (+ `customer:sensitive` for a sensitive entry) |
 * | GET/POST :id/merge/:other(/preview)                 | `customer:merge`      |
 * | GET/POST :id/removal(/preview)                      | `customer:remove`     |
 *
 * Each part inside a read follows its own: orders `order:read`, Spent
 * `order:read` and `invoice:read`, a plan `subscription:read`.
 */
const REFUSALS: Partial<Record<OrgAction, string>> = {
    "contact:read": "Your role can't see customers.",
    "contact:write": "Your role can't change customers' details.",
    "customer:merge": "Your role can't merge customers.",
    "customer:remove": "Your role can't remove a customer's details.",
    "order:read": "Your role can't see orders.",
    "invoice:read": "Your role can't see invoices.",
    "subscription:read": "Your role can't see subscriptions.",
};

/** Refuse, in words, anyone who doesn't hold `action`. */
export function requireCustomerPower(
    ctx: OrganizationContext,
    action: OrgAction,
): void {
    if (allows(ctx, action)) return;
    throw new ForbiddenException(
        REFUSALS[action] ?? "Your role can't do this.",
    );
}
