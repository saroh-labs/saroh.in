import { describe, expect, it } from "vitest";

import {
    KAVI_DENTISTS,
    KAVI_PHONE,
    KAVI_PHONE_E164,
    KAVI_RULES,
    KAVI_SAC,
    KAVI_SERVICES,
    PT,
    SVC,
} from "./clinic-data";
import type { KaviWorld } from "./clinic-plan";
import {
    diwaliClosures,
    financialYear,
    lineDescription,
    planKavi,
    serviceIdOf,
    staffIdOf,
} from "./clinic-plan";
import { istAt, minuteOf } from "./people";

/**
 * Kavi Dental is planned relative to `now` (E29). A seed that works today must
 * work on any day, at any hour: plan the clinic for many `now`s and prove each
 * rule the product keeps, and each state its films need, on the plan itself —
 * the same rules `checkShowcase` and `checkKavi` prove on the written rows.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST = 330 * MINUTE;

const plan = (now: Date) =>
    planKavi({ now, orgId: "org", ownerUserId: "owner", deskUserId: "desk" });

const ms = (d: Date | string | null | undefined): number =>
    d instanceof Date ? d.getTime() : d ? Date.parse(d) : Number.NaN;

const localDay = (t: number) => {
    const local = new Date(t + IST);
    return {
        weekday: local.getUTCDay(),
        minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    };
};

const serviceIndex = new Map(KAVI_SERVICES.map((_, i) => [serviceIdOf(i), i]));
const dentistIndex = new Map(KAVI_DENTISTS.map((d, i) => [staffIdOf(d), i]));

/** A start the slot engine would offer: inside the week, on the service's step. */
function onTheirWeek(
    staffId: string,
    serviceId: string,
    start: number,
    end: number,
) {
    const di = dentistIndex.get(staffId);
    const si = serviceIndex.get(serviceId);
    if (di === undefined || si === undefined) return false;
    const dentist = KAVI_DENTISTS[di];
    const len = KAVI_SERVICES[si].minutes;
    const { weekday, minute } = localDay(start);
    return (
        end - start === len * MINUTE &&
        dentist.services.includes(si) &&
        dentist.hours.some(
            (w) =>
                w.days.includes(weekday) &&
                minuteOf(w.from) <= minute &&
                minute + len <= minuteOf(w.to) &&
                (minute - minuteOf(w.from)) % len === 0,
        )
    );
}

function noOverlaps(
    what: string,
    rows: { key: string; start: number; end: number; id: string }[],
    when: string,
) {
    const byKey = new Map<string, typeof rows>();
    for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
    for (const list of Array.from(byKey.values())) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) {
            expect(
                list[i].start >= list[i - 1].end,
                `${what}: ${list[i - 1].id} and ${list[i].id} at ${when}`,
            ).toBe(true);
        }
    }
}

