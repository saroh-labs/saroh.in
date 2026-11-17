import type { Prisma } from "@prisma/client";

import type { Period } from "../showcase/periods";
import { boundary, periodLabel } from "../showcase/periods";
import type { Rng } from "../showcase/random";
import type { GlobalBusiness } from "./data";

/**
 * Memberships on a Global demo business (paid plans, owner 16 Nov 2026): the
 * plans it sells and who is on them, with an invoice each period. Planned
 * only, no database, like `planGlobal`; invoices go out with the rest.
 * (Class packs aren't offered on any plan, DEC-099, so none are sold here.)
 *
 * Mostly active members renewing on their day and paid by card or cash at the
 * desk; exactly one renewal left unpaid past its due date (the failed one the
 * Subscriptions list flags), one paused and one stopping at its period's end.
 */

const DAY = 86_400_000;
const DUE_DAYS = 7;
const money = (cents: number) => (cents / 100).toFixed(2);

/** What `writeInvoices` needs of a membership invoice. */
export interface BillingDoc {
    id: string;
    status: "ISSUED" | "PAID";
    source: "SUBSCRIPTION";
    contactId: string;
    billToName: string;
    billToEmail: string;
    issuedAt: Date;
    dueAt: Date;
    paidAt: Date | null;
    paymentMethod: string | null;
    subscriptionId?: string;
    period?: Period;
    lines: { description: string; quantity: number; unit: number }[];
}

interface Person {
    contactId: string;
    name: string;
    email: string;
}

export function planBilling(
    biz: GlobalBusiness,
    a: {
        orgId: string;
        sid: (...parts: (string | number)[]) => string;
        rng: (concern: string) => Rng;
        now: Date;
        demoUserId: string;
        people: readonly Person[];
    },
) {
    const { orgId, sid, now, people } = a;
    const zone = biz.zone;
    const docs: BillingDoc[] = [];
    const paid = (rng: Rng, issuedAt: Date) => ({
        status: "PAID" as const,
        paidAt: new Date(
            Math.min(
                issuedAt.getTime() + rng.int(0, 3) * DAY + 30 * 60_000,
                now.getTime() - 60_000,
            ),
        ),
        paymentMethod: rng.chance(0.7) ? "CARD" : "CASH",
    });

    // --- memberships
    const plans: Prisma.SubscriptionPlanCreateManyInput[] = [];
    const subs: Prisma.CustomerSubscriptionCreateManyInput[] = [];
    const m = biz.memberships;
    if (m) {
        const rng = a.rng("memberships");
        const since = new Date(now.getTime() - 400 * DAY);
        m.plans.forEach((p, i) =>
            plans.push({
                id: sid("plan", i),
                organizationId: orgId,
                name: p.name,
                description: p.description,
                price: money(p.price),
                currency: biz.currency,
                interval: p.interval,
                classesPerMonth: p.classesPerMonth ?? null,
                status: "ACTIVE",
                createdAt: since,
                updatedAt: since,
            }),
        );
        // The regulars first, then whoever else, never the same person twice.
        const members = people.slice(0, m.members);
        const failedAt = members.length - 2;
        members.forEach((person, i) => {
            const failed = i === failedAt;
            // A week's invoice is never a week past due before the next, so
            // the failed renewal is on the first plan that isn't weekly.
            const planIndex = failed
                ? m.plans.findIndex((p) => p.interval !== "WEEK")
                : i < m.plans.length
                  ? i
                  : m.plans.indexOf(rng.weighted(m.plans, (p) => p.weight));
            if (planIndex < 0) throw new Error(`${biz.name}: no monthly plan`);
            const plan = m.plans[planIndex];
            const paused = i === members.length - 1;
            const ending = i === members.length - 3;
            // The failed renewal's last period began 8-14 days ago, so its
            // invoice is past the week it had to be paid in.
            const anchorDays = failed
                ? (plan.interval === "YEAR" ? 730 : 60) + rng.int(11, 14)
                : plan.interval === "WEEK"
                  ? rng.int(14, 90)
                  : rng.int(20, 300);
            const local = new Date(now.getTime() - anchorDays * DAY);
            // The API anchors at the start of the business's day.
            const anchor = startOfDay(local, zone);
            const subscribedAt = new Date(
                anchor.getTime() + rng.int(9 * 60, 18 * 60) * 60_000,
            );
            const pausedAt = paused
                ? new Date(now.getTime() - rng.int(5, 12) * DAY)
                : null;
            const until = pausedAt ?? now;
            const at = (n: number) => boundary(anchor, plan.interval, zone, n);
            let n = 0;
            while (at(n + 1) <= until) n++;
            const subscriptionId = sid("sub", i);
            for (let k = 0; k <= n; k++) {
                const period = { start: at(k), end: at(k + 1) };
                const issuedAt =
                    k === 0
                        ? subscribedAt
                        : new Date(
                              period.start.getTime() + rng.int(1, 55) * 60_000,
                          );
                const unpaid = failed && k === n;
                docs.push({
                    id: sid("invoice", "sub", i, k),
                    source: "SUBSCRIPTION",
                    subscriptionId,
                    period,
                    contactId: person.contactId,
                    billToName: person.name,
                    billToEmail: person.email,
                    issuedAt,
                    dueAt: new Date(issuedAt.getTime() + DUE_DAYS * DAY),
                    ...(unpaid
                        ? {
                              status: "ISSUED",
                              paidAt: null,
                              paymentMethod: null,
                          }
                        : paid(rng, issuedAt)),
                    lines: [
                        {
                            description: `${plan.name} · ${periodLabel(period, zone)}`,
                            quantity: 1,
                            unit: plan.price,
                        },
                    ],
                });
            }
            subs.push({
                id: subscriptionId,
                organizationId: orgId,
                planId: sid("plan", planIndex),
                contactId: person.contactId,
                status: paused ? "PAUSED" : "ACTIVE",
                price: money(plan.price),
                currency: biz.currency,
                interval: plan.interval,
                timezone: zone,
                anchorAt: anchor,
                currentPeriodStart: at(n),
                currentPeriodEnd: at(n + 1),
                pausedAt,
                cancelAtPeriodEnd: ending,
                createdByUserId: a.demoUserId,
                collectionWeekday: m.collectionWeekday ?? null,
                classesPerPeriod: plan.classesPerMonth ?? null,
                classesPerPeriodSetAt: at(n),
                createdAt: subscribedAt,
                updatedAt: pausedAt ?? at(n),
            });
        });
    }

    return { plans, subs, docs };
}

/** Midnight of `at`'s day in a fixed-offset zone. */
function startOfDay(at: Date, zone: string): Date {
    const local = new Date(at.toLocaleString("en-US", { timeZone: zone }));
    const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
    const offset = local.getTime() - utc.getTime();
    const shifted = new Date(at.getTime() + offset);
    return new Date(
        Date.UTC(
            shifted.getUTCFullYear(),
            shifted.getUTCMonth(),
            shifted.getUTCDate(),
        ) - offset,
    );
}
