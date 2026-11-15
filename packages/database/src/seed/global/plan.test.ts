import { describe, expect, it } from "vitest";

import {
    BOOKINGS_A_MONTH,
    GLOBAL_BUSINESSES,
    IRONVALE,
    WRENFIELD,
} from "./data";
import { morningZone } from "./morning-zone";
import { planGlobal } from "./run";

const DAY = 86_400_000;
const FREE_MONTHLY_CAP = 20;

// Five weeks running over a month's end, at a different hour each day: the
// seed runs on any day, at any time.
const NOWS = Array.from({ length: 35 }, (_, i) => {
    const t = Date.UTC(2026, 10, 10 + i, (i * 7) % 24, 30);
    return new Date(Math.floor(t / 1_800_000) * 1_800_000);
});

const monthOf = (at: Date, zone: string) =>
    at.toLocaleDateString("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
    });

function planAt(fixture: (typeof GLOBAL_BUSINESSES)[number], now: Date) {
    const biz = { ...fixture, zone: morningZone(now) };
    const plan = planGlobal(biz, now, "user");
    // The zone is a fixed offset, so a local day is 24 hours.
    const midnight = new Date(
        now.toLocaleString("en-US", { timeZone: biz.zone }),
    );
    midnight.setHours(0, 0, 0, 0);
    const offset =
        new Date(
            now.toLocaleString("en-US", { timeZone: biz.zone }),
        ).getTime() - now.getTime();
    const dayStart = midnight.getTime() - offset;
    return { biz, plan, dayStart };
}

describe.each(NOWS.map((now) => [now.toISOString(), now] as const))(
    "the Global diary seeded at %s",
    (_, now) => {
        it.each(GLOBAL_BUSINESSES.map((b) => [b.name, b] as const))(
            "%s stays inside Free and one person's hours",
            (__, fixture) => {
                const { biz, plan, dayStart } = planAt(fixture, now);
                const counted = plan.bookings.filter(
                    (b) => !b.courseEnrollmentId,
                );
                const worst = (rows: { createdAt?: Date | string }[]) => {
                    const per = new Map<string, number>();
                    for (const r of rows) {
                        const m = monthOf(r.createdAt as Date, biz.zone);
                        per.set(m, (per.get(m) ?? 0) + 1);
                    }
                    return Math.max(0, ...Array.from(per.values()));
                };
                expect(worst(counted)).toBeLessThanOrEqual(BOOKINGS_A_MONTH);
                expect(
                    worst(counted.filter((b) => b.bookedOnline)),
                ).toBeLessThanOrEqual(FREE_MONTHLY_CAP);
                expect(
                    worst(plan.treatments.map((t) => t.order)),
                ).toBeLessThanOrEqual(FREE_MONTHLY_CAP);

                // One diary: a class's seats share a start, nothing else overlaps.
                const slots = new Map<string, [number, number]>();
                for (const b of plan.bookings) {
                    if (b.status !== "CONFIRMED") continue;
                    const s = (b.startAt as Date).getTime();
                    const e = (b.endAt as Date).getTime();
                    slots.set(`${b.serviceId}@${s}`, [s, e]);
                    // Inside the staff hours of its own weekday.
                    const day = Math.floor((s - dayStart) / DAY);
                    const from = (s - dayStart - day * DAY) / 60_000;
                    const to = from + (e - s) / 60_000;
                    const weekday = new Date(s).toLocaleDateString("en-US", {
                        timeZone: biz.zone,
                        weekday: "short",
                    });
                    const wd = [
                        "Sun",
                        "Mon",
                        "Tue",
                        "Wed",
                        "Thu",
                        "Fri",
                        "Sat",
                    ].indexOf(weekday);
                    const mins = (hhmm: string) => {
                        const [h, m] = hhmm.split(":").map(Number);
                        return h * 60 + m;
                    };
                    expect(
                        biz.staff.some((t) =>
                            t.hours.some(
                                (h) =>
                                    h.days.includes(wd) &&
                                    from >= mins(h.from) &&
                                    to <= mins(h.to),
                            ),
                        ),
                        `${b.id} at ${weekday} ${from}`,
                    ).toBe(true);
                }
                const spans = Array.from(slots.values()).sort(
                    (x, y) => x[0] - y[0],
                );
                for (let k = 1; k < spans.length; k++) {
                    expect(spans[k][0]).toBeGreaterThanOrEqual(spans[k - 1][1]);
                }

                if (biz.todayAtLeast) {
                    const today = plan.bookings.filter(
                        (b) =>
                            b.status === "CONFIRMED" &&
                            (b.startAt as Date).getTime() >= dayStart &&
                            (b.startAt as Date).getTime() < dayStart + DAY,
                    );
                    expect(today.length).toBeGreaterThanOrEqual(
                        biz.todayAtLeast,
                    );
                }
            },
        );

        it("gives Wrenfield Dental's Orders list every state", () => {
            const { plan } = planAt(WRENFIELD, now);
            const orders = plan.treatments.map((t) => t.order);
            expect(orders).toHaveLength(8);
            const visits = (id: string) =>
                plan.bookings.filter((b) => b.orderId === id);
            const done = orders.filter((o) => o.status === "DELIVERED");
            expect(done.map((o) => o.orderId)).toEqual(["ORD-003"]);
            const deposit = orders.filter(
                (o) => o.paymentStatus === "UNPAID" && o.paidByHand !== "0.00",
            );
            expect(deposit.map((o) => [o.orderId, o.paidByHand])).toEqual([
                ["ORD-005", "1600.00"],
            ]);
            const ethan = orders.find((o) => o.orderId === "ORD-006");
            expect(visits(ethan?.id ?? "")).toHaveLength(1);
            // Liam's braces: visit 3 of 4 today.
            const liam = visits(
                orders.find((o) => o.orderId === "ORD-004")?.id ?? "",
            );
            const { dayStart } = planAt(WRENFIELD, now);
            const third = liam.find((b) => b.visitNumber === 3);
            expect((third?.startAt as Date).getTime()).toBeGreaterThanOrEqual(
                dayStart,
            );
            expect((third?.startAt as Date).getTime()).toBeLessThan(
                dayStart + DAY,
            );
            // Paid on the order: no visit is paid at the desk on its own.
            expect(
                plan.bookings.filter((b) => b.orderId && b.paidWith),
            ).toEqual([]);
        });

        it("gives Ironvale Fitness a training block part way through", () => {
            const { plan } = planAt(IRONVALE, now);
            expect(plan.treatments).toHaveLength(1);
            const block = plan.bookings
                .filter((b) => b.orderId === plan.treatments[0].order.id)
                .sort((x, y) => (x.visitNumber ?? 0) - (y.visitNumber ?? 0));
            expect(block.map((b) => b.outcome)).toEqual(["ATTENDED", null]);
            expect((block[1].startAt as Date).getTime()).toBeGreaterThan(
                now.getTime(),
            );
        });
    },
);
