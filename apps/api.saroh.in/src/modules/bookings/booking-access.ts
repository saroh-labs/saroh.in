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
 * | POST/PATCH/PUT/DELETE services, rules, staff, hours,      | `service:write` |
 * | time off, closures, booking-rules                         |                 |
 * | GET services/bookings, bookings/:id, :id/bookings,        | `booking:read`  |
 * | :id/waitlist                                              |                 |
 * | POST :id/bookings, PATCH/DELETE bookings/:id, outcome,    | `booking:write` |
 * | pay link, treatment visits                                |                 |
 * | GET class-packs, selling, purchases, :id and its tabs,    | `pack:read`     |
 * | draft                                                     |                 |
 * | POST class-packs/:id/sell; booking with a pack; POST and  | `pack:sell`     |
 * | DELETE bookings/:id/class-pack (with `booking:write`)     |                 |
 * | POST/PATCH/DELETE class-packs, drafts, publish, discard,  | `pack:write`    |
 * | archive, restore, purchases/:id/extend                    |                 |
 *
 * `booking:write` implies `booking:read`, `service:write` `service:read`,
 * `pack:write` `pack:sell`, and `pack:sell` `pack:read`
 * (`resolveCapabilities`).
 */
const REFUSALS: Partial<Record<OrgAction, string>> = {
    "booking:read": "Your role can't see bookings.",
    "booking:write": "Your role can't change bookings.",
    "service:read": "Your role can't see services.",
    "service:write":
        "Your role can't change services, hours, time off or booking rules.",
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

/** Spending or giving back a holder's class on a booking. */
export const CANT_USE_PACKS =
    "Your role can't pay for bookings with class packs.";
