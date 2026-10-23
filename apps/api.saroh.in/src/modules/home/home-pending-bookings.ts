import type { Prisma, prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { whenWords } from "../../common/words-format";
import { planTakesOnlinePayment } from "../billing/online-payments-plan";
import { PAID_ALREADY } from "../bookings/booking-pay-link";
import { leftToPayCents } from "../invoices/invoice-state";
import { OPENS_CHECKOUT } from "../payments/public-key";
import { firstNameOf, payLinkWords, turnDownWords } from "./home-inline-words";
import type {
    HomeAction,
    HomeEvidence,
    HomeInput,
    HomeMoneyTotal,
} from "./home-model";
import { EVIDENCE_LIMIT, holds, personName } from "./home-model";
import type { HomeNarrow } from "./home-staff";
import { diaryWhere, WHOLE_BUSINESS } from "./home-staff";

/**
 * Bookings awaiting payment (DEC-170's words; Home plan U1, A7, A8): the
 * booking is coming up and its money hasn't come in yet.
 *
 * Two kinds of booking wait for their money:
 *
 * - **A payment link was sent** (a booking made by hand with "Send a payment
 *   link", E4): it stands (CONFIRMED) with its own invoice ISSUED and
 *   unpaid. It offers **Send payment link** — a new link, the one before
 *   stops — to whoever may make one (`booking:write` and `invoice:write`,
 *   with a provider that opens a checkout and a plan that takes payment
 *   online, as the pay-link endpoint refuses otherwise), and **Turn down**
 *   (`booking:write`), the booking's own cancel.
 * - **The customer is paying now** on the booking page (PENDING, inside its
 *   15-minute hold). The pay-link endpoint refuses a hold ("waiting on the
 *   customer's own online payment"), so it offers Turn down only, which
 *   lets the place go as the cancel does for a hold.
 *
 * Upcoming only (from the start of today in the business's zone): one whose
 * time has passed is an unpaid bill, not a booking to chase. A link whose
 * invoice is already past due is left to the bills group, so nothing counts
 * twice. Visits of a treatment and course sessions are paid on their order
 * or course, never by a link of their own, so they never show.
 *
 * Its rows ride `needGroups` only, never the flat `needs`, whose app knows
 * none of the two actions.
 */

type Db = typeof prisma;

export const AWAITING_PAYMENT_CODE = "APPOINTMENTS_AWAITING_PAYMENT";

/** How many it reads at most for the group's count and total. */
export const AWAITING_READ_LIMIT = 200;

/** The where for bookings awaiting payment, from `from` on. */
export function awaitingPaymentWhere(
    organizationId: string,
    now: Date,
    from: Date,
): Prisma.BookingWhereInput {
    return {
        organizationId,
        startAt: { gte: from },
        orderId: null,
        courseEnrollmentId: null,
        OR: [
            { status: "PENDING", holdExpiresAt: { gt: now } },
            {
                status: "CONFIRMED",
                // Spelled out: NOT IN on a null paidWith is null in SQL,
                // which would drop every booking nobody said was paid.
                OR: [{ paidWith: null }, { paidWith: { notIn: PAID_ALREADY } }],
                invoices: {
                    some: {
                        kind: "INVOICE",
                        source: "BOOKING",
                        status: "ISSUED",
                        OR: [{ dueAt: null }, { dueAt: { gte: now } }],
                    },
                },
            },
        ],
    };
}

/** A booking as this source selects it. */
export interface AwaitingRow {
    id: string;
    status: string;
    startAt: Date;
    holdExpiresAt: Date | null;
    bookerName: string | null;
    bookerEmail: string | null;
    service: { name: string };
    contact: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
    /** Its own invoice, newest first (absent from a hand-made row). */
    invoices?: {
        status: string;
        total: { toString(): string };
        /** Part recorded by hand on its ledger (DEC-173); absent is none. */
        paidCents?: number;
        currency: string;
    }[];
}

/** The booking's own invoice, the newest, when it has one. */
function ownInvoice(
    row: AwaitingRow,
): NonNullable<AwaitingRow["invoices"]>[number] | undefined {
    const list = row.invoices ?? [];
    return list.length > 0 ? list[0] : undefined;
}

/** What is left to pay on the booking's invoice (DEC-173), in paise. */
function owedOf(invoice: NonNullable<AwaitingRow["invoices"]>[number]): number {
    return leftToPayCents({
        total: invoice.total,
        paidCents: invoice.paidCents ?? 0,
    });
}

/** The text trimmed, or null when there is none. */
function filled(text: string | null | undefined): string | null {
    const out = text?.trim() ?? "";
    return out.length > 0 ? out : null;
}

/** Whether a row read really is awaiting payment (the where, again). */
export function isAwaiting(row: AwaitingRow, now: Date): boolean {
    if (row.status === "PENDING") {
        return row.holdExpiresAt !== null && row.holdExpiresAt > now;
    }
    return (
        row.status === "CONFIRMED" &&
        (row.invoices ?? []).some((i) => i.status === "ISSUED")
    );
}

/** What the viewer may do about these rows. */
export interface AwaitingPowers {
    /** `booking:write`: Turn down. */
    turnDown: boolean;
    /** Send payment link: see the file's comment for every condition. */
    payLink: boolean;
    /** `payment:read`: the amounts (DEC-098). */
    money: boolean;
}

/** The row's evidence, with its actions for this viewer. */
export function awaitingEvidence(
    row: AwaitingRow,
    zone: string,
    powers: AwaitingPowers,
): HomeEvidence {
    const who =
        (row.contact ? personName(row.contact) : null) ??
        filled(row.bookerName) ??
        filled(row.bookerEmail);
    const owed = ownInvoice(row);
    const held = row.status === "PENDING";
    const when = whenWords(row.startAt, zone, { weekday: true });
    const person = firstNameOf(who);
    const service = row.service.name;
    const ev: HomeEvidence = {
        id: row.id,
        title: service,
        subtitle: who,
        at: row.startAt.toISOString(),
        amountMinor: powers.money && owed ? owedOf(owed) : null,
        currency: powers.money && owed ? owed.currency : null,
        href: `/bookings/${row.id}`,
        tag: "Awaiting payment",
        tone: "due",
        detail: held ? `${when} · paying now on your booking page` : when,
    };
    const turnDown = powers.turnDown
        ? {
              kind: "TURN_DOWN" as const,
              ...turnDownWords(person, service, when, held),
              undoable: false,
              target: row.id,
              person,
          }
        : undefined;
    const payLink =
        powers.payLink && !held
            ? {
                  kind: "SEND_PAY_LINK" as const,
                  ...payLinkWords(person, service),
                  undoable: false,
                  target: row.id,
                  person,
              }
            : undefined;
    if (payLink) {
        ev.inline = payLink;
        if (turnDown) ev.second = turnDown;
    } else if (turnDown) {
        ev.inline = turnDown;
    }
    return ev;
}

/**
 * Whether Send payment link can work here: a provider that can open a
 * checkout (DEC-054), and a plan that takes payment online. Asked only for
 * someone who holds both writes, and only when a row could take it.
 */
async function linksWork(db: Db, organizationId: string): Promise<boolean> {
    const connected = await db.merchantPaymentProvider.count({
        where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
    });
    if (connected === 0) return false;
    return planTakesOnlinePayment(organizationId);
}

/**
 * The source: the bookings awaiting payment from today on, oldest start
 * first, as one action whose evidence carries each row's actions. Null when
 * none. Throws on a failed read; `HomeService` names it.
 */
export async function readAwaitingPayment(
    db: Db,
    input: HomeInput,
    clock: { now: Date; zone: string },
    narrow: HomeNarrow = WHOLE_BUSINESS,
): Promise<(HomeAction & { totals: HomeMoneyTotal[] | null }) | null> {
    const { now, zone } = clock;
    const from = DateTime.fromJSDate(now, { zone }).startOf("day").toJSDate();
    // Both may carry an OR, so this source's rule is ANDed under the
    // diary's (a staff member's own bookings, F11) rather than spread.
    const where: Prisma.BookingWhereInput = {
        ...diaryWhere(narrow.staff),
        AND: [awaitingPaymentWhere(input.organizationId, now, from)],
    };
    const read = (await db.booking.findMany({
        where,
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: AWAITING_READ_LIMIT,
        select: {
            id: true,
            status: true,
            startAt: true,
            holdExpiresAt: true,
            bookerName: true,
            bookerEmail: true,
            service: { select: { name: true } },
            contact: {
                select: { firstName: true, lastName: true, email: true },
            },
            invoices: {
                where: {
                    kind: "INVOICE",
                    source: "BOOKING",
                    status: { in: ["DRAFT", "ISSUED"] },
                },
                orderBy: { createdAt: "desc" },
                select: {
                    status: true,
                    total: true,
                    paidCents: true,
                    currency: true,
                },
            },
        },
    })) as AwaitingRow[];
    const rows = read.filter((r) => isAwaiting(r, now));
    if (rows.length === 0) return null;

    const money = holds(input, "payment:read");
    const turnDown = holds(input, "booking:write");
    const mayLink = turnDown && holds(input, "invoice:write");
    const linkable = rows.some((r) => r.status === "CONFIRMED");
    const payLink =
        mayLink && linkable
            ? await linksWork(db, input.organizationId).catch(() => false)
            : false;
    const powers = { turnDown, payLink, money };

    const count =
        rows.length < AWAITING_READ_LIMIT
            ? rows.length
            : await db.booking.count({ where });
    const totals = new Map<string, number>();
    for (const row of rows) {
        const owed = ownInvoice(row);
        if (!owed) continue;
        totals.set(
            owed.currency,
            (totals.get(owed.currency) ?? 0) + owedOf(owed),
        );
    }
    return {
        code: AWAITING_PAYMENT_CODE,
        title:
            count === 1
                ? "1 booking awaiting payment"
                : `${count} bookings awaiting payment`,
        href: "/bookings",
        severity: "OVERDUE",
        moduleKey: "APPOINTMENTS",
        count,
        late: 0,
        evidence: rows
            .slice(0, EVIDENCE_LIMIT)
            .map((r) => awaitingEvidence(r, zone, powers)),
        totals: money
            ? [...totals.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([currency, amountMinor]) => ({ currency, amountMinor }))
            : null,
    };
}
