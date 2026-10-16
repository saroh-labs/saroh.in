import type { Prisma } from "@prisma/client";

import { id } from "../helpers";
import { SHOWCASE_KEY, SHOWCASE_SEED, TIMEZONE } from "./data";
import type {
    DsAttention,
    DsBusiness,
    DsPlan,
    DsProduct,
    DsService,
    DsStaff,
} from "./diary-shop-types";
import { hashKey, istAt, istWeekday, minuteOf, phoneNumber } from "./people";
import { boundary, periodLabel } from "./periods";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * The dated world of a diary-and-counter business (Gulmohar Salon & Bridal,
 * Stride Physio), planned before anything is written. Pure: `now` and the
 * seeded random streams decide everything, so a re-run inside the same half
 * hour plans the same rows, and a later day moves the diary with it.
 *
 * Every booking is one the product could have made (`availability.ts`):
 *
 * - a one-to-one somebody takes is booked per person (U3): on a start the
 *   slot engine offers that person — inside their weekly hours, every half
 *   hour from the window's start (or by the service's own length when it is
 *   shorter, DEC-052), the whole visit inside the window, never on their day
 *   off or in a closure, and clear of their other bookings widened by the
 *   service's buffers;
 * - never two at once for the same client;
 * - made before it starts and before now; one made on the site inside the
 *   booking rules (how far ahead, how late);
 * - an outcome only once it has ended; a cancel inside the free-cancel window
 *   is late; a pack's class given back only on a cancel in time; a
 *   membership never past its visits a month.
 *
 * Money follows how each was paid: online in full (the booking's invoice),
 * a deposit online then the balance at the desk, a pack's class, a
 * membership visit, a treatment's order, or a bill at the desk afterwards
 * (mostly paid there and then, some still due, a few overdue). The counter's
 * product sales are orders with their invoice. Prices include GST where the
 * business is registered; a business that is not issues plain receipts.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST = 330 * MINUTE;

/** How far back the diary, the counter and the money reach. */
export const PAST_DAYS = 92;
/** How far ahead day-to-day bookings are made (scenes may go further). */
export const AHEAD_DAYS = 21;

export const dsId = (key: string, ...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, key, ...parts);

export interface DsPlanInput {
    biz: DsBusiness;
    now: Date;
    orgId: string;
    storeId: string;
    ownerUserId: string;
    deskUserId: string;
}

/** A line of a document, GST-inclusive; the writer works out the tax. */
export interface DocLine {
    description: string;
    quantity: number;
    unitPaise: number;
    /** Basis points of GST inside the price; null on an unregistered business. */
    rateBps: number | null;
    code: string | null;
    orderItemId?: string;
}

export interface DocSpec {
    id: string;
    status: "ISSUED" | "PAID";
    source: "BOOKING" | "MANUAL" | "ORDER" | "PACK" | "SUBSCRIPTION";
    bookingId: string | null;
    orderId: string | null;
    packPurchaseId: string | null;
    subscriptionId: string | null;
    period: { start: Date; end: Date } | null;
    contactId: string | null;
    billToName: string;
    billToEmail: string | null;
    createdAt: Date;
    issuedAt: Date;
    dueAt: Date | null;
    paidAt: Date | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
    createdByUserId: string | null;
    lines: DocLine[];
}

export interface DsWorld {
    closures: Prisma.BusinessClosureCreateManyInput[];
    timeOff: Prisma.StaffTimeOffCreateManyInput[];
    contacts: Prisma.ContactCreateManyInput[];
    customers: Prisma.CustomerCreateManyInput[];
    links: Prisma.CustomerIdentityLinkCreateManyInput[];
    purchases: Prisma.PackPurchaseCreateManyInput[];
    subscriptions: Prisma.CustomerSubscriptionCreateManyInput[];
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    bookings: Prisma.BookingCreateManyInput[];
    events: Prisma.BookingEventCreateManyInput[];
    redemptions: Prisma.PackRedemptionCreateManyInput[];
    invitations: Prisma.ReviewInvitationCreateManyInput[];
    reviews: Prisma.ProductReviewCreateManyInput[];
    attention: Prisma.ContactAttentionCreateManyInput[];
    notes: Prisma.ContactNoteCreateManyInput[];
    submissions: Prisma.SubmissionCreateManyInput[];
    intents: Prisma.PaymentIntentCreateManyInput[];
    attempts: Prisma.PaymentAttemptCreateManyInput[];
    docs: DocSpec[];
    /** Units each open order line holds, by stock row. */
    held: Map<string, number>;
    /** Paid orders and form entries by UTC day, for Insights. */
    paidByDay: Map<string, number>;
    entriesByDay: Map<string, number>;
    /** Booked on the site, by UTC day: visits behind them. */
    onlineByDay: Map<string, number>;
}

/** Where the writer put each product, for the counter's lines. */
export interface PlacedProduct {
    productId: string;
    /** Per variant, in fixture order. */
    variantIds: string[];
    /** The product's shelf row, or each variant's. */
    stockLevelId: string | null;
    variantStock: string[];
}

interface Span {
    start: number;
    end: number;
}
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

type Pay = "DESK" | "PAID" | "DEPOSIT" | "PACK" | "MEMBERSHIP" | "ORDER";

interface Planned {
    id: string;
    contact: number;
    staff: number;
    service: number;
    start: number;
    end: number;
    madeBy: string | null;
    createdAt: number;
    status: "CONFIRMED" | "CANCELLED";
    outcome: "ATTENDED" | "NO_SHOW" | null;
    outcomeBy: string | null;
    outcomeAt: number | null;
    cancelledAt: number | null;
    cancelledBy: string | null;
    pay: Pay;
    purchase: number | null;
    subscription: number | null;
    order: number | null;
    visit: number | null;
    locationType: "IN_PERSON" | "ONLINE" | null;
    note: { text: string; label: string; kind: DsAttention["kind"] } | null;
    /** Fixed by a scene: the generic rules leave it alone. */
    fixed: boolean;
}

interface Person {
    id: string;
    key: string | null;
    first: string;
    last: string;
    email: string;
    phone: string;
    gender: "f" | "m";
}

const local = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Kolkata midnight at the start of an ISO calendar date. */
const localMidnight = (iso: string) => Date.parse(`${iso}T00:00:00Z`) - IST;

/** The Kolkata calendar date of an instant, "2026-10-15". */
export const localIso = (t: number) =>
    new Date(t + IST).toISOString().slice(0, 10);

/** Paise → "1200.00". */
export const rupees = (paise: number) => {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(paise);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};

/** "480" or "480.50" → paise. */
export const paiseOf = (price: string) => {
    const [w = "0", f = ""] = price.split(".");
    return Number(w) * 100 + Number((f + "00").slice(0, 2));
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** "Blow-dry · Tue 15 Sep 2026, 16:30", as `holdLineDescription` writes it. */
export function lineDescription(name: string, start: number): string {
    const l = new Date(start + IST);
    const hh = String(l.getUTCHours()).padStart(2, "0");
    const mm = String(l.getUTCMinutes()).padStart(2, "0");
    return `${name} · ${DAYS[l.getUTCDay()]} ${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}, ${hh}:${mm}`;
}

/** The financial year of an instant, in Kolkata: 23 Sep 2026 → "26-27". */
export function financialYear(at: number): string {
    const l = new Date(at + IST);
    const start =
        l.getUTCMonth() >= 3 ? l.getUTCFullYear() : l.getUTCFullYear() - 1;
    const yy = (y: number) => String(y % 100).padStart(2, "0");
    return `${yy(start)}-${yy(start + 1)}`;
}

/** The deposit a PERCENT_50 service takes (`depositCents`). */
export const depositOf = (pricePaise: number) => Math.round(pricePaise / 2);

const hex = (rng: Rng, n: number) =>
    Array.from({ length: n }, () =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789".charAt(
            rng.int(0, 57),
        ),
    ).join("");

export function planDiaryShop(
    input: DsPlanInput,
    products: readonly PlacedProduct[],
): DsWorld {
    const { biz, now, orgId } = input;
    const key = biz.key;
    const t = now.getTime();
    const rngFor = (concern: string) =>
        createRng((SHOWCASE_SEED ^ hashKey(key, concern)) >>> 0);
    const sid = (...parts: (string | number)[]) => dsId(key, ...parts);
    const serviceIdOf = (i: number) => sid("service", biz.services[i].key);
    const staffIdOf = (i: number) => sid("staff", biz.staff[i].key);
    const svcIndex = new Map(biz.services.map((s, i) => [s.key, i]));
    const staffIndex = new Map(biz.staff.map((s, i) => [s.key, i]));
    const svcOf = (k: string): number => {
        const i = svcIndex.get(k);
        if (i === undefined) throw new Error(`${biz.name}: no service "${k}"`);
        return i;
    };
    const staffOf = (k: string): number => {
        const i = staffIndex.get(k);
        if (i === undefined) throw new Error(`${biz.name}: no staff "${k}"`);
        return i;
    };
    const desk = input.deskUserId;
    const owner = input.ownerUserId;
    const team = (r: Rng) => (r.chance(0.7) ? desk : owner);
    const ago = (m: number) => t - m * MINUTE;
    const registered = biz.gst !== null;
    const serviceRate = biz.gst ? biz.gst.serviceRateBps : null;
    const serviceCode = biz.gst ? biz.gst.sac : biz.sac;

    // --- closures and a day off this week ----------------------------------
    const closed: (Span & { reason: string; from: string })[] = biz.closures
        .map((c) => {
            const start = localMidnight(c.from);
            return {
                start,
                end: start + c.days * DAY,
                reason: c.reason,
                from: c.from,
            };
        })
        .filter((c) => c.end > t - PAST_DAYS * DAY && c.start < t + 60 * DAY);
    const closures: Prisma.BusinessClosureCreateManyInput[] = closed.map(
        (c) => ({
            id: sid("closure", c.from),
            organizationId: orgId,
            startAt: new Date(c.start),
            endAt: new Date(c.end),
            allDay: true,
            reason: c.reason,
            createdByUserId: owner,
            createdAt: new Date(
                Math.min(c.start - 35 * DAY + 19 * HOUR, t - HOUR),
            ),
        }),
    );
    const isClosed = (s: Span) => closed.some((c) => overlaps(c, s));

    const windowsOn = (staff: DsStaff, d: number): Span[] => {
        const weekday = istWeekday(now, d);
        return staff.hours
            .filter((w) => w.days.includes(weekday))
            .map((w) => ({
                start: istAt(now, d, minuteOf(w.from)).getTime(),
                end: istAt(now, d, minuteOf(w.to)).getTime(),
            }))
            .sort((a, b) => a.start - b.start);
    };
    const dayOffsetOf = (at: number) =>
        Math.round(
            (istAt(new Date(at), 0, 0).getTime() - istAt(now, 0, 0).getTime()) /
                DAY,
        );
    const wholeDay = (d: number): Span => ({
        start: istAt(now, d, 0).getTime(),
        end: istAt(now, d + 1, 0).getTime(),
    });

    const openDay = (s: number, d: number) =>
        windowsOn(biz.staff[s], d).some((w) => w.end > t + 3 * HOUR) &&
        !isClosed(wholeDay(d));
    let offStaff = -1;
    let offDay = -1;
    for (const k of biz.dayOff.staff) {
        const s = staffOf(k);
        for (let d = 1; d <= 6 && offDay < 0; d++) {
            const another = [0, 1, 2, 3, 4, 5, 6].some(
                (e) => e !== d && openDay(s, e),
            );
            if (openDay(s, d) && another) {
                offStaff = s;
                offDay = d;
            }
        }
        if (offDay >= 0) break;
    }
    if (offDay < 0) throw new Error(`${biz.name}: no day off to give`);
    const dayOff = wholeDay(offDay);
    const timeOff: Prisma.StaffTimeOffCreateManyInput[] = [
        {
            id: sid("timeoff", biz.staff[offStaff].key),
            organizationId: orgId,
            staffId: staffIdOf(offStaff),
            startAt: new Date(dayOff.start),
            endAt: new Date(dayOff.end),
            allDay: true,
            reason: biz.dayOff.reason,
            createdByUserId: owner,
            createdAt: new Date(
                Math.min(istAt(now, -9, 18 * 60).getTime(), t - HOUR),
            ),
        },
    ];
    const blocked = (s: number, span: Span) =>
        isClosed(span) || (s === offStaff && overlaps(dayOff, span));

    // --- the people ----------------------------------------------------------
    const used = new Set<string>();
    const emailOf = (first: string, last: string) => {
        const base = `${local(first)}.${local(last)}`;
        let email = `${base}@example.com`;
        for (let n = 2; used.has(email); n++) email = `${base}${n}@example.com`;
        used.add(email);
        return email;
    };
    const people: Person[] = biz.clients.map((c) => ({
        id: sid("contact", c.key),
        key: c.key,
        first: c.first,
        last: c.last,
        email: emailOf(c.first, c.last),
        phone: c.phone,
        gender: c.gender,
    }));
    const named = people.length;
    const peopleRng = rngFor("people");
    const newPerson = (gender?: "f" | "m"): number => {
        const g =
            gender ?? (peopleRng.chance(biz.womenShare) ? "f" : ("m" as const));
        const first = peopleRng.pick(
            g === "f" ? biz.names.women : biz.names.men,
        );
        const last = peopleRng.pick(biz.names.last);
        const n = people.length;
        people.push({
            id: sid("contact", n),
            key: null,
            first,
            last,
            email: emailOf(first, last),
            phone: phoneNumber(peopleRng),
            gender: g,
        });
        return n;
    };
    for (let i = 0; i < biz.generatedClients; i++) newPerson();
    const clientIndex = (k: string) => {
        const i = people.findIndex((p) => p.key === k);
        if (i < 0) throw new Error(`${biz.name}: no client "${k}"`);
        return i;
    };

    // --- who is busy when ------------------------------------------------------
    const busyStaff = biz.staff.map((): Span[] => []);
    const busyPerson = new Map<number, Span[]>();
    const guardOf = (svc: DsService) => 2 * (svc.buffer ?? 0) * MINUTE;
    const isFree = (s: number, svc: number, span: Span, person: number) => {
        const g = guardOf(biz.services[svc]);
        const guarded = { start: span.start - g, end: span.end + g };
        return (
            !busyStaff[s].some((b) => overlaps(b, guarded)) &&
            !(busyPerson.get(person) ?? []).some((b) => overlaps(b, span))
        );
    };
    const hold = (p: Planned) => {
        const span = { start: p.start, end: p.end };
        busyStaff[p.staff].push(span);
        busyPerson.set(p.contact, [...(busyPerson.get(p.contact) ?? []), span]);
    };
    const takes = (s: number, svc: number) =>
        biz.staff[s].services.includes(biz.services[svc].key);
    const takers = (svc: number) =>
        biz.staff.map((_, s) => s).filter((s) => takes(s, svc));

    /** The first start the slot engine would offer person `s`. */
    const firstSlot = (
        s: number,
        svc: number,
        person: number,
        from: number,
        until: number,
    ): Span | null => {
        const minutes = biz.services[svc].minutes;
        const step = Math.min(minutes, 30) * MINUTE;
        const length = minutes * MINUTE;
        for (let d = dayOffsetOf(from); d <= dayOffsetOf(until); d++) {
            for (const w of windowsOn(biz.staff[s], d)) {
                const k = Math.max(0, Math.ceil((from - w.start) / step));
                for (
                    let start = w.start + k * step;
                    start + length <= w.end && start < until;
                    start += step
                ) {
                    const span = { start, end: start + length };
                    if (!blocked(s, span) && isFree(s, svc, span, person)) {
                        return span;
                    }
                }
            }
        }
        return null;
    };

    const planned: Planned[] = [];
    let seq = 0;
    const blank = (
        a: Pick<
            Planned,
            "contact" | "staff" | "service" | "start" | "end" | "createdAt"
        > &
            Partial<Planned>,
    ): Planned => ({
        id: a.id ?? sid("booking", seq++),
        madeBy: null,
        status: "CONFIRMED",
        outcome: null,
        outcomeBy: null,
        outcomeAt: null,
        cancelledAt: null,
        cancelledBy: null,
        pay: "DESK",
        purchase: null,
        subscription: null,
        order: null,
        visit: null,
        locationType: null,
        note: null,
        fixed: false,
        ...a,
    });

    /** Settle a booking's outcome, or its cancel, from the business's rates. */
    const settle = (p: Planned, r: Rng, mayCancel = true) => {
        const free = biz.rules.freeCancelHours * HOUR;
        const past = p.end <= t;
        const roll = r.next();
        const lateRoll = r.next();
        if (mayCancel && roll < biz.diary.cancel * (past ? 1 : 0.5)) {
            const late =
                p.pay === "DEPOSIT" ||
                (past && lateRoll < biz.diary.lateShare) ||
                p.start - free <= p.createdAt + 10 * MINUTE;
            const at = late
                ? Math.max(
                      p.createdAt + 10 * MINUTE,
                      p.start -
                          r.int(1, Math.max(1, biz.rules.freeCancelHours - 1)) *
                              HOUR,
                  )
                : p.createdAt +
                  (p.start - free - p.createdAt) * (0.2 + 0.7 * r.next());
            if (at <= t - 5 * MINUTE && at < p.start) {
                p.status = "CANCELLED";
                p.cancelledAt = Math.round(at / MINUTE) * MINUTE;
                p.cancelledBy =
                    p.madeBy === null && r.chance(0.6) ? null : team(r);
                if (p.pay === "PAID") p.pay = "DESK";
                return;
            }
        }
        if (!past) return;
        if (p.end > t - 40 * HOUR && r.chance(0.45)) return; // not marked yet
        p.outcome = r.chance(biz.diary.noShow) ? "NO_SHOW" : "ATTENDED";
        p.outcomeBy = team(r);
        p.outcomeAt = Math.min(t - MINUTE, p.end + r.int(5, 120) * MINUTE);
    };

    const book = (p: Planned) => {
        planned.push(p);
        if (p.status !== "CANCELLED") hold(p);
        return p;
    };

    /** When someone booked a visit: the site within its rules, or the desk. */
    const madeAt = (r: Rng, start: number, online: boolean) => {
        const lead = online
            ? r.int(biz.rules.latestBookingMinutes + 30, 9 * 24 * 60)
            : r.int(10, 16 * 24 * 60);
        return Math.min(
            start - lead * MINUTE,
            online ? start - biz.rules.latestBookingMinutes * MINUTE : start,
            ago(r.int(20, 600)),
        );
    };

    // --- scenes the films and Home need ---------------------------------------
    const sceneRng = rngFor("scenes");
    const sceneOf = new Map<string, Planned>();
    for (const sc of biz.scenes) {
        const svc = svcOf(sc.service);
        const contact = clientIndex(sc.client);
        const from = Math.max(
            istAt(now, sc.day, minuteOf(sc.from ?? "00:00")).getTime(),
            sc.day >= 0 ? t + 3 * HOUR : 0,
        );
        const candidates = (sc.staff ?? []).map(staffOf);
        for (const s of takers(svc))
            if (!candidates.includes(s)) candidates.push(s);
        const slotWithin = (days: number) => {
            const until = istAt(now, sc.day + days, 0).getTime();
            for (const s of candidates) {
                if (!takes(s, svc)) continue;
                const span = firstSlot(s, svc, contact, from, until);
                if (span) return { s, span };
            }
            return null;
        };
        const spanDays = sc.spanDays ?? 3;
        // A future scene that lands on a closure (Diwali) or a stretch its
        // staff don't work at this seed clock moves to the next week's
        // first slot, so the seed holds at any `--now`.
        const found: { s: number; span: Span } | null =
            slotWithin(spanDays) ??
            (sc.day > 0 ? slotWithin(spanDays + 7) : null);
        if (!found) {
            throw new Error(
                `${biz.name}: no time for the scene "${sc.key}" (${sc.service}, day ${sc.day})`,
            );
        }
        const online = sc.by === "client";
        const createdAt = Math.min(
            found.span.start -
                sc.madeDaysBefore * DAY -
                sceneRng.int(1, 9) * HOUR,
            ago(sceneRng.int(30, 300)),
        );
        const p = blank({
            id: sid("booking", sc.key),
            contact,
            staff: found.s,
            service: svc,
            ...found.span,
            createdAt,
            madeBy: online ? null : desk,
            pay: sc.pay,
            note: sc.note ?? null,
            fixed: true,
            locationType:
                biz.services[svc].locationType === "ONLINE" ? null : null,
        });
        const past = p.end <= t;
        const outcome = sc.outcome ?? (past ? "ATTENDED" : "UNMARKED");
        if (outcome === "LATE_CANCEL") {
            p.status = "CANCELLED";
            p.cancelledAt = Math.min(
                t - 30 * MINUTE,
                Math.max(createdAt + HOUR, p.start - sceneRng.int(2, 9) * HOUR),
            );
            p.cancelledBy = null;
        } else if (past && outcome !== "UNMARKED") {
            p.outcome = outcome;
            p.outcomeBy = desk;
            p.outcomeAt = Math.min(t - MINUTE, p.end + 15 * MINUTE);
        }
        sceneOf.set(sc.key, book(p));
    }

    // --- treatments sold as one order (E9) -------------------------------------
    interface TreatmentOrder {
        n: number;
        contact: number;
        service: number;
        placedAt: number;
        paidAt: number | null;
        visits: Planned[];
    }
    const treatmentOrders: TreatmentOrder[] = [];
    if (biz.treatments) {
        const tr = biz.treatments;
        const svc = svcOf(tr.service);
        const r = rngFor("treatments");
        const total = biz.services[svc].visits;
        for (let n = 0; n < tr.count; n++) {
            const contact = newPerson(r.chance(0.6) ? "f" : "m");
            const startDay =
                Math.round(-85 + (n * 88) / tr.count) + r.int(0, 2);
            let from = istAt(now, startDay, 8 * 60).getTime();
            if (startDay >= 0) from = Math.max(from, t + 3 * HOUR);
            const staffPick = r.pick(takers(svc));
            const drop = startDay < -20 && r.chance(tr.dropAfterThird);
            const visits: Planned[] = [];
            for (let v = 1; v <= total; v++) {
                if (drop && v > 3) break;
                const span =
                    firstSlot(staffPick, svc, contact, from, from + 5 * DAY) ??
                    null;
                if (!span || span.start > t + AHEAD_DAYS * DAY) break;
                const createdAt =
                    v === 1
                        ? Math.min(span.start - r.int(1, 4) * DAY, ago(60))
                        : Math.min(
                              (visits.at(-1)?.end ?? span.start) + 10 * MINUTE,
                              ago(40),
                          );
                const p = blank({
                    contact,
                    staff: staffPick,
                    service: svc,
                    ...span,
                    createdAt,
                    madeBy: desk,
                    pay: "ORDER",
                    order: treatmentOrders.length,
                    visit: v,
                });
                if (p.end <= t) {
                    p.outcome = r.chance(0.04) ? "NO_SHOW" : "ATTENDED";
                    p.outcomeBy = team(r);
                    p.outcomeAt = Math.min(t - MINUTE, p.end + 15 * MINUTE);
                }
                visits.push(book(p));
                from =
                    span.start +
                    r.int(tr.everyDays[0], tr.everyDays[1]) * DAY -
                    2 * HOUR;
            }
            if (visits.length === 0) continue;
            const first = visits[0];
            const unpaid = n % 7 === 3;
            treatmentOrders.push({
                n: treatmentOrders.length,
                contact,
                service: svc,
                placedAt: first.createdAt,
                paidAt: unpaid
                    ? null
                    : first.end <= t
                      ? Math.min(t - MINUTE, first.end + 10 * MINUTE)
                      : first.createdAt + 5 * MINUTE,
                visits,
            });
        }
    }

    // --- memberships and the visits they paid for ---------------------------------
    interface Sub {
        n: number;
        plan: number;
        contact: number;
        anchor: number;
        periods: number;
        status: "ACTIVE" | "CANCELLED";
        cancelledAt: number | null;
        ending: boolean;
        /** Index of the last period's invoice that is still unpaid, if any. */
        unpaidLast: boolean;
    }
    const subs: Sub[] = [];
    const subRng = rngFor("memberships");
    const audienceFits = (svc: DsService, g: "f" | "m") =>
        !svc.audience ||
        svc.audience === "any" ||
        svc.audience === "kids" ||
        (svc.audience === "women" ? g === "f" : g === "m");
    const planAudience = (plan: DsPlan): "f" | "m" | null => {
        const aud = plan.services.map((k) => biz.services[svcOf(k)].audience);
        if (aud.every((a) => a === "women")) return "f";
        if (aud.every((a) => a === "men")) return "m";
        return null;
    };
    const taken = new Set<number>();
    const freshContact = (r: Rng, g: "f" | "m" | null) => {
        for (let tries = 0; tries < 400; tries++) {
            const c = named + r.int(0, biz.generatedClients - 1);
            if (taken.has(c)) continue;
            if (g && people[c].gender !== g) continue;
            taken.add(c);
            return c;
        }
        const c = newPerson(g ?? undefined);
        taken.add(c);
        return c;
    };
    const midnight = (d: number) => istAt(now, d, 0).getTime();
    const periodsTo = (anchor: number, at: number) => {
        let k = 0;
        while (
            boundary(new Date(anchor), "MONTH", TIMEZONE, k + 1).getTime() <= at
        ) {
            k += 1;
        }
        return k + 1;
    };
    biz.plans.forEach((plan, pi) => {
        const g = planAudience(plan);
        for (let i = 0; i < plan.active + plan.ended; i++) {
            const active = i < plan.active;
            const contact = freshContact(subRng, g);
            if (active) {
                const anchor = midnight(-subRng.int(3, 330));
                const periods = periodsTo(anchor, t);
                subs.push({
                    n: subs.length,
                    plan: pi,
                    contact,
                    anchor,
                    periods,
                    status: "ACTIVE",
                    cancelledAt: null,
                    ending: i % 17 === 5,
                    unpaidLast: i % 11 === 4 || i % 13 === 7,
                });
            } else {
                const anchor = midnight(-subRng.int(45, 400));
                // Every period of a membership that has ended is behind us.
                const most = periodsTo(anchor, t) - 1;
                const periods = Math.max(1, Math.min(most, subRng.int(1, 8)));
                const start = boundary(
                    new Date(anchor),
                    "MONTH",
                    TIMEZONE,
                    periods - 1,
                ).getTime();
                const end = boundary(
                    new Date(anchor),
                    "MONTH",
                    TIMEZONE,
                    periods,
                ).getTime();
                const cancelledAt = Math.min(
                    t - HOUR,
                    start + subRng.int(2, 26) * DAY + 11 * HOUR,
                    end - HOUR,
                );
                subs.push({
                    n: subs.length,
                    plan: pi,
                    contact,
                    anchor,
                    periods,
                    status: "CANCELLED",
                    cancelledAt,
                    ending: false,
                    unpaidLast: false,
                });
            }
        }
    });
    const subId = (s: Sub) => sid("sub", s.n);
    // Visits on a membership: a few a month, never past its allowance in a
    // calendar month, while it ran, in the last three months.
    for (const s of subs) {
        const plan = biz.plans[s.plan];
        const g = people[s.contact].gender;
        const svcs = plan.services
            .map(svcOf)
            .filter((x) => audienceFits(biz.services[x], g));
        if (svcs.length === 0) continue;
        const endAt =
            s.cancelledAt ??
            Math.min(
                t + 14 * DAY,
                boundary(
                    new Date(s.anchor),
                    "MONTH",
                    TIMEZONE,
                    s.periods,
                ).getTime(),
            );
        let at =
            Math.max(s.anchor + DAY, t - PAST_DAYS * DAY) +
            subRng.int(0, 6) * DAY;
        const perMonth = new Map<string, number>();
        while (at < endAt) {
            const svc = subRng.pick(svcs);
            const month = localIso(at).slice(0, 7);
            const usedThisMonth = perMonth.get(month) ?? 0;
            if (usedThisMonth < plan.classesPerMonth) {
                const s0 = subRng.pick(takers(svc));
                const span = firstSlot(
                    s0,
                    svc,
                    s.contact,
                    istAt(new Date(at), 0, 11 * 60).getTime(),
                    Math.min(endAt, at + 3 * DAY),
                );
                if (span && localIso(span.start).slice(0, 7) === month) {
                    const p = blank({
                        contact: s.contact,
                        staff: s0,
                        service: svc,
                        ...span,
                        createdAt: Math.max(
                            s.anchor + HOUR,
                            madeAt(subRng, span.start, false),
                        ),
                        madeBy: team(subRng),
                        pay: "MEMBERSHIP",
                        subscription: s.n,
                    });
                    settle(p, subRng);
                    // A visit cancelled in time is not used; a late one is.
                    perMonth.set(
                        month,
                        usedThisMonth +
                            (p.status === "CONFIRMED" || isLate(p) ? 1 : 0),
                    );
                    book(p);
                }
            }
            // Most members use a little over half of what they pay for.
            const cadence = (30 / Math.max(1, plan.classesPerMonth)) * 1.6;
            at += Math.round(cadence * (0.7 + 0.8 * subRng.next())) * DAY;
        }
    }

    // --- packs sold, and the visits paid from them -------------------------------
    interface Purchase {
        n: number;
        pack: number;
        contact: number;
        at: number;
        expiresAt: number;
        by: string;
        used: number;
    }
    const purchases: Purchase[] = [];
    const packRng = rngFor("packs");
    biz.packs.forEach((pack, pi) => {
        const svcs = pack.services.map(svcOf);
        const aud = svcs.map((x) => biz.services[x].audience);
        const g = aud.every((a) => a === "women")
            ? "f"
            : aud.every((a) => a === "men")
              ? "m"
              : null;
        for (let k = 0; k < pack.sold; k++) {
            const contact = freshContact(packRng, g);
            // The first of each pack: bought long enough ago to be nearly
            // out of time with classes left, which Home points at.
            const atDay =
                k === 0
                    ? -(pack.validityDays - 9)
                    : -packRng.int(
                          2,
                          Math.min(PAST_DAYS + 40, pack.validityDays + 60),
                      );
            const at = istAt(
                now,
                atDay,
                packRng.int(11 * 60, 19 * 60),
            ).getTime();
            const p: Purchase = {
                n: purchases.length,
                pack: pi,
                contact,
                at,
                expiresAt: at + pack.validityDays * DAY,
                by: team(packRng),
                used: 0,
            };
            purchases.push(p);
            const stopAfter = k === 0 ? 2 : pack.credits;
            let next = at + packRng.int(0, 3) * DAY;
            while (
                p.used < stopAfter &&
                next < Math.min(p.expiresAt - DAY, t + 14 * DAY)
            ) {
                const svc = packRng.pick(svcs);
                const s0 = packRng.pick(takers(svc));
                const span = firstSlot(
                    s0,
                    svc,
                    contact,
                    Math.max(next, at + HOUR),
                    Math.min(p.expiresAt - HOUR, next + 4 * DAY),
                );
                if (span) {
                    const b = blank({
                        contact,
                        staff: s0,
                        service: svc,
                        ...span,
                        createdAt: Math.max(
                            at + 5 * MINUTE,
                            madeAt(packRng, span.start, false),
                        ),
                        madeBy: p.by,
                        pay: "PACK",
                        purchase: p.n,
                    });
                    settle(b, packRng);
                    if (b.status === "CONFIRMED" || isLate(b)) p.used += 1;
                    book(b);
                }
                next =
                    (span?.start ?? next) +
                    packRng.int(pack.cadenceDays[0], pack.cadenceDays[1]) * DAY;
            }
        }
    });

    // --- courses: a first visit, then follow-ups until people stop -----------------
    if (biz.courses) {
        const co = biz.courses;
        const r = rngFor("courses");
        const first = svcOf(co.first);
        const then = co.then.map(svcOf);
        for (let week = -13; week <= 2; week++) {
            const starts = Math.max(
                0,
                Math.round(co.perWeek * (0.75 + 0.5 * r.next())),
            );
            for (let k = 0; k < starts; k++) {
                const contact = freshContact(r, null);
                const day = week * 7 + r.int(0, 6);
                const s0 = r.pick(takers(first));
                let from = istAt(now, day, 7 * 60).getTime();
                if (day >= 0) from = Math.max(from, t + 3 * HOUR);
                const length = r.weighted(co.lengths, (x) => x.weight).visits;
                const follow = r.pick(then);
                const online = r.chance(biz.diary.online);
                for (let v = 0; v < length; v++) {
                    const svc = v === 0 ? first : follow;
                    const staff = takes(s0, svc) ? s0 : r.pick(takers(svc));
                    const span = firstSlot(
                        staff,
                        svc,
                        contact,
                        from,
                        from + 4 * DAY,
                    );
                    if (!span || span.start > t + AHEAD_DAYS * DAY) break;
                    const prev = planned.at(-1);
                    const createdAt =
                        v === 0
                            ? madeAt(r, span.start, online)
                            : Math.min(
                                  (prev?.contact === contact
                                      ? prev.end
                                      : span.start - DAY) +
                                      10 * MINUTE,
                                  span.start - HOUR,
                                  ago(30),
                              );
                    const p = blank({
                        contact,
                        staff,
                        service: svc,
                        ...span,
                        createdAt,
                        madeBy: v === 0 && online ? null : team(r),
                        pay:
                            v === 0 && online && r.chance(biz.diary.payNow)
                                ? "PAID"
                                : "DESK",
                    });
                    settle(p, r);
                    book(p);
                    if (p.outcome === "NO_SHOW") break;
                    from =
                        span.start +
                        r.int(co.everyDays[0], co.everyDays[1]) * DAY -
                        3 * HOUR;
                }
            }
        }
    }

    // --- the day-to-day diary ------------------------------------------------------------
    const rng = rngFor("diary");
    const pool = people.length;
    for (let d = -PAST_DAYS; d <= AHEAD_DAYS; d++) {
        const iso = localIso(istAt(now, d, 12 * 60).getTime());
        const factor =
            biz.diary.weekday[istWeekday(now, d)] * biz.diary.season(iso);
        const share =
            (d < 0
                ? biz.diary.pastShare
                : d <= 7
                  ? biz.diary.aheadShare
                  : biz.diary.aheadShare * 0.45) * factor;
        for (let s = 0; s < biz.staff.length; s++) {
            const mine = biz.staff[s].services
                .map(svcOf)
                .filter((x) => biz.services[x].weight > 0);
            if (mine.length === 0) continue;
            for (const w of windowsOn(biz.staff[s], d)) {
                let cursor = w.start;
                while (cursor < w.end) {
                    const roll = rng.next();
                    const contact = rng.skewed(pool, 1.5);
                    const fits = mine.filter((x) =>
                        audienceFits(biz.services[x], people[contact].gender),
                    );
                    if (roll >= share || fits.length === 0) {
                        cursor += 30 * MINUTE;
                        continue;
                    }
                    const svc = rng.weighted(
                        fits,
                        (x) => biz.services[x].weight,
                    );
                    const span = {
                        start: cursor,
                        end: cursor + biz.services[svc].minutes * MINUTE,
                    };
                    if (
                        span.end > w.end ||
                        blocked(s, span) ||
                        !isFree(s, svc, span, contact) ||
                        span.start < t - PAST_DAYS * DAY
                    ) {
                        cursor += 30 * MINUTE;
                        continue;
                    }
                    const service = biz.services[svc];
                    const deposit = service.depositMode !== "NONE";
                    const online =
                        service.shown &&
                        (deposit
                            ? rng.chance(0.85)
                            : rng.chance(biz.diary.online));
                    const p = blank({
                        contact,
                        staff: s,
                        service: svc,
                        ...span,
                        createdAt: madeAt(rng, span.start, online),
                        madeBy: online ? null : team(rng),
                        pay:
                            online && deposit
                                ? "DEPOSIT"
                                : online && rng.chance(biz.diary.payNow)
                                  ? "PAID"
                                  : "DESK",
                        locationType:
                            service.locationType === "EITHER"
                                ? rng.chance(0.6)
                                    ? "ONLINE"
                                    : "IN_PERSON"
                                : null,
                    });
                    settle(p, rng);
                    book(p);
                    // Half-hour steps from the window's start, after this one.
                    cursor =
                        w.start +
                        Math.ceil((span.end - w.start) / (30 * MINUTE)) *
                            30 *
                            MINUTE;
                }
            }
        }
    }

    // --- whatever the day, Home has something to point at --------------------------------
    const generic = planned
        .filter((p) => !p.fixed && p.pay === "DESK" && p.status === "CONFIRMED")
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    if (!planned.some((p) => p.outcome === "NO_SHOW")) {
        const p = generic.find((x) => x.outcome === "ATTENDED");
        if (p) p.outcome = "NO_SHOW";
    }
    if (!planned.some(isLate)) {
        const p = [...generic]
            .reverse()
            .find(
                (x) =>
                    x.end < t - 2 * DAY &&
                    x.createdAt <
                        x.start - (biz.rules.freeCancelHours + 6) * HOUR,
            );
        if (p) {
            releaseHold(p);
            p.status = "CANCELLED";
            p.outcome = null;
            p.outcomeBy = null;
            p.outcomeAt = null;
            p.cancelledAt = p.start - 3 * HOUR;
            p.cancelledBy = null;
        }
    }
    // A few from yesterday and today still waiting for someone to say how
    // they went.
    const recent = planned.filter(
        (p) =>
            p.status === "CONFIRMED" &&
            p.end <= t &&
            p.end > t - 30 * HOUR &&
            p.pay === "DESK" &&
            !p.fixed,
    );
    if (
        !planned.some(
            (p) => p.status === "CONFIRMED" && p.end <= t && p.outcome === null,
        )
    ) {
        for (const p of recent.slice(0, 3)) {
            p.outcome = null;
            p.outcomeBy = null;
            p.outcomeAt = null;
        }
    }

    function isLate(p: Planned): boolean {
        return (
            p.cancelledAt !== null &&
            p.cancelledAt > p.start - biz.rules.freeCancelHours * HOUR
        );
    }
    function releaseHold(p: Planned) {
        const drop = (list: Span[]) => {
            const i = list.findIndex(
                (b) => b.start === p.start && b.end === p.end,
            );
            if (i >= 0) list.splice(i, 1);
        };
        drop(busyStaff[p.staff]);
        drop(busyPerson.get(p.contact) ?? []);
    }

    planned.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

    // --- money ------------------------------------------------------------------------
    const moneyRng = rngFor("money");
    const docs: DocSpec[] = [];
    const intents: Prisma.PaymentIntentCreateManyInput[] = [];
    const attempts: Prisma.PaymentAttemptCreateManyInput[] = [];
    const nameOf = (c: number) => `${people[c].first} ${people[c].last}`;
    const serviceLine = (
        name: string,
        unitPaise: number,
        start: number,
    ): DocLine => ({
        description: lineDescription(name, start),
        quantity: 1,
        unitPaise,
        rateBps: serviceRate,
        code: serviceCode,
    });
    const deskMethod = (r: Rng) => {
        const m = r.weighted(
            [
                { m: "UPI", w: 62 },
                { m: "CASH", w: 18 },
                { m: "CARD", w: 20 },
            ],
            (x) => x.w,
        ).m;
        const ref =
            m === "UPI"
                ? `UPI ref ${r.int(3, 6)}${String(r.int(1e9, 9e9))}${r.int(0, 9)}`
                : m === "CARD"
                  ? `Card ending ${String(r.int(1000, 9999))}`
                  : null;
        return { m, ref };
    };
    const onlinePay = (
        keyPart: string,
        amount: number,
        createdAt: number,
        paidAt: number,
        invoiceId: string | null,
        orderId: string | null,
    ) => {
        const ref = `pay_${hex(moneyRng, 14)}`;
        intents.push({
            id: sid("intent", keyPart),
            organizationId: orgId,
            invoiceId,
            orderId,
            provider: "RAZORPAY",
            providerIntentId: `order_${hex(moneyRng, 14)}`,
            amountCents: amount,
            currency: "INR",
            status: "SUCCEEDED",
            createdAt: new Date(createdAt),
            updatedAt: new Date(paidAt),
        });
        attempts.push({
            id: sid("attempt", keyPart),
            organizationId: orgId,
            paymentIntentId: sid("intent", keyPart),
            provider: "RAZORPAY",
            providerRef: ref,
            status: "CAPTURED",
            createdAt: new Date(paidAt),
        });
        return ref;
    };
    const tail = (bookingId: string) =>
        bookingId.slice(sid("booking", "").length);

    for (const p of planned) {
        const svc = biz.services[p.service];
        const person = people[p.contact];
        const k = tail(p.id);
        const bill = {
            contactId: person.id,
            billToName: nameOf(p.contact),
            billToEmail: person.email,
        };
        if (p.pay === "PAID" || p.pay === "DEPOSIT") {
            const amount =
                p.pay === "DEPOSIT"
                    ? depositOf(svc.pricePaise)
                    : svc.pricePaise;
            const paidAt = p.createdAt + moneyRng.int(2, 6) * MINUTE;
            const invoiceId = sid("invoice", "b", k);
            const ref = onlinePay(
                k,
                amount,
                p.createdAt,
                paidAt,
                invoiceId,
                null,
            );
            docs.push({
                id: invoiceId,
                status: "PAID",
                source: "BOOKING",
                bookingId: p.id,
                orderId: null,
                packPurchaseId: null,
                subscriptionId: null,
                period: null,
                ...bill,
                createdAt: new Date(p.createdAt),
                issuedAt: new Date(paidAt),
                dueAt: new Date(paidAt),
                paidAt: new Date(paidAt),
                paymentMethod: "ONLINE",
                paymentReference: ref,
                paymentNote: "Paid online through Razorpay",
                createdByUserId: null,
                lines: [
                    serviceLine(
                        p.pay === "DEPOSIT"
                            ? `Deposit for ${svc.name}`
                            : svc.name,
                        amount,
                        p.start,
                    ),
                ],
            });
        }
        // The desk's bill after the visit: the whole price, or the balance
        // after a deposit.
        const billable =
            p.outcome === "ATTENDED" &&
            (p.pay === "DESK" || p.pay === "DEPOSIT") &&
            p.end + 20 * MINUTE <= t;
        if (!billable) continue;
        const amount =
            p.pay === "DEPOSIT"
                ? svc.pricePaise - depositOf(svc.pricePaise)
                : svc.pricePaise;
        const issuedAt = p.end + moneyRng.int(3, 12) * MINUTE;
        const paid = moneyRng.chance(biz.diary.paidAtDesk);
        const { m, ref } = deskMethod(moneyRng);
        const paidAt = issuedAt + moneyRng.int(1, 4) * MINUTE;
        docs.push({
            id: sid("invoice", "m", k),
            status: paid ? "PAID" : "ISSUED",
            source: "MANUAL",
            bookingId: null,
            orderId: null,
            packPurchaseId: null,
            subscriptionId: null,
            period: null,
            ...bill,
            createdAt: new Date(issuedAt),
            issuedAt: new Date(issuedAt),
            dueAt: new Date(issuedAt + 7 * DAY),
            paidAt: paid ? new Date(paidAt) : null,
            paymentMethod: paid ? m : null,
            paymentReference: paid ? ref : null,
            paymentNote: null,
            createdByUserId: team(moneyRng),
            lines: [
                serviceLine(
                    p.pay === "DEPOSIT" ? `Balance for ${svc.name}` : svc.name,
                    amount,
                    p.start,
                ),
            ],
        });
    }
    // One bill still due but not yet late, whatever the day.
    const manual = docs.filter((d) => d.source === "MANUAL");
    if (
        !manual.some(
            (d) => d.status === "ISSUED" && (d.dueAt?.getTime() ?? 0) > t,
        )
    ) {
        const last = [...manual].sort(
            (a, b) => b.issuedAt.getTime() - a.issuedAt.getTime(),
        )[0] as DocSpec | undefined;
        if (last) {
            last.status = "ISSUED";
            last.paidAt = null;
            last.paymentMethod = null;
            last.paymentReference = null;
        }
    }

    // Packs: each paid at the desk when it was bought.
    const packPurchases: Prisma.PackPurchaseCreateManyInput[] = purchases.map(
        (p) => {
            const pack = biz.packs[p.pack];
            const { m, ref } = deskMethod(moneyRng);
            docs.push({
                id: sid("invoice", "p", p.n),
                status: "PAID",
                source: "PACK",
                bookingId: null,
                orderId: null,
                packPurchaseId: sid("purchase", p.n),
                subscriptionId: null,
                period: null,
                contactId: people[p.contact].id,
                billToName: nameOf(p.contact),
                billToEmail: people[p.contact].email,
                createdAt: new Date(p.at),
                issuedAt: new Date(p.at),
                dueAt: new Date(p.at + 7 * DAY),
                paidAt: new Date(p.at + 2 * MINUTE),
                paymentMethod: m,
                paymentReference: ref,
                paymentNote: null,
                createdByUserId: p.by,
                lines: [
                    {
                        description: pack.name,
                        quantity: 1,
                        unitPaise: pack.pricePaise,
                        rateBps: serviceRate,
                        code: serviceCode,
                    },
                ],
            });
            return {
                id: sid("purchase", p.n),
                organizationId: orgId,
                packId: sid("pack", pack.key),
                contactId: people[p.contact].id,
                credits: pack.credits,
                price: rupees(pack.pricePaise),
                currency: "INR",
                expiresAt: new Date(p.expiresAt),
                createdByUserId: p.by,
                paidBy: "DESK",
                createdAt: new Date(p.at),
            };
        },
    );

    // Memberships: an invoice a period, from the first; most paid by UPI
    // autopay-style on the day, a few of the latest still due or overdue.
    const subscriptions: Prisma.CustomerSubscriptionCreateManyInput[] =
        subs.map((s) => {
            const plan = biz.plans[s.plan];
            const at = (k: number) =>
                boundary(new Date(s.anchor), "MONTH", TIMEZONE, k);
            for (let k = 0; k < s.periods; k++) {
                const start = at(k);
                const end = at(k + 1);
                const lastOne = k === s.periods - 1;
                const unpaid = lastOne && s.unpaidLast;
                const issuedAt = new Date(start.getTime() + 9 * HOUR);
                const issued =
                    issuedAt.getTime() <= t
                        ? issuedAt
                        : new Date(start.getTime());
                const { m, ref } = deskMethod(moneyRng);
                docs.push({
                    id: sid("invoice", "s", s.n, k),
                    status: unpaid ? "ISSUED" : "PAID",
                    source: "SUBSCRIPTION",
                    bookingId: null,
                    orderId: null,
                    packPurchaseId: null,
                    subscriptionId: subId(s),
                    period: { start, end },
                    contactId: people[s.contact].id,
                    billToName: nameOf(s.contact),
                    billToEmail: people[s.contact].email,
                    createdAt: issued,
                    issuedAt: issued,
                    dueAt: new Date(issued.getTime() + 7 * DAY),
                    paidAt: unpaid
                        ? null
                        : new Date(
                              Math.max(
                                  issued.getTime(),
                                  Math.min(
                                      t - MINUTE,
                                      issued.getTime() +
                                          moneyRng.int(5, 600) * MINUTE,
                                  ),
                              ),
                          ),
                    paymentMethod: unpaid ? null : m,
                    paymentReference: unpaid ? null : ref,
                    paymentNote: null,
                    createdByUserId: desk,
                    lines: [
                        {
                            description: `${plan.name} · ${periodLabel({ start, end }, TIMEZONE)}`,
                            quantity: 1,
                            unitPaise: plan.pricePaise,
                            rateBps: serviceRate,
                            code: serviceCode,
                        },
                    ],
                });
            }
            const current = { start: at(s.periods - 1), end: at(s.periods) };
            return {
                id: subId(s),
                organizationId: orgId,
                planId: sid("plan", plan.key),
                contactId: people[s.contact].id,
                status: s.status,
                price: rupees(plan.pricePaise),
                currency: "INR",
                interval: "MONTH",
                timezone: TIMEZONE,
                anchorAt: new Date(s.anchor),
                currentPeriodStart: current.start,
                currentPeriodEnd: current.end,
                cancelAtPeriodEnd: s.ending,
                cancelledAt:
                    s.cancelledAt === null ? null : new Date(s.cancelledAt),
                createdByUserId: desk,
                classesPerPeriod: plan.classesPerMonth,
                classesPerPeriodSetAt: new Date(s.anchor),
                createdAt: new Date(s.anchor),
                updatedAt: new Date(
                    Math.min(
                        t,
                        s.cancelledAt ?? current.start.getTime() + HOUR,
                    ),
                ),
            };
        });

    // --- the counter: products sold, and the treatments' orders ------------------------
    interface OrderPlan {
        key: string;
        contact: number | null;
        walkIn: { name: string; phone: string } | null;
        placedAt: number;
        paidAt: number | null;
        lines: {
            product: number;
            variant: number | null;
            qty: number;
            service?: number;
        }[];
        open: boolean;
        treatment: TreatmentOrder | null;
        review?: { product: number; review: number };
    }
    const orderPlans: OrderPlan[] = [];
    const counterRng = rngFor("counter");
    const sellable = biz.products
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.demand > 0);
    const pickLine = (r: Rng) => {
        const { p, i } = r.weighted(sellable, (x) => x.p.demand);
        const variant =
            p.variants.length === 0
                ? null
                : r.weighted(
                      p.variants.map((_, j) => j),
                      (j) => (j < 4 ? 3 : 1),
                  );
        return { product: i, variant, qty: r.chance(0.12) ? 2 : 1 };
    };
    const attendedOn = new Map<number, Planned[]>();
    for (const p of planned) {
        if (p.outcome !== "ATTENDED") continue;
        const d = dayOffsetOf(p.start);
        attendedOn.set(d, [...(attendedOn.get(d) ?? []), p]);
    }
    const openOn = (d: number) => {
        const wd = istWeekday(now, d);
        const hours = biz.openingHours.find(
            (h) =>
                h.day === ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][wd],
        );
        if (!hours || hours.closed || isClosed(wholeDay(d))) return null;
        return { open: minuteOf(hours.open), close: minuteOf(hours.close) };
    };
    for (let d = -PAST_DAYS; d <= 0; d++) {
        const hours = openOn(d);
        if (!hours) continue;
        const iso = localIso(istAt(now, d, 12 * 60).getTime());
        const mean =
            biz.counter.perDay *
            biz.diary.weekday[istWeekday(now, d)] *
            biz.diary.season(iso);
        const n = Math.floor(
            mean * (0.6 + 0.8 * counterRng.next()) + counterRng.next(),
        );
        for (let k = 0; k < n; k++) {
            const visits = attendedOn.get(d) ?? [];
            const fromVisit =
                counterRng.chance(biz.counter.clientShare) && visits.length > 0
                    ? counterRng.pick(visits)
                    : null;
            const placedAt = fromVisit
                ? fromVisit.end + counterRng.int(2, 9) * MINUTE
                : istAt(
                      now,
                      d,
                      counterRng.int(hours.open + 20, hours.close - 15),
                  ).getTime();
            if (placedAt > t - 10 * MINUTE) continue;
            const lines = [pickLine(counterRng)];
            if (counterRng.chance(0.22)) {
                const more = pickLine(counterRng);
                if (more.product !== lines[0].product) lines.push(more);
            }
            const walkFirst = counterRng.pick(
                counterRng.chance(biz.womenShare)
                    ? biz.names.women
                    : biz.names.men,
            );
            orderPlans.push({
                key: `c${d + PAST_DAYS}_${k}`,
                contact: fromVisit ? fromVisit.contact : null,
                walkIn: fromVisit
                    ? null
                    : {
                          name: walkFirst,
                          phone: phoneNumber(counterRng),
                      },
                placedAt,
                paidAt: placedAt + MINUTE,
                lines,
                open: false,
                treatment: null,
            });
        }
    }
    // Put aside today for a client to collect: open, holding its units.
    const regular = people.findIndex((p) => p.key !== null);
    if (regular >= 0) {
        const line = pickLine(counterRng);
        orderPlans.push({
            key: "aside",
            contact: regular,
            walkIn: null,
            placedAt: Math.min(t - 2 * HOUR, istAt(now, 0, 11 * 60).getTime()),
            paidAt: null,
            lines: [{ ...line, qty: 1 }],
            open: true,
            treatment: null,
        });
    }
    // The orders behind the reviews: a client bought it, and was asked.
    biz.products.forEach((product, pi) => {
        product.reviews.forEach((review, ri) => {
            const [first = "Guest", initial = "S."] =
                review.displayName.split(" ");
            const isMan = biz.names.men.includes(first);
            const last =
                biz.names.last.find((l) => l.startsWith(initial.charAt(0))) ??
                `${initial.charAt(0)}${"ahani"}`;
            const n = people.length;
            people.push({
                id: sid("contact", n),
                key: null,
                first,
                last,
                email: emailOf(first, last),
                phone: phoneNumber(counterRng),
                gender: isMan ? "m" : "f",
            });
            const variant = review.variantTitle
                ? product.variants.findIndex(
                      (v) => v.title === review.variantTitle,
                  )
                : product.variants.length > 0
                  ? 0
                  : -1;
            const placedAt = istAt(
                now,
                -(review.daysAgo + 6),
                counterRng.int(12 * 60, 19 * 60),
            ).getTime();
            orderPlans.push({
                key: `r${pi}_${ri}`,
                contact: n,
                walkIn: null,
                placedAt,
                paidAt: placedAt + MINUTE,
                lines: [
                    {
                        product: pi,
                        variant: variant >= 0 ? variant : null,
                        qty: 1,
                    },
                ],
                open: false,
                treatment: null,
                review: { product: pi, review: ri },
            });
        });
    });
    for (const tr of treatmentOrders) {
        orderPlans.push({
            key: `t${tr.n}`,
            contact: tr.contact,
            walkIn: null,
            placedAt: tr.placedAt,
            paidAt: tr.paidAt,
            lines: [
                { product: -1, variant: null, qty: 1, service: tr.service },
            ],
            open: false,
            treatment: tr,
        });
    }
    orderPlans.sort(
        (a, b) => a.placedAt - b.placedAt || a.key.localeCompare(b.key),
    );

    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const invitations: Prisma.ReviewInvitationCreateManyInput[] = [];
    const reviews: Prisma.ProductReviewCreateManyInput[] = [];
    const held = new Map<string, number>();
    const customerOf = new Map<number, string>();
    const customers: Prisma.CustomerCreateManyInput[] = [];
    const links: Prisma.CustomerIdentityLinkCreateManyInput[] = [];
    const ensureCustomer = (
        c: number,
        at: number,
        reason: "PAYMENT" | "BOOKING",
    ) => {
        const found = customerOf.get(c);
        if (found) return found;
        const cid = sid("customer", c);
        customerOf.set(c, cid);
        customers.push({
            id: cid,
            storeId: input.storeId,
            organizationId: orgId,
            email: people[c].email,
            firstName: people[c].first,
            lastName: people[c].last,
            phone: people[c].phone,
            country: "India",
            city: biz.address.city,
            createdAt: new Date(at),
            updatedAt: new Date(at),
        });
        links.push({
            id: sid("customerlink", c),
            organizationId: orgId,
            contactId: people[c].id,
            customerId: cid,
            reason,
            createdAt: new Date(at),
        });
        return cid;
    };
    const unitOf = (pl: DsProduct, variant: number | null) => {
        const v = variant === null ? null : pl.variants[variant];
        return paiseOf(v?.price ?? pl.price);
    };
    const nameOfLine = (pl: DsProduct, variant: number | null) =>
        variant === null
            ? pl.name
            : `${pl.name} — ${pl.variants[variant].title}`;
    const productRate = (pl: DsProduct) =>
        registered ? pl.gstRate * 100 : null;
    const orderIdOf = new Map<number, string>();
    orderPlans.forEach((o, n) => {
        const orderId = sid("order", o.key);
        const number = `ORD-${String(n + 1).padStart(3, "0")}`;
        const itemIds = o.lines.map((_, k) => sid("orderitem", o.key, k));
        const docLines: DocLine[] = o.lines.map((l, k) => {
            if (l.service !== undefined) {
                const svc = biz.services[l.service];
                return {
                    description: svc.name,
                    quantity: 1,
                    unitPaise: svc.pricePaise,
                    rateBps: serviceRate,
                    code: serviceCode,
                    orderItemId: itemIds[k],
                };
            }
            const pl = biz.products[l.product];
            return {
                description: nameOfLine(pl, l.variant),
                quantity: l.qty,
                unitPaise: unitOf(pl, l.variant),
                rateBps: productRate(pl),
                code: registered ? pl.hsnCode : null,
                orderItemId: itemIds[k],
            };
        });
        const total = docLines.reduce(
            (s, l) => s + l.quantity * l.unitPaise,
            0,
        );
        const tax = docLines.reduce((s, l) => {
            const amount = l.quantity * l.unitPaise;
            const bps = l.rateBps ?? 0;
            return (
                s +
                (bps > 0
                    ? amount - Math.round((amount * 10_000) / (10_000 + bps))
                    : 0)
            );
        }, 0);
        const customerId =
            o.contact === null
                ? null
                : ensureCustomer(
                      o.contact,
                      o.placedAt - 2 * MINUTE,
                      o.treatment ? "BOOKING" : "PAYMENT",
                  );
        // A treatment is fulfilled once every visit it sold is attended,
        // as the API settles it (`orders/treatment-fulfil.ts`); one with a
        // visit missed or still to come stays open.
        const treated =
            o.treatment !== null &&
            o.treatment.visits.filter((p) => p.outcome === "ATTENDED").length >=
                biz.services[o.treatment.service].visits;
        const done = (!o.open && !o.treatment) || treated;
        orders.push({
            id: orderId,
            storeId: input.storeId,
            organizationId: orgId,
            orderId: number,
            customerId,
            walkInName: o.walkIn?.name ?? null,
            walkInPhone: o.walkIn?.phone ?? null,
            subtotal: rupees(total),
            tax: rupees(tax),
            total: rupees(total),
            currency: "INR",
            status: o.open ? "PROCESSING" : done ? "DELIVERED" : "PENDING",
            stage: o.open
                ? "READY"
                : treated
                  ? "DELIVERED"
                  : done
                    ? "COLLECTED"
                    : "NEW",
            fulfilment: o.treatment ? "APPOINTMENT_IN_PERSON" : "PICKUP",
            paymentStatus: o.paidAt === null ? "UNPAID" : "PAID",
            paidAt: o.paidAt === null ? null : new Date(o.paidAt),
            notes: o.open ? "Kept aside at the desk to collect." : null,
            createdAt: new Date(o.placedAt),
            updatedAt: new Date(
                Math.max(
                    Math.min(t, (o.paidAt ?? o.placedAt) + 5 * MINUTE),
                    treated
                        ? Math.max(
                              ...(o.treatment?.visits ?? []).map(
                                  (p) => p.outcomeAt ?? 0,
                              ),
                          )
                        : 0,
                ),
            ),
        });
        if (o.treatment) orderIdOf.set(o.treatment.n, orderId);
        o.lines.forEach((l, k) => {
            if (l.service !== undefined) {
                items.push({
                    id: itemIds[k],
                    orderId,
                    serviceId: serviceIdOf(l.service),
                    quantity: 1,
                    price: rupees(biz.services[l.service].pricePaise),
                    stockRow: "NONE",
                });
                return;
            }
            const placed = products[l.product];
            const stockLevelId =
                l.variant === null
                    ? placed.stockLevelId
                    : (placed.variantStock.at(l.variant) ?? null);
            if (o.open && stockLevelId) {
                held.set(stockLevelId, (held.get(stockLevelId) ?? 0) + l.qty);
            }
            items.push({
                id: itemIds[k],
                orderId,
                productId: placed.productId,
                variantId:
                    l.variant === null
                        ? null
                        : (placed.variantIds.at(l.variant) ?? null),
                quantity: l.qty,
                price: rupees(unitOf(biz.products[l.product], l.variant)),
                stockRow: stockLevelId
                    ? l.variant === null
                        ? "PRODUCT"
                        : "VARIANT"
                    : null,
                stockLevelId,
                heldQuantity: o.open ? l.qty : 0,
                soldQuantity: o.open ? 0 : l.qty,
            });
        });
        if (o.paidAt !== null) {
            const { m, ref } = deskMethod(counterRng);
            const contact = o.contact === null ? null : people[o.contact];
            docs.push({
                id: sid("invoice", "o", o.key),
                status: "PAID",
                source: "ORDER",
                bookingId: null,
                orderId,
                packPurchaseId: null,
                subscriptionId: null,
                period: null,
                contactId: contact?.id ?? null,
                billToName: contact
                    ? `${contact.first} ${contact.last}`
                    : (o.walkIn?.name ?? "Walk-in"),
                billToEmail: contact?.email ?? null,
                createdAt: new Date(o.paidAt),
                issuedAt: new Date(o.paidAt),
                dueAt: null,
                paidAt: new Date(o.paidAt),
                paymentMethod: "RECORDED",
                paymentReference: m === "CASH" ? null : ref,
                paymentNote: `Paid at the counter by ${m === "UPI" ? "UPI" : m === "CARD" ? "card" : "cash"}`,
                createdByUserId: o.treatment ? desk : team(counterRng),
                lines: docLines,
            });
        }
        if (o.review && o.contact !== null) {
            const pl = biz.products[o.review.product];
            const rv = pl.reviews[o.review.review];
            const invitationId = sid("invitation", o.key);
            const reviewedAt = istAt(now, -rv.daysAgo, 20 * 60).getTime();
            invitations.push({
                id: invitationId,
                organizationId: orgId,
                orderId,
                tokenHash: hashHex(invitationId),
                toAddress: people[o.contact].email,
                expiresAt: new Date(reviewedAt + 25 * DAY),
                completedAt: new Date(reviewedAt),
                lastSentAt: new Date(o.placedAt + 4 * DAY),
                createdAt: new Date(o.placedAt + 4 * DAY),
            });
            reviews.push({
                id: sid("review", o.key),
                organizationId: orgId,
                storeId: input.storeId,
                invitationId,
                orderItemId: itemIds[0],
                productId: products[o.review.product].productId,
                customerId,
                productName: pl.name,
                invitedTo: people[o.contact].email,
                rating: rv.rating,
                body: rv.body,
                displayName: rv.displayName,
                status: "PUBLISHED",
                reply: rv.reply,
                repliedAt: rv.reply ? new Date(reviewedAt + 18 * HOUR) : null,
                createdAt: new Date(reviewedAt),
            });
        }
    });

    // --- bookings, their events, the classes spent --------------------------------------
    const bookings: Prisma.BookingCreateManyInput[] = [];
    const events: Prisma.BookingEventCreateManyInput[] = [];
    const redemptions: Prisma.PackRedemptionCreateManyInput[] = [];
    const onlineByDay = new Map<string, number>();
    for (const p of planned) {
        const person = people[p.contact];
        const svc = biz.services[p.service];
        const name = `${person.first} ${person.last}`;
        const k = tail(p.id);
        const lastTouched = p.cancelledAt ?? p.outcomeAt ?? p.createdAt;
        const order =
            p.order === null ? null : (orderIdOf.get(p.order) ?? null);
        if (p.madeBy === null) {
            const iso = new Date(p.createdAt).toISOString().slice(0, 10);
            onlineByDay.set(iso, (onlineByDay.get(iso) ?? 0) + 1);
        }
        bookings.push({
            id: p.id,
            organizationId: orgId,
            serviceId: serviceIdOf(p.service),
            contactId: person.id,
            staffId: staffIdOf(p.staff),
            startAt: new Date(p.start),
            endAt: new Date(p.end),
            timezone: TIMEZONE,
            status: p.status,
            outcome: p.outcome,
            cancelledAt:
                p.cancelledAt === null ? null : new Date(p.cancelledAt),
            cancelledLate: isLate(p),
            paidWith:
                p.pay === "ORDER" ? null : p.pay === "DEPOSIT" ? "PAID" : p.pay,
            subscriptionId:
                p.subscription === null ? null : sid("sub", p.subscription),
            orderId: order,
            visitNumber: order ? p.visit : null,
            locationType: p.locationType,
            bookerName: name,
            bookerEmail: person.email,
            bookerPhone: person.phone,
            bookedOnline: p.madeBy === null,
            freeCancelUntil: new Date(
                p.start - biz.rules.freeCancelHours * HOUR,
            ),
            intakeNote: p.note?.text ?? null,
            snapshot: {
                service: {
                    id: serviceIdOf(p.service),
                    name: svc.name,
                    durationMinutes: svc.minutes,
                    bufferBeforeMinutes: svc.buffer ?? 0,
                    bufferAfterMinutes: svc.buffer ?? 0,
                    capacity: 1,
                    timezone: TIMEZONE,
                    priceCents: svc.pricePaise,
                    ...(registered
                        ? {
                              listPriceCents: svc.pricePaise,
                              gstPriceMode: "INCLUDED",
                          }
                        : {}),
                    currency: "INR",
                    locationType: svc.locationType,
                    meetingUrl: svc.meetingUrl,
                    depositMode: svc.depositMode,
                },
                ...(p.pay === "DEPOSIT"
                    ? { deposit: { cents: depositOf(svc.pricePaise) } }
                    : {}),
                slot: {
                    startAt: new Date(p.start).toISOString(),
                    endAt: new Date(p.end).toISOString(),
                },
                booker: { name, email: person.email, phone: person.phone },
            },
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(Math.min(t, lastTouched)),
        });
        events.push({
            id: sid("bookingevent", k, "booked"),
            bookingId: p.id,
            organizationId: orgId,
            type: "BOOKED",
            actorUserId: p.madeBy,
            toStartAt: new Date(p.start),
            createdAt: new Date(p.createdAt),
        });
        if (p.cancelledAt !== null) {
            events.push({
                id: sid("bookingevent", k, "cancelled"),
                bookingId: p.id,
                organizationId: orgId,
                type: "CANCELLED",
                actorUserId: p.cancelledBy,
                fromStartAt: new Date(p.start),
                createdAt: new Date(p.cancelledAt),
            });
        }
        if (p.outcome && p.outcomeAt !== null) {
            events.push({
                id: sid("bookingevent", k, "outcome"),
                bookingId: p.id,
                organizationId: orgId,
                type: p.outcome,
                actorUserId: p.outcomeBy,
                fromStartAt: new Date(p.start),
                createdAt: new Date(p.outcomeAt),
            });
        }
        if (p.pay === "PACK" && p.purchase !== null) {
            const given = p.status === "CANCELLED" && !isLate(p);
            redemptions.push({
                id: sid("redemption", k),
                organizationId: orgId,
                purchaseId: sid("purchase", p.purchase),
                bookingId: p.id,
                reversedAt:
                    given && p.cancelledAt !== null
                        ? new Date(p.cancelledAt)
                        : null,
                createdAt: new Date(p.createdAt),
            });
        }
    }

    // --- contacts: each from the first thing they did -------------------------------------
    const firstSeen = new Map<number, { at: number; online: boolean }>();
    const seen = (c: number, at: number, online: boolean) => {
        const f = firstSeen.get(c);
        if (!f || at < f.at) firstSeen.set(c, { at, online });
    };
    for (const p of planned) seen(p.contact, p.createdAt, p.madeBy === null);
    for (const p of purchases) seen(p.contact, p.at, false);
    for (const s of subs) seen(s.contact, s.anchor, false);
    for (const o of orderPlans)
        if (o.contact !== null) seen(o.contact, o.placedAt, false);

    // Enquiries through the site's form.
    const submissions: Prisma.SubmissionCreateManyInput[] = [];
    const entriesByDay = new Map<string, number>();
    const enquiryRng = rngFor("enquiries");
    biz.enquiries.forEach((e, i) => {
        const contact =
            e.client !== null
                ? clientIndex(e.client)
                : (() => {
                      const n = people.length;
                      people.push({
                          id: sid("contact", n),
                          key: null,
                          first: e.first,
                          last: e.last,
                          email: emailOf(e.first, e.last),
                          phone: e.phone,
                          gender: biz.names.men.includes(e.first) ? "m" : "f",
                      });
                      return n;
                  })();
        const at = istAt(
            now,
            -e.daysAgo,
            enquiryRng.int(9 * 60, 23 * 60),
        ).getTime();
        const createdAt = Math.min(at, t - 20 * MINUTE);
        seen(contact, createdAt - MINUTE, true);
        const person = people[contact];
        submissions.push({
            id: sid("submission", i),
            organizationId: orgId,
            formId: sid("form", "enquiry"),
            contactId: person.id,
            leadId: null,
            data: {
                name: `${person.first} ${person.last}`,
                email: person.email,
                phone: e.phone,
                ...(e.extra ?? {}),
                message: e.message,
            },
            createdAt: new Date(createdAt),
        });
        const iso = new Date(createdAt).toISOString().slice(0, 10);
        entriesByDay.set(iso, (entriesByDay.get(iso) ?? 0) + 1);
    });

    const contactRng = rngFor("contacts");
    const sources = ["WALK_IN", "INSTAGRAM", "REFERRAL", "GOOGLE", "WALK_IN"];
    const contacts: Prisma.ContactCreateManyInput[] = [];
    people.forEach((p, i) => {
        const f = firstSeen.get(i);
        // Someone never seen in these months came in before them.
        const at = Math.min(
            f
                ? f.at - 5 * MINUTE
                : istAt(now, -contactRng.int(95, 420), 12 * 60).getTime(),
            t - HOUR,
        );
        contacts.push({
            id: p.id,
            organizationId: orgId,
            email: p.email,
            firstName: p.first,
            lastName: p.last,
            phone: p.phone,
            source: f?.online ? "WEBSITE" : contactRng.pick(sources),
            createdAt: new Date(at),
            updatedAt: new Date(at),
        });
    });
    // A customer exists no earlier than their contact.
    const contactAt = new Map(
        contacts.map((c) => [c.id, (c.createdAt as Date).getTime()]),
    );
    for (const c of customers) {
        const link = links.find((l) => l.customerId === c.id);
        const at = link ? (contactAt.get(link.contactId) ?? 0) : 0;
        const created = (c.createdAt as Date).getTime();
        if (created < at) {
            c.createdAt = new Date(at);
            c.updatedAt = new Date(at);
            if (link) link.createdAt = new Date(at);
        }
    }

    // --- Needs attention and notes ---------------------------------------------------------
    const attention: Prisma.ContactAttentionCreateManyInput[] = [];
    const notes: Prisma.ContactNoteCreateManyInput[] = [];
    biz.clients.forEach((c, i) => {
        const at = new Date(
            (contactAt.get(people[i].id) ?? t - DAY) + 15 * MINUTE,
        );
        c.attention.forEach((a, k) => {
            attention.push({
                id: sid("attention", c.key, k),
                organizationId: orgId,
                contactId: people[i].id,
                kind: a.kind,
                label: a.label,
                detail: a.detail,
                sensitive: a.sensitive,
                source: "STAFF",
                status: "ACTIVE",
                createdByUserId: desk,
                createdAt: at,
                updatedAt: at,
            });
        });
        c.notes.forEach((body, k) => {
            const when = new Date(
                Math.min(t - HOUR, at.getTime() + (k + 1) * 9 * DAY),
            );
            notes.push({
                id: sid("note", c.key, k),
                organizationId: orgId,
                contactId: people[i].id,
                body,
                createdByUserId: k % 2 === 0 ? desk : owner,
                createdAt: when,
                updatedAt: when,
            });
        });
    });
    for (const p of planned) {
        if (!p.note) continue;
        attention.push({
            id: sid("attention", tail(p.id), "note"),
            organizationId: orgId,
            contactId: people[p.contact].id,
            kind: p.note.kind,
            label: p.note.label,
            detail: p.note.text,
            sensitive: true,
            source: "BOOKING_PAGE",
            status: "SUGGESTED",
            bookingId: p.id,
            createdByUserId: null,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.createdAt),
        });
    }

    const paidByDay = new Map<string, number>();
    for (const o of orders) {
        if (o.paymentStatus !== "PAID") continue;
        const iso = (o.createdAt as Date).toISOString().slice(0, 10);
        paidByDay.set(iso, (paidByDay.get(iso) ?? 0) + 1);
    }

    return {
        closures,
        timeOff,
        contacts,
        customers,
        links,
        purchases: packPurchases,
        subscriptions,
        orders,
        items,
        bookings,
        events,
        redemptions,
        invitations,
        reviews,
        attention,
        notes,
        submissions,
        intents,
        attempts,
        docs,
        held,
        paidByDay,
        entriesByDay,
        onlineByDay,
    };
}

/** A stable hex digest for a review invitation's token hash. */
function hashHex(s: string): string {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    let out = "";
    for (let round = 0; round < 8; round++) {
        for (const ch of `${s}/${round}`) {
            a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0;
            b = Math.imul(b + ch.charCodeAt(0), 2246822519) >>> 0;
        }
        out += ((a ^ b) >>> 0).toString(16).padStart(8, "0");
    }
    return out;
}
