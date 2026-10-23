import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-policy";
import { allows } from "../organizations/organization-policy";

/**
 * The booking, service and class-pack powers (DEC-039, E26; permission
 * matrix §2) and how a refusal reads. The app hides what a role can't do, so
 * a refusal reaches someone only when their role changed while they looked;
 * it still reads as a sentence, never as a code (`saroh-product.md`).
 *
 * | Endpoint                                                  | Asks            |
 * | --------------------------------------------------------- | --------------- |
 * | GET services, :id, rules, availability, staff, closures,  | `service:read`  |
 * | booking-rules                                             |                 |
 * | POST/PATCH/PUT/DELETE services, rules, staff and their    | `service:write` |
 * | services, closures, booking-rules                         |                 |
 * | PUT staff/:id/hours, extra hours, time off (DEC-170)      | `hours:write`   |
 * | GET staff/:id/booking-rules, booking-rule-requests (#1038) | `service:read`  |
 * | PUT staff/:id/booking-rules: one's own (a request while    | `hours:write`   |
 * | the approval switch is on); withdraw, dismiss one's own    |                 |
 * | PUT staff/:id/booking-rules: anyone's; approve, turn down  | `service:write` |
 * | GET services/bookings, bookings/:id, :id/bookings,        | `booking:read`  |
 * | :id/waitlist                                              |                 |
 * | POST :id/bookings, PATCH/DELETE bookings/:id, outcome,    | `booking:write` |
 * | pay link, treatment visits, bookings/:id/reassign and its |                 |
 * | people (#1157; someone else's booking: `service:write`)   |                 |
 * | GET class-packs, selling, purchases, :id and its tabs,    | `pack:read`     |
 * | draft                                                     |                 |
 * | POST class-packs/:id/sell; booking with a pack; POST and  | `pack:sell`     |
 * | DELETE bookings/:id/class-pack (with `booking:write`)     |                 |
 * | POST/PATCH/DELETE class-packs, drafts, publish, discard,  | `pack:write`    |
 * | archive, restore, purchases/:id/extend                    |                 |
 *
 * `booking:write` implies `booking:read`, `service:write` `service:read`
 * and `hours:write`, `hours:write` `service:read`,
 * `pack:write` `pack:sell`, and `pack:sell` `pack:read`
 * (`resolveCapabilities`).
 */
const REFUSALS: Partial<Record<OrgAction, string>> = {
    "booking:read": "Your role can't see bookings.",
    "booking:write": "Your role can't change bookings.",
    "service:read": "Your role can't see services.",
    "service:write":
        "Your role can't change services, hours, time off or booking rules.",
    "hours:write": "Your role can't change hours or time off.",
    "pack:read": "Your role can't see class packs.",
    "pack:sell": "Your role can't sell class packs.",
    "pack:write": "Your role can't change class packs.",
    "subscription:write": "Your role can't book with a membership.",
};

/**
 * Refuse, in words, anyone who doesn't hold `action`. `words` replaces the
 * usual sentence where the power is being used for something its name
 * doesn't say, like spending a pack's class on a booking.
 */
export function requireBookingPower(
    ctx: OrganizationContext,
    action: OrgAction,
    words?: string,
): void {
    if (allows(ctx, action)) return;
    throw new ForbiddenException(
        words ?? REFUSALS[action] ?? "Your role can't do this.",
    );
}

/**
 * Whether this person may take payment at the desk (P2): `booking:write`
 * for the booking and `invoice:write` for the paper it marks paid. Asked of
 * the role's permissions only, never its name (DEC-098), so a role the
 * business made with both takes payment and one without is told why.
 */
export function mayTakeDeskPayment(ctx: OrganizationContext): boolean {
    return allows(ctx, "booking:write") && allows(ctx, "invoice:write");
}

/** Spending or giving back a holder's class on a booking. */
export const CANT_USE_PACKS =
    "Your role can't pay for bookings with class packs.";