function checkDay(now: Date): KaviWorld {
    const t = now.getTime();
    const when = now.toISOString();
    const w = plan(now);

    // --- the Diwali closure to come, and a whole day off this week
    expect(
        w.closures.some((c) => ms(c.endAt) > t),
        when,
    ).toBe(true);
    for (const c of w.closures) {
        expect(c.reason, when).toMatch(/Diwali/);
        expect(ms(c.createdAt), when).toBeLessThanOrEqual(t);
    }
    expect(w.timeOff, when).toHaveLength(1);
    const off = w.timeOff[0];
    expect(ms(off.startAt), when).toBeGreaterThan(t);
    expect(ms(off.startAt) - t, when).toBeLessThan(7 * DAY);
    expect(ms(off.endAt) - ms(off.startAt), when).toBe(DAY);

    // --- every booking one the product could have made
    const booked = new Map(
        w.events
            .filter((e) => e.type === "BOOKED")
            .map((e) => [e.bookingId, e]),
    );
    const standing = w.bookings.filter((b) => b.status !== "CANCELLED");
    for (const b of w.bookings) {
        const start = ms(b.startAt);
        const end = ms(b.endAt);
        const made = ms(b.createdAt);
        const tag = `${b.id} at ${when}`;
        expect(b.staffId, tag).toBeTruthy();
        expect(onTheirWeek(b.staffId ?? "", b.serviceId, start, end), tag).toBe(
            true,
        );
        expect(made, tag).toBeLessThanOrEqual(t);
        expect(made, tag).toBeLessThan(start);
        expect(ms(b.updatedAt), tag).toBeLessThanOrEqual(t);
        if (booked.get(b.id ?? "")?.actorUserId === null) {
            // Made on the booking page, inside its rules.
            expect(start - made, tag).toBeGreaterThanOrEqual(
                KAVI_RULES.latestBookingMinutes * MINUTE,
            );
            expect(start - made, tag).toBeLessThanOrEqual(
                KAVI_RULES.bookAheadDays * DAY,
            );
        }
        if (b.status === "CANCELLED") {
            const at = ms(b.cancelledAt);
            expect(at, tag).toBeGreaterThan(made);
            expect(at, tag).toBeLessThanOrEqual(t);
            expect(at, tag).toBeLessThan(start);
            expect(b.cancelledLate, tag).toBe(
                at > start - KAVI_RULES.freeCancelHours * HOUR,
            );
            expect(b.outcome, tag).toBeNull();
            expect(b.paidWith, tag).not.toBe("PAID");
        } else {
            expect(b.cancelledAt ?? null, tag).toBeNull();
            expect(b.cancelledLate, tag).toBe(false);
            const inside = [
                ...w.closures,
                ...w.timeOff.filter((o) => o.staffId === b.staffId),
            ];
            expect(
                inside.some((c) => ms(c.startAt) < end && start < ms(c.endAt)),
                tag,
            ).toBe(false);
        }
        if (b.outcome) expect(end, tag).toBeLessThanOrEqual(t);
        const svc = KAVI_SERVICES[serviceIndex.get(b.serviceId) ?? -1];
        // Where an EITHER booking happens is chosen per booking (E1).
        if (svc.locationType === "EITHER") {
            expect(["IN_PERSON", "ONLINE"], tag).toContain(b.locationType);
        } else {
            expect(b.locationType ?? null, tag).toBeNull();
        }
    }
    const span = (key: (b: (typeof standing)[number]) => string) =>
        standing.map((b) => ({
            key: key(b),
            id: b.id ?? "",
            start: ms(b.startAt),
            end: ms(b.endAt),
        }));
    noOverlaps(
        "a dentist in two places",
        span((b) => b.staffId ?? ""),
        when,
    );
    // One person per service and start, cancelled bookings included: the
    // seed's checks read those as one session.
    const sessions = new Map<string, Set<string>>();
    for (const b of w.bookings) {
        const key = `${b.serviceId}@${ms(b.startAt)}`;
        sessions.set(
            key,
            (sessions.get(key) ?? new Set<string>()).add(b.staffId ?? ""),
        );
    }
    for (const [key, staff] of Array.from(sessions.entries())) {
        expect(staff.size, `${key} at ${when}`).toBe(1);
    }
    noOverlaps(
        "a service over its capacity",
        span((b) => b.serviceId),
        when,
    );
    noOverlaps(
        "a patient in two places",
        span((b) => b.contactId ?? ""),
        when,
    );
    for (const e of w.events) {
        expect(ms(e.createdAt), `${e.id} at ${when}`).toBeLessThanOrEqual(t);
    }

    // --- contacts and Needs attention exist before what they did
    const firstBooked = new Map<string, number>();
    for (const b of w.bookings) {
        const c = b.contactId ?? "";
        firstBooked.set(
            c,
            Math.min(firstBooked.get(c) ?? Infinity, ms(b.createdAt)),
        );
    }
    for (const c of w.contacts) {
        expect(ms(c.createdAt), when).toBeLessThanOrEqual(t);
        expect(ms(c.createdAt), when).toBeLessThanOrEqual(
            firstBooked.get(c.id ?? "") ?? Infinity,
        );
    }
    const contactAt = new Map(w.contacts.map((c) => [c.id, ms(c.createdAt)]));
    for (const a of w.attention) {
        expect(ms(a.createdAt), when).toBeLessThanOrEqual(t);
        expect(ms(a.createdAt), when).toBeGreaterThanOrEqual(
            contactAt.get(a.contactId) ?? Infinity,
        );
    }

    // --- money: one paid invoice per booking paid online, the desk's bills
    // after the visit, every line exempt, numbers in issue order
    const byId = new Map(w.bookings.map((b) => [b.id, b]));
    const paidOnline = w.bookings.filter((b) => b.paidWith === "PAID");
    const online = w.invoices.filter((i) => i.source === "BOOKING");
    expect(online.map((i) => i.bookingId).sort(), when).toEqual(
        paidOnline.map((b) => b.id).sort(),
    );
    for (const inv of w.invoices) {
        const tag = `${inv.id} at ${when}`;
        expect(inv.issuedAt.getTime(), tag).toBeLessThanOrEqual(t);
        // An order's invoice is never due: the order is where it is paid.
        if (inv.source === "ORDER") {
            expect(inv.dueAt, tag).toBeNull();
            expect(inv.status, tag).toBe("PAID");
        } else {
            expect(inv.dueAt?.getTime(), tag).toBeGreaterThanOrEqual(
                inv.issuedAt.getTime(),
            );
        }
        if (inv.status === "PAID") {
            expect(inv.paidAt?.getTime(), tag).toBeGreaterThanOrEqual(
                inv.issuedAt.getTime(),
            );
            expect(inv.paidAt?.getTime(), tag).toBeLessThanOrEqual(t);
            expect(inv.paymentMethod, tag).toBeTruthy();
        } else {
            expect(inv.paidAt, tag).toBeNull();
        }
        expect(
            inv.number.startsWith(
                `KD/${financialYear(inv.issuedAt.getTime())}/`,
            ),
            tag,
        ).toBe(true);
        for (const l of inv.lines) {
            expect(
                KAVI_SERVICES.some((s) => s.pricePaise === l.unitPaise),
                tag,
            ).toBe(true);
        }
        if (inv.bookingId) {
            const b = byId.get(inv.bookingId);
            expect(b?.contactId, tag).toBe(inv.contactId);
            expect(inv.dueAt?.getTime(), tag).toBe(inv.issuedAt.getTime());
        }
    }
    const series = new Map<string, string[]>();
    for (const inv of [...w.invoices].sort(
        (a, b) =>
            a.issuedAt.getTime() - b.issuedAt.getTime() ||
            a.id.localeCompare(b.id),
    )) {
        const key = inv.number.slice(0, inv.number.lastIndexOf("/"));
        series.set(key, [...(series.get(key) ?? []), inv.number]);
    }
    for (const [key, numbers] of Array.from(series.entries())) {
        expect(numbers, when).toEqual(
            numbers.map((_, i) => `${key}/${String(i + 1).padStart(4, "0")}`),
        );
        expect(
            w.sequences.find((s) => s.series === key)?.lastNumber,
            when,
        ).toBe(numbers.length);
    }

    // --- what the films need, on every day
    // The week Bookings opens on, as `checkKavi` reads it.
    const weekFrom = istAt(now, -3, 0).getTime();
    const weekTo = istAt(now, 7, 0).getTime();
    for (const d of KAVI_DENTISTS) {
        expect(
            standing.some(
                (b) =>
                    b.staffId === staffIdOf(d) &&
                    ms(b.startAt) >= weekFrom &&
                    ms(b.startAt) < weekTo,
            ),
            `${d.name} this week at ${when}`,
        ).toBe(true);
    }
    expect(
        w.bookings.some((b) => b.outcome === "ATTENDED"),
        when,
    ).toBe(true);
    expect(
        w.bookings.some((b) => b.outcome === "NO_SHOW"),
        when,
    ).toBe(true);
    expect(
        w.bookings.some((b) => b.cancelledLate),
        when,
    ).toBe(true);
    expect(
        standing.some((b) => ms(b.startAt) > t),
        when,
    ).toBe(true);
    const state = (i: KaviWorld["invoices"][number]) =>
        i.status === "PAID"
            ? i.source
            : (i.dueAt?.getTime() ?? Infinity) < t
              ? "overdue"
              : "due";
    for (const s of ["BOOKING", "MANUAL", "due", "overdue"]) {
        expect(
            w.invoices.some((i) => state(i) === s),
            `${s} at ${when}`,
        ).toBe(true);
    }
    const rahul = w.contacts[PT.rahul].id;
    const note = w.attention.find((a) => a.status === "SUGGESTED");
    expect(note?.contactId, when).toBe(rahul);
    expect(note?.sensitive, when).toBe(true);
    expect(byId.get(note?.bookingId ?? "")?.contactId, when).toBe(rahul);
    return w;
}

