import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { contactName } from "../invoices/serialize";
import { allows } from "../organizations/organization-policy";
import type { EventActorKind } from "../subscriptions/event-actors";
import { actorView, teamNames } from "../subscriptions/event-actors";
import type { PackUsedQueryDto } from "./dto";
import type { PackPaidBy } from "./pack-kind";
import { LIST_LIMIT } from "./pack-reads";

/**
 * Pack Detail's Used this week and Sales reads (round-2 E13, for E17).
 * `pack:read` covers both, amounts included (DEC-039); only an invoice id —
 * a link to a page the caller may not open — needs `invoice:read`. The
 * service authorizes and finds the pack first.
 */

const DAY_MS = 86_400_000;
/** The widest Used read, so a week or a month is always one call. */
const USED_MAX_DAYS = 62;

// — Used this week ————————————————————————————————————————————————

/**
 * What became of a class spent from the pack: still to come, came, didn't
 * come, cancelled in time (the class went back), or cancelled late (it
 * stayed spent).
 */
export type PackUseState =
    "BOOKED" | "CAME" | "NO_SHOW" | "CREDIT_BACK" | "LATE_CANCEL";

export interface PackUseView {
    bookingId: string;
    purchaseId: string;
    startAt: string;
    service: { id: string; name: string };
    /** The holder, whose pack paid for it. */
    contact: { id: string; name: string };
    state: PackUseState;
}

export interface PackUsedPage {
    from: string;
    to: string;
    /** Earliest first. */
    uses: PackUseView[];
}

function useState(r: {
    reversedAt: Date | null;
    booking: { status: string; outcome: string | null };
}): PackUseState {
    if (r.reversedAt) return "CREDIT_BACK";
    if (r.booking.status === "CANCELLED") return "LATE_CANCEL";
    if (r.booking.outcome === "ATTENDED") return "CAME";
    if (r.booking.outcome === "NO_SHOW") return "NO_SHOW";
    return "BOOKED";
}

/** [from, to): the dates asked for, or this week (Monday–Sunday) there. */
async function usedRange(
    organizationId: string,
    query: PackUsedQueryDto,
    now: Date,
): Promise<{ from: Date; to: Date }> {
    if (!query.from && !query.to) {
        const zone = await businessTimezone(prisma, organizationId);
        const start = DateTime.fromJSDate(now, { zone }).startOf("week");
        return {
            from: start.toJSDate(),
            to: start.plus({ weeks: 1 }).toJSDate(),
        };
    }
    if (!query.from || !query.to) {
        throw new BadRequestException({
            message: "Give both from and to, or neither for this week",
            details: { field: query.from ? "to" : "from" },
        });
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to <= from) {
        throw new BadRequestException({
            message: "to must be after from",
            details: { field: "to" },
        });
    }
    if (to.getTime() - from.getTime() > USED_MAX_DAYS * DAY_MS) {
        throw new BadRequestException({
            message: `Ask for at most ${USED_MAX_DAYS} days at once`,
            details: { field: "to" },
        });
    }
    return { from, to };
}

/**
 * The classes spent from this pack's purchases whose booking starts in the
 * range, earliest first, with what became of each.
 */
export async function packUsed(
    organizationId: string,
    packId: string,
    query: PackUsedQueryDto,
    now = new Date(),
): Promise<PackUsedPage> {
    const { from, to } = await usedRange(organizationId, query, now);
    const rows = await prisma.packRedemption.findMany({
        where: {
            organizationId,
            purchase: { packId, organizationId },
            booking: { startAt: { gte: from, lt: to } },
        },
        orderBy: [{ booking: { startAt: "asc" } }, { id: "asc" }],
        take: LIST_LIMIT,
        select: {
            purchaseId: true,
            reversedAt: true,
            purchase: {
                select: {
                    contact: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            },
            booking: {
                select: {
                    id: true,
                    startAt: true,
                    status: true,
                    outcome: true,
                    service: { select: { id: true, name: true } },
                },
            },
        },
    });
    return {
        from: from.toISOString(),
        to: to.toISOString(),
        uses: rows.map((r) => ({
            bookingId: r.booking.id,
            purchaseId: r.purchaseId,
            startAt: r.booking.startAt.toISOString(),
            service: r.booking.service,
            contact: {
                id: r.purchase.contact.id,
                name: contactName(r.purchase.contact),
            },
            state: useState(r),
        })),
    };
}

// — Sales ———————————————————————————————————————————————————————————

export interface PackSaleView {
    purchaseId: string;
    contact: { id: string; name: string };
    soldAt: string;
    credits: number;
    price: string;
    currency: string;
    /** How it was paid; null when not recorded (sold before E13). */
    paidBy: PackPaidBy | null;
    /**
     * Who sold it: a teammate by name, Saroh support for an operator, and a
     * customer who bought it on the site (A11) has kind CUSTOMER. Null when
     * nobody is recorded.
     */
    soldBy: {
        kind: EventActorKind;
        userId: string | null;
        name: string | null;
    } | null;
    /** Its invoice, only for someone who may open invoices. */
    invoiceId: string | null;
}

/**
 * Every sale of the pack, newest first, with its method, amount and who
 * sold it. Who sold it comes from the sale's event; a sale from before the
 * pack's history names its seller only if they are on the team.
 */
export async function packSales(
    ctx: OrganizationContext,
    packId: string,
): Promise<PackSaleView[]> {
    const { organizationId } = ctx;
    const rows = await prisma.packPurchase.findMany({
        where: { organizationId, packId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
        select: {
            id: true,
            credits: true,
            price: true,
            currency: true,
            paidBy: true,
            createdAt: true,
            createdByUserId: true,
            contact: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                },
            },
            invoices: {
                where: { status: { not: "VOID" } },
                select: { id: true },
                take: 1,
            },
            events: {
                where: { kind: "SOLD" },
                select: { actorKind: true, actorUserId: true },
                take: 1,
            },
        },
    });
    // Sold before the pack's history: the seller, if still on the team. A
    // Saroh operator never has a membership, so is never named here.
    const legacy = [
        ...new Set(
            rows.flatMap((r) =>
                !r.events.length && r.createdByUserId
                    ? [r.createdByUserId]
                    : [],
            ),
        ),
    ];
    const onTeam = legacy.length
        ? new Set(
              (
                  await prisma.membership.findMany({
                      where: { organizationId, userId: { in: legacy } },
                      select: { userId: true },
                  })
              ).map((m) => m.userId),
          )
        : new Set<string>();
    const actors = rows.map((r) => {
        if (r.events.length > 0) {
            const [e] = r.events;
            return { actorKind: e.actorKind, actorUserId: e.actorUserId };
        }
        if (r.createdByUserId && onTeam.has(r.createdByUserId)) {
            return { actorKind: "TEAM", actorUserId: r.createdByUserId };
        }
        return null;
    });
    const names = await teamNames(actors.filter((a) => a !== null));
    const seesInvoices = allows(ctx, "invoice:read");
    return rows.map((r, i) => {
        const a = actors[i];
        const who = a
            ? actorView(a.actorKind as EventActorKind, a.actorUserId, names)
            : null;
        return {
            purchaseId: r.id,
            contact: { id: r.contact.id, name: contactName(r.contact) },
            soldAt: r.createdAt.toISOString(),
            credits: r.credits,
            price: toMoneyString(r.price),
            currency: r.currency,
            paidBy: (r.paidBy as PackPaidBy | null) ?? null,
            soldBy: who
                ? { kind: who.kind, userId: who.userId, name: who.name }
                : null,
            invoiceId: seesInvoices ? (r.invoices[0]?.id ?? null) : null,
        };
    });
}