/** An instant at a Kolkata wall-clock time (UTC+5:30). */
const ist = (date: string, hhmm: string) =>
    new Date(`${date}T${hhmm}:00+05:30`);

// The seed rounds `now` down to the half hour; these cover before opening,
// the working day, after closing and late at night.
const TIMES = ["00:00", "06:30", "09:00", "12:30", "16:00", "19:30", "23:30"];

// 490 seeds. About 16s on a laptop, but over 120s on CI's runner, where
// turbo runs every package's tests at once (PR #825); hence the headroom.
const SWEEP_TIMEOUT_MS = 300_000;

describe("Kavi Dental seeded on any day", () => {
    it(
        "keeps every booking, bill and state, 70 days running",
        () => {
            // Across Diwali 2026: before the closure, inside it and after.
            const start = ist("2026-09-15", "00:00").getTime();
            for (let d = 0; d < 70; d++) {
                const date = new Date(start + d * DAY + IST)
                    .toISOString()
                    .slice(0, 10);
                for (const time of TIMES) checkDay(ist(date, time));
            }
        },
        SWEEP_TIMEOUT_MS,
    );

    it(
        "the same across month, year, leap-day and financial-year boundaries",
        () => {
            const dates = [
                "2026-03-31",
                "2026-04-01",
                "2026-12-31",
                "2027-01-01",
                "2027-02-28",
                "2027-03-31",
                "2027-04-01",
                "2027-10-29",
                "2028-02-29",
                "2028-10-17",
                "2029-01-01",
            ];
            for (const date of dates) {
                for (const time of TIMES) checkDay(ist(date, time));
            }
        },
        SWEEP_TIMEOUT_MS,
    );

    it("plans the same world twice in the same half hour", () => {
        const now = ist("2026-09-27", "10:30");
        expect(plan(now)).toEqual(plan(now));
    });

    it("prices every line at a service's price, 0%, SAC 9993", () => {
        const w = plan(ist("2026-09-27", "10:30"));
        expect(KAVI_SAC).toBe("9993");
        // An order's invoice names the service alone, as its order does.
        const lines = w.invoices
            .filter((i) => i.source !== "ORDER")
            .flatMap((i) => i.lines);
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) {
            expect(l.description).toMatch(
                / · (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+ \w{3} \d{4}, \d{2}:\d{2}$/,
            );
        }
    });

    it("keeps the hidden service off the page and the treatments to their scenes", () => {
        const hidden = KAVI_SERVICES.filter((s) => !s.shown);
        expect(hidden.map((s) => s.name)).toEqual(["X-ray, full mouth (OPG)"]);
        const w = plan(ist("2026-09-27", "10:30"));
        const treatments = w.bookings.filter((b) => {
            const s = KAVI_SERVICES[serviceIndex.get(b.serviceId) ?? -1];
            return s.visits > 1;
        });
        expect(treatments.map((b) => b.id).sort()).toEqual(
            ["farah_whitening", "rahul_rct_1", "rahul_rct_2"]
                .map((k) => `seed_sc_kavi_booking_${k}`)
                .sort(),
        );
        // Treatments are E9's orders: no invoice of their own here.
        const billed = new Set(
            w.invoices.flatMap((i) => (i.bookingId ? [i.bookingId] : [])),
        );
        for (const b of treatments) expect(billed.has(b.id ?? "")).toBe(false);
    });

    it("sells each treatment as one order, with a booking per visit (E9)", () => {
        const w = plan(ist("2026-09-27", "10:30"));
        const k = (key: string) => `seed_sc_kavi_booking_${key}`;
        expect(
            w.orders.map((o) => [
                o.key,
                o.visits.map((v) => [v.bookingId, v.visitNumber]),
            ]),
        ).toEqual([
            [
                "rahul_rct",
                [
                    [k("rahul_rct_1"), 1],
                    [k("rahul_rct_2"), 2],
                ],
            ],
            ["farah_whitening", [[k("farah_whitening"), 1]]],
        ]);
        for (const o of w.orders) {
            for (const v of o.visits) {
                const b = w.bookings.find((x) => x.id === v.bookingId);
                expect(b?.orderId).toBe(o.id);
                expect(b?.visitNumber).toBe(v.visitNumber);
                // Paid for on the order, never on the visit.
                expect(b?.paidWith).toBeNull();
                expect(b?.contactId).toBe(o.contactId);
            }
        }
        // Rahul's was paid at the desk: its one invoice, for the whole
        // treatment. Farah's is still due on the order, with no invoice.
        const [rahul, farah] = w.orders;
        const paper = w.invoices.filter((i) => i.orderId !== null);
        expect(paper.map((i) => i.orderId)).toEqual([rahul.id]);
        expect(paper[0].lines).toEqual([
            {
                description: "Root canal treatment",
                quantity: 1,
                unitPaise: KAVI_SERVICES[SVC.rootCanal].pricePaise,
                orderItemId: rahul.itemId,
            },
        ]);
        expect(rahul.paidAt).not.toBeNull();
        expect(farah.paidAt).toBeNull();
    });

    it("writes the line as the booking page's hold does", () => {
        expect(
            lineDescription(
                "Check-up and clean",
                ist("2026-09-15", "16:30").getTime(),
            ),
        ).toBe("Check-up and clean · Tue 15 Sep 2026, 16:30");
    });

    it("closes for Diwali from the day before to two days after", () => {
        const [c] = diwaliClosures(ist("2026-09-27", "10:30"));
        expect(new Date(c.start).toISOString()).toBe(
            ist("2026-11-07", "00:00").toISOString(),
        );
        expect(new Date(c.end).toISOString()).toBe(
            ist("2026-11-11", "00:00").toISOString(),
        );
    });

    it("refuses a day past the last Diwali it knows", () => {
        expect(() => plan(ist("2031-01-01", "10:00"))).toThrow(/DIWALI/);
    });
});

describe("Kavi Dental's public phone (DEC-053)", () => {
    it("is the desk's number as the profile stores it, E.164", () => {
        expect(KAVI_PHONE_E164).toMatch(/^\+[1-9]\d{7,14}$/);
        expect(KAVI_PHONE_E164).toBe(KAVI_PHONE.replace(/\s/g, ""));
    });
});
