import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { SHOWCASE_SEED, TIMEZONE } from "./data";
import { addMinutes, earliest, hashKey, istAt, phoneNumber } from "./people";
import { boundary, periodLabel } from "./periods";
import { PC_CLIENTS, PC_KEY, PC_PLANS, pcSpec } from "./pixel-chai-data";
import type { Rng } from "./random";
import { createRng } from "./random";
import type {
    StudioContext,
    StudioDoc,
    StudioLead,
    StudioOrder,
    StudioOrderLine,
    StudioPerson,
} from "./studio";
import {
    Busy,
    DAY_MS,
    diaryRows,
    must,
    payment,
    planDiary,
    studioId,
    writeContacts,
    writeDocs,
    writeInsights,
    writeLeads,
    writeOrders,
    writeStructure,
} from "./studio";
import { checkStudio } from "./studio-check";

export { PC_KEY } from "./pixel-chai-data";

/**
 * Loop Local Media (`pixel-chai-data.ts` for who it is and what it sells): the
 * dated world — eighteen months of retainers (about fifty running, two
 * paused, one whose renewal failed, about fifty that ended, some because the
 * client moved up a plan), every month's renewal invoiced; audit calls,
 * workshops, Google profile clean-ups and shoot days in the diary; brand
 * kits and festive packs billed by hand; printed standees and table tents
 * ordered online; a new-business pipeline fed by the site's form; notes; and
 * Insights traffic.
 */

const sid = studioId(PC_KEY);
const rngFor = (concern: string) =>
    createRng((SHOWCASE_SEED ^ hashKey(PC_KEY, concern)) >>> 0);

const FIRST = [
    "Aditya",
    "Akshay",
    "Amit",
    "Ankita",
    "Anushka",
    "Arpit",
    "Ayesha",
    "Deepak",
    "Divya",
    "Gaurav",
    "Harshita",
    "Hemant",
    "Ishaan",
    "Kavita",
    "Kunal",
    "Manish",
    "Meenal",
    "Mohit",
    "Neelam",
    "Nikhil",
    "Palak",
    "Pankaj",
    "Pooja",
    "Prateek",
    "Rahul",
    "Rashmi",
    "Ritu",
    "Rohan",
    "Sakshi",
    "Sameer",
    "Shweta",
    "Siddharth",
    "Sonal",
    "Sunil",
    "Swati",
    "Tanmay",
    "Varsha",
    "Vikas",
    "Vivek",
    "Yamini",
] as const;
const LAST = [
    "Agrawal",
    "Bansal",
    "Chouhan",
    "Dubey",
    "Gangwal",
    "Garg",
    "Jain",
    "Joshi",
    "Kale",
    "Khandelwal",
    "Malviya",
    "Mehta",
    "Mishra",
    "Modi",
    "Nagar",
    "Patidar",
    "Porwal",
    "Rathore",
    "Saxena",
    "Sethi",
    "Sharma",
    "Shukla",
    "Singhal",
    "Soni",
    "Tiwari",
    "Trivedi",
    "Verma",
    "Yadav",
    "Bhatia",
    "Choudhary",
] as const;
const AREAS = [
    "Vijay Nagar",
    "Palasia",
    "Sapna Sangeeta",
    "Rajwada",
    "Bhawarkuan",
    "South Tukoganj",
    "Old Palasia",
    "Saket Nagar",
    "Scheme 54",
    "MR 10",
    "Rau",
    "Annapurna Road",
    "Bengali Square",
    "Nipania",
] as const;
const STEMS = [
    "Shree",
    "Maa",
    "Narmada",
    "Malwa",
    "Holkar",
    "Ahilya",
    "Nayi",
    "Urban",
    "Green Leaf",
    "Silver Oak",
    "Royal",
    "Sunrise",
    "Kesar",
    "Tulsi",
    "Peacock",
    "Moonlight",
    "Riverside",
    "Lotus",
    "Indus",
    "Saanjh",
] as const;
const KINDS = [
    "Salon",
    "Café",
    "Dental Care",
    "Eye Clinic",
    "Physiotherapy",
    "Bakery",
    "Sweets",
    "Opticals",
    "Interiors",
    "Jewellers",
    "Boutique",
    "Coaching Classes",
    "Fitness Studio",
    "Restaurant",
    "Pet Clinic",
    "Diagnostics",
    "Furnishings",
    "Florist",
    "Dance Academy",
    "Play School",
] as const;

/** Which plan, how many of each now and gone (the market a five-person agency can serve). */
const LIVE_MIX: Record<string, number> = {
    listing: 28,
    starter: 11,
    growth: 8,
    pro: 4,
};
const ENDED_MIX: Record<string, number> = {
    listing: 24,
    starter: 16,
    growth: 8,
    pro: 2,
};

export async function seedPixelChai(
    ctx: StudioContext,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now } = ctx;
    const spec = pcSpec();
    const world = await writeStructure(ctx, spec);
    const rng = rngFor("people");
    const team = { owner: ctx.demoUserId, nikita: ctx.memberUserId };

    // --- the clients (a person at each business) and the prospects
    const LIVE = Object.values(LIVE_MIX).reduce((s, n) => s + n, 0);
    const CHURNED = 36;
    const PROSPECTS = 34;
    const usedEmails = new Set<string>();
    const usedCompanies = new Set<string>(PC_CLIENTS.map((c) => c.company));
    const people: StudioPerson[] = [];
    const total = LIVE + CHURNED + PROSPECTS;
    for (let n = 0; n < total; n++) {
        const named = PC_CLIENTS[n];
        let company: string = n < PC_CLIENTS.length ? named.company : "";
        while (!company || usedCompanies.has(company))
            company = `${rng.pick(STEMS)} ${rng.pick(KINDS)}`;
        usedCompanies.add(company);
        const first = rng.pick(FIRST);
        const last = rng.pick(LAST);
        let email = `${first}.${last}@example.com`.toLowerCase();
        for (let k = 2; usedEmails.has(email); k++)
            email = `${first}.${last}${k}@example.com`.toLowerCase();
        usedEmails.add(email);
        people.push({
            first,
            last,
            email,
            phone: phoneNumber(rng),
            company,
            city: n % 17 === 5 ? "Ujjain" : n % 23 === 7 ? "Dewas" : "Indore",
            state: "Madhya Pradesh",
            postalCode:
                n % 17 === 5 ? "456001" : n % 23 === 7 ? "455001" : "452001",
            source: rng.pick([
                "REFERRAL",
                "REFERRAL",
                "INSTAGRAM",
                "WEBSITE",
                "GOOGLE",
                "WALK_IN",
            ]),
            createdAt: istAt(now, -rng.int(20, 540), rng.int(10 * 60, 19 * 60)),
        });
    }
    const contacts = people.map((p, n) => ({
        id: sid("contact", n),
        name: `${p.first} ${p.last}`,
        first: p.first,
        last: p.last,
        email: p.email,
        phone: p.phone,
        company: p.company,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        address: `${p.company}, ${AREAS[n % AREAS.length]}`,
    }));
    const firstSeen = people.map((p) => p.createdAt);
    const seen = (n: number, at: Date) => {
        firstSeen[n] = earliest(
            firstSeen[n],
            new Date(at.getTime() - 3_600_000),
        );
    };

    // --- retainers
    const docs: StudioDoc[] = [];
    const subs = planRetainers(rngFor("retainers"), now, {
        live: LIVE,
        churned: CHURNED,
        team,
    });
    for (const s of subs.rows) seen(s.contact, s.createdAt);
    docs.push(...subs.docs);

    // --- the diary
    const busy = new Busy();
    const prospects = Array.from(
        { length: PROSPECTS },
        (_, k) => LIVE + CHURNED + k,
    );
    const diaryList = planDiary(rngFor("diary"), spec, {
        now,
        fromDay: -120,
        toDay: 21,
        busy,
        createdFloor: world.createdAt,
        weekday: [0.1, 1.2, 1.1, 1.1, 1.1, 1, 0.7],
        contactFor: (service, r) =>
            service.key === "audit"
                ? r.pick(prospects)
                : r.int(0, LIVE + CHURNED - 1),
    });
    for (const b of diaryList) seen(b.contact, b.createdAt);
    const diary = diaryRows(spec, world, diaryList, {
        now,
        contacts,
        actor: (b) => (b.staff === "nikita" ? team.nikita : team.owner),
        bookingId: (n) => sid("booking", n),
    });
    const payRng = rngFor("payments");
    diaryList.forEach((b, n) => {
        if (!b.paidWith) return;
        const service = must(spec.services.find((s) => s.key === b.service));
        const label = b.startAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: TIMEZONE,
        });
        const line = {
            description: `${service.name} — ${label}`,
            quantity: 1,
            unitPaise: service.pricePaise,
            sac: service.sac,
        };
        if (b.paidWith === "PAID") {
            docs.push({
                id: sid("invoice", "booking", n),
                contact: b.contact,
                createdAt: b.createdAt,
                issuedAt: b.createdAt,
                dueAt: b.createdAt,
                lines: [line],
                source: "BOOKING",
                bookingId: sid("booking", n),
                createdByUserId: null,
                paid: payment(payRng, b.createdAt, "UPI"),
            });
        } else if (b.outcome === "ATTENDED") {
            const at = addMinutes(b.startAt, service.minutes + 20 * 60);
            if (at > now) return;
            const paidAt = new Date(at.getTime() + payRng.int(1, 9) * DAY_MS);
            docs.push({
                id: sid("invoice", "booking", n),
                contact: b.contact,
                createdAt: at,
                issuedAt: at,
                dueAt: new Date(at.getTime() + 7 * DAY_MS),
                lines: [line],
                source: "BOOKING",
                bookingId: sid("booking", n),
                createdByUserId: team.owner,
                paid: paidAt < now ? payment(payRng, paidAt) : null,
            });
        }
    });

    // --- one-offs billed by hand: brand kits and festive creative packs
    const oneRng = rngFor("oneoffs");
    for (let k = 0; k < 14; k++) {
        const contact = oneRng.int(0, LIVE + CHURNED - 1);
        const at = istAt(
            now,
            -oneRng.int(3, 170),
            oneRng.int(11 * 60, 18 * 60),
        );
        const brandKit = k % 3 === 0;
        const lines = brandKit
            ? [
                  {
                      description: `Brand kit — ${people[contact].company}`,
                      quantity: 1,
                      unitPaise: 35_000_00,
                      sac: "998361",
                  },
                  ...(oneRng.chance(0.5)
                      ? [
                            {
                                description: "Brand-kit print pack",
                                quantity: 1,
                                unitPaise: 3_500_00,
                                sac: "998912",
                            },
                        ]
                      : []),
              ]
            : [
                  {
                      description: `Festive creative pack — ${oneRng.pick(["Navratri", "Diwali", "Raksha Bandhan", "Independence Day", "Ganesh Chaturthi"])} (8 posts, 2 reels)`,
                      quantity: 1,
                      unitPaise: 9_500_00,
                      sac: "998361",
                  },
              ];
        const paidAt = new Date(at.getTime() + oneRng.int(1, 12) * DAY_MS);
        docs.push({
            id: sid("invoice", "oneoff", k),
            contact,
            createdAt: at,
            issuedAt: at,
            dueAt: new Date(at.getTime() + 7 * DAY_MS),
            lines,
            source: "MANUAL",
            createdByUserId: team.owner,
            paid:
                paidAt < now && oneRng.chance(0.9)
                    ? payment(oneRng, paidAt)
                    : null,
        });
        seen(contact, at);
    }
    // A proposal not yet sent: a draft for a lead at "Proposal sent".
    docs.push({
        id: sid("invoice", "proposal", 0),
        contact: LIVE + CHURNED + 15,
        createdAt: istAt(now, -2, 16 * 60),
        issuedAt: null,
        dueAt: null,
        source: "MANUAL",
        createdByUserId: team.owner,
        paid: null,
        lines: [
            {
                description: "Proposal — Growth plan, first month",
                quantity: 1,
                unitPaise: 27_999_00,
                sac: "998361",
            },
            {
                description: "Proposal — Brand kit",
                quantity: 1,
                unitPaise: 35_000_00,
                sac: "998361",
            },
        ],
    });

    // --- printed things, ordered online by clients
    const orders = planOrders(rngFor("orders"), now, LIVE + CHURNED);
    for (const o of orders) seen(o.customer, o.placedAt);

    // --- new business
    const leads = planLeads(rngFor("leads"), now, LIVE + CHURNED, people, team);
    for (const l of leads) seen(l.contact, l.createdAt);

    // --- write it all
    await writeContacts(
        prisma,
        world.orgId,
        (n) => sid("contact", n),
        people.map((p, n) => ({
            ...p,
            createdAt: earliest(firstSeen[n], now),
        })),
    );
    const leadCounts = await writeLeads(
        prisma,
        spec,
        world,
        now,
        leads,
        contacts,
    );
    await prisma.customerSubscription.createMany({
        data: subs.rows.map((s) => ({
            ...s.row,
            organizationId: world.orgId,
            planId: world.planId(s.plan),
            contactId: contacts[s.contact].id,
        })),
    });
    await prisma.booking.createMany({ data: diary.bookings });
    await prisma.bookingEvent.createMany({ data: diary.events });
    const orderCounts = await writeOrders(
        prisma,
        spec,
        world,
        orders,
        contacts,
    );
    const docCounts = await writeDocs(prisma, spec, world, docs, contacts);
    await prisma.contactNote.createMany({
        data: [
            [
                0,
                "Owner approves on WhatsApp after 9 pm only — schedule the month's calendar for him on the 25th.",
            ],
            [
                1,
                "Bridal season Oct–Feb: raise the ad budget to ₹20,000 from October, back to ₹15,000 in March.",
            ],
            [
                2,
                "Doctor wants no before/after photos of patients, ever. Reviews: reply in English only.",
            ],
            [
                3,
                "Diwali is 60% of their year. Gift-box catalogue must be ready by the first week of October.",
            ],
            [
                subs.failedContact,
                "Renewal unpaid — card on file expired. Nikita to send the UPI link and call the accounts person.",
            ],
            [
                subs.pausedContact,
                "Paused for the renovation; restarts after Diwali. Keep the Google profile hours updated meanwhile.",
            ],
        ].map(([n, body], k) => ({
            id: sid("note", k),
            organizationId: world.orgId,
            contactId: sid("contact", n as number),
            body: body as string,
            createdByUserId: k % 2 ? team.owner : team.nikita,
            createdAt: istAt(now, -(3 + k * 5), 15 * 60),
            updatedAt: istAt(now, -(3 + k * 5), 15 * 60),
        })),
    });
    const aggs = await writeInsights(prisma, spec, world, now, {
        paths: [
            { path: "/", weight: 0.3 },
            { path: "/plans", weight: 0.17 },
            { path: "/work", weight: 0.13 },
            { path: "/audit", weight: 0.1 },
            { path: "/blog/google-business-profile-checklist", weight: 0.08 },
            { path: "/blog/30-days-of-reels-kulhad-and-co", weight: 0.07 },
            { path: "/blog/how-we-report-every-month", weight: 0.05 },
            { path: "/contact", weight: 0.05 },
            { path: "/blog/shooting-reels-on-your-phone", weight: 0.03 },
            { path: "/journal", weight: 0.02 },
        ],
        trendBase: 70,
        trendSlope: 0.35,
        weekendFactor: 0.45,
    });
    console.log(
        `[showcase] ${spec.name}: ${people.length} contacts, ${subs.rows.length} retainers ` +
            `(${subs.rows.filter((s) => s.row.status !== "CANCELLED").length} running), ${leadCounts.leads} leads, ` +
            `${diary.bookings.length} bookings, ${orderCounts.orders} orders, ${docCounts.issued} invoices + ${docCounts.drafts} draft, ` +
            `${spec.posts.length} posts, ${aggs} insight rows`,
    );
    return { id: world.orgId, name: spec.name, prefix: sid("") };
}

interface Retainer {
    plan: string;
    contact: number;
    createdAt: Date;
    row: Omit<
        Prisma.CustomerSubscriptionCreateManyInput,
        "planId" | "contactId"
    >;
}

/**
 * Retainers as the renewal job leaves them: anchored at the start of the
 * day they began, invoiced one month ahead each period (the first by
 * whoever signed them up, renewals by the job), most paid within days.
 * The clients now running hold contacts 0…live-1; fifteen of them moved up
 * from a smaller plan (that one ended the day the new one began); the rest
 * of the ended ones are clients who left.
 */
function planRetainers(
    rng: Rng,
    now: Date,
    o: {
        live: number;
        churned: number;
        team: { owner: string; nikita: string };
    },
): {
    rows: Retainer[];
    docs: StudioDoc[];
    failedContact: number;
    pausedContact: number;
} {
    const rows: Retainer[] = [];
    const docs: StudioDoc[] = [];
    const price = (key: string) =>
        must(PC_PLANS.find((p) => p.key === key)).pricePaise;
    const name = (key: string) =>
        must(PC_PLANS.find((p) => p.key === key)).name;
    const order = ["listing", "starter", "growth", "pro"];
    const deck = (mix: Record<string, number>) =>
        Object.entries(mix).flatMap(([k, n]) =>
            Array.from({ length: n }, () => k),
        );
    const live = deck(LIVE_MIX);
    // The named clients first: Kulhad on Growth, Glow Theory on Pro, the
    // dentist on Listing care, the sweet shop on Starter.
    const named = [
        "growth",
        "pro",
        "listing",
        "starter",
        "growth",
        "starter",
        "growth",
        "starter",
    ];
    for (const k of named) live.splice(live.indexOf(k), 1);
    const livePlans = [...named, ...live];
    const ended = deck(ENDED_MIX);

    let s = 0;
    const add = (
        plan: string,
        contact: number,
        startDay: number,
        endAt: Date | null,
        kind: "ACTIVE" | "PAUSED" | "CANCELLED",
    ) => {
        const k = s++;
        const anchor = istAt(now, startDay, 0);
        const at = (n: number) => boundary(anchor, "MONTH", TIMEZONE, n);
        const createdAt = istAt(now, startDay, rng.int(11 * 60, 18 * 60));
        const until = endAt ?? now;
        let n = 0;
        while (at(n + 1) <= until && at(n + 1).getTime() !== endAt?.getTime())
            n += 1;
        const current = { start: at(n), end: at(n + 1) };
        const id = sid("sub", k);
        const signer = rng.chance(0.6) ? o.team.owner : o.team.nikita;
        for (let p = 0; p <= n; p++) {
            const period = { start: at(p), end: at(p + 1) };
            // A renewal goes out minutes after its period starts — or now,
            // when the seed clock sits on the boundary itself.
            const issuedAt =
                p === 0
                    ? createdAt
                    : earliest(addMinutes(period.start, rng.int(2, 50)), now);
            if (issuedAt > now) break;
            const paidAt = new Date(
                issuedAt.getTime() + rng.int(2, 6 * 24) * 3_600_000,
            );
            docs.push({
                id: sid("invoice", "sub", k, p),
                contact,
                createdAt: issuedAt,
                issuedAt,
                dueAt: new Date(issuedAt.getTime() + 7 * DAY_MS),
                lines: [
                    {
                        description: `${name(plan)} · ${periodLabel(period, TIMEZONE)}`,
                        quantity: 1,
                        unitPaise: price(plan),
                        sac: "998361",
                    },
                ],
                source: "SUBSCRIPTION",
                subscriptionId: id,
                period,
                createdByUserId: p === 0 ? signer : null,
                paid:
                    paidAt < now
                        ? payment(
                              rng,
                              paidAt,
                              rng.chance(0.7) ? "UPI" : "BANK_TRANSFER",
                          )
                        : null,
            });
        }
        const pausedAt =
            kind === "PAUSED"
                ? earliest(
                      addMinutes(now, -60),
                      addMinutes(current.start, 3 * 24 * 60),
                  )
                : null;
        rows.push({
            plan,
            contact,
            createdAt,
            row: {
                id,
                organizationId: "",
                status: kind,
                price: `${price(plan) / 100}.00`,
                currency: "INR",
                interval: "MONTH",
                timezone: TIMEZONE,
                anchorAt: anchor,
                currentPeriodStart: current.start,
                currentPeriodEnd: current.end,
                pausedAt,
                cancelAtPeriodEnd: false,
                cancelledAt: kind === "CANCELLED" ? current.end : null,
                createdByUserId: signer,
                createdAt,
                updatedAt: earliest(
                    now,
                    kind === "CANCELLED"
                        ? current.end
                        : (pausedAt ?? addMinutes(current.start, 60)),
                ),
            },
        });
        return { anchor, current };
    };

    // Running clients, and the fifteen who moved up to their current plan.
    let upgrades = 0;
    livePlans.forEach((plan, contact) => {
        const startDay = -rng.int(15, 520);
        const kind = contact === 9 || contact === 21 ? "PAUSED" : "ACTIVE";
        const previous = order[order.indexOf(plan) - 1];
        if (previous && upgrades < 15 && startDay < -60 && rng.chance(0.55)) {
            upgrades += 1;
            const months = rng.int(3, 8);
            const prevStart = istAt(now, startDay, 0);
            const back = boundary(prevStart, "MONTH", TIMEZONE, -months);
            const backDay = Math.round(
                (back.getTime() - istAt(now, 0, 0).getTime()) / DAY_MS,
            );
            add(
                previous,
                contact,
                backDay,
                boundary(istAt(now, backDay, 0), "MONTH", TIMEZONE, months),
                "CANCELLED",
            );
        }
        add(plan, contact, startDay, null, kind);
    });
    // Clients who left: three months at least, gone before now.
    for (let k = 0; k < o.churned && rows.length < o.live + 15 + 50; k++) {
        const plan = ended[k % ended.length];
        const months = rng.int(3, 11);
        const startDay = -rng.int(months * 31 + 10, 540);
        const end = boundary(
            istAt(now, startDay, 0),
            "MONTH",
            TIMEZONE,
            months,
        );
        if (end > now) continue;
        add(plan, o.live + k, startDay, end, "CANCELLED");
    }
    // A few clients who left came back once, briefly, and left again.
    for (
        let k = 0;
        rows.filter((r) => r.row.status === "CANCELLED").length < 50 &&
        k < o.churned;
        k++
    ) {
        const contact = o.live + k;
        const first = rows.find((r) => r.contact === contact);
        if (!first?.row.cancelledAt) continue;
        const after =
            Math.round(
                ((first.row.cancelledAt as Date).getTime() -
                    istAt(now, 0, 0).getTime()) /
                    DAY_MS,
            ) + rng.int(20, 60);
        const end = boundary(istAt(now, after, 0), "MONTH", TIMEZONE, 3);
        if (end > now) continue;
        add("listing", contact, after, end, "CANCELLED");
    }

    // One renewal that failed: the latest invoice of a running retainer,
    // more than a week past due, left unpaid.
    const failed = rows.find((r) => {
        if (r.row.status !== "ACTIVE" || r.contact < 8) return false;
        const start = r.row.currentPeriodStart as Date;
        return (
            start.getTime() < now.getTime() - 9 * DAY_MS &&
            docs.some(
                (d) =>
                    d.subscriptionId === r.row.id &&
                    d.period?.start.getTime() === start.getTime() &&
                    d.createdByUserId === null,
            )
        );
    });
    if (!failed)
        throw new Error(
            "Loop Local Media: no retainer whose renewal could have failed",
        );
    const latest = must(
        docs.find(
            (d) =>
                d.subscriptionId === failed.row.id &&
                d.period?.start.getTime() ===
                    (failed.row.currentPeriodStart as Date).getTime(),
        ),
    );
    latest.paid = null;
    return { rows, docs, failedContact: failed.contact, pausedContact: 9 };
}

function planOrders(rng: Rng, now: Date, clients: number): StudioOrder[] {
    const out: StudioOrder[] = [];
    const items: { line: StudioOrderLine; weight: number }[] = [
        {
            line: { product: "review-standee", variant: 0, quantity: 1 },
            weight: 6,
        },
        {
            line: { product: "review-standee", variant: 1, quantity: 1 },
            weight: 4,
        },
        {
            line: { product: "table-tents", variant: null, quantity: 1 },
            weight: 6,
        },
        {
            line: {
                product: "brand-kit-print-pack",
                variant: null,
                quantity: 1,
            },
            weight: 3,
        },
        {
            line: { product: "brand-kit", variant: null, quantity: 1 },
            weight: 1,
        },
    ];
    const REVIEWS = [
        "Customers actually scan it. We got eleven Google reviews in the first week.",
        "Good thick board, colours match our menu. Delivered next day.",
        "The table tents look like they were made for our café, because they were.",
        "Ordered two more for our second counter.",
        "Simple, sturdy, and the QR goes straight to the review box.",
    ];
    for (let k = 0; k < 64; k++) {
        const daysAgo = Math.floor(rng.next() * 120);
        const placedAt = istAt(now, -daysAgo, rng.int(10 * 60, 21 * 60));
        if (placedAt > now) continue;
        const pick = rng.weighted(items, (i) => i.weight).line;
        const line = {
            ...pick,
            quantity:
                pick.product === "table-tents"
                    ? rng.int(1, 3)
                    : pick.product === "review-standee"
                      ? rng.int(1, 2)
                      : 1,
        };
        const digital = line.product === "brand-kit";
        const age = (now.getTime() - placedAt.getTime()) / DAY_MS;
        const status: StudioOrder["status"] =
            age < 1
                ? "PENDING"
                : age < 3
                  ? "PROCESSING"
                  : age < 5 && !digital
                    ? "SHIPPED"
                    : "DELIVERED";
        const stage: StudioOrder["stage"] = digital
            ? status === "DELIVERED"
                ? "SENT"
                : "PREPARING"
            : status === "PENDING"
              ? "NEW"
              : status === "PROCESSING"
                ? "PREPARING"
                : status === "SHIPPED"
                  ? "HANDED_TO_COURIER"
                  : "DELIVERED";
        const review =
            status === "DELIVERED" && rng.chance(0.15) && REVIEWS.length
                ? {
                      rating: rng.chance(0.75) ? 5 : 4,
                      body: must(REVIEWS.shift()),
                      at: earliest(
                          addMinutes(now, -60),
                          new Date(placedAt.getTime() + 8 * DAY_MS),
                      ),
                  }
                : undefined;
        out.push({
            customer: rng.int(0, clients - 1),
            placedAt,
            lines: [line],
            status,
            stage,
            paymentStatus:
                status === "PENDING" && rng.chance(0.5) ? "UNPAID" : "PAID",
            fulfilment: digital ? "DIGITAL" : "SHIPPING",
            online: true,
            paidAt:
                status === "PENDING"
                    ? null
                    : addMinutes(placedAt, rng.int(1, 20)),
            updatedAt: earliest(
                now,
                new Date(placedAt.getTime() + Math.min(age, 5) * DAY_MS),
            ),
            review,
        });
    }
    for (const o of out)
        if (o.paymentStatus === "PAID" && !o.paidAt)
            o.paidAt = addMinutes(o.placedAt, 5);
    return out;
}

/** New business: enquiries from the site, audit calls, proposals, signings and a few that went elsewhere. */
function planLeads(
    rng: Rng,
    now: Date,
    from: number,
    people: readonly StudioPerson[],
    team: { owner: string; nikita: string },
): StudioLead[] {
    const stages = [
        0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 0, 1,
        2, 3,
    ];
    const NEEDS = [
        "Instagram for our salon — we post when we remember, which is never.",
        "We opened a second café and nobody knows. Need reels and some ads.",
        "Our Google profile shows the old address and the wrong hours. Can you fix it?",
        "Admissions season is coming. Want leads from Facebook and Instagram for demo classes.",
        "Clinic needs reviews and a proper Google profile. No dancing reels please.",
        "Diwali orders — can you help us sell gift boxes on WhatsApp and Instagram?",
    ];
    const NOTES: Record<number, readonly string[]> = {
        1: [
            "Audit call booked for Thursday.",
            "Sent the audit questionnaire on WhatsApp.",
        ],
        2: [
            "Audit done: profile unverified, 3 reviews unanswered, no posts since March.",
            "Audit done: good reels, no consistency; recommended Starter.",
        ],
        3: [
            "Proposal sent: Growth with a quarterly shoot.",
            "Proposal sent: Listing care to start, Starter after Diwali.",
        ],
        4: [
            "Signed — onboarding call booked.",
            "Signed for three months, invoice on the 1st.",
        ],
    };
    const LOST = [
        "Lost — chose a freelancer at ₹6,000 a month.",
        "Lost — owner's nephew will handle Instagram.",
        "Lost — budget frozen till after Diwali; follow up in January.",
    ];
    const out: StudioLead[] = [];
    stages.forEach((stage, k) => {
        const contact = from + k;
        const p = people[contact];
        const lost = k >= stages.length - 4 && k < stages.length - 1;
        const plan = rng.weighted(PC_PLANS, (pl) =>
            pl.key === "listing"
                ? 4
                : pl.key === "starter"
                  ? 4
                  : pl.key === "growth"
                    ? 3
                    : 1,
        );
        const fromForm = rng.chance(0.6);
        const r = rng.next();
        out.push({
            contact,
            title: `${p.company} — ${plan.name}`,
            valuePaise: stage === 0 && fromForm ? null : plan.pricePaise * 3,
            fromForm: fromForm ? { message: rng.pick(NEEDS), extra: {} } : null,
            createdAt: istAt(
                now,
                -rng.int(stage === 0 ? 1 : 4, stage === 0 ? 10 : 50),
                rng.int(10 * 60, 21 * 60),
            ),
            stage,
            status: lost ? "LOST" : stage === 4 ? "WON" : "OPEN",
            notes: [
                ...(NOTES[stage] ?? []).slice(0, rng.int(1, 2)),
                ...(lost ? [LOST[k - (stages.length - 4)]] : []),
            ],
            task:
                lost || stage === 4
                    ? null
                    : {
                          body: rng.pick(
                              stage === 0
                                  ? [
                                        "Reply and offer an audit slot",
                                        "Call — prefers Hindi",
                                    ]
                                  : stage === 1
                                    ? ["Look at their profiles before the call"]
                                    : stage === 2
                                      ? ["Send the proposal"]
                                      : ["Follow up on the proposal"],
                          ),
                          dueDays: r < 0.3 ? -rng.int(1, 5) : rng.int(1, 8),
                          done: false,
                      },
            actor: rng.chance(0.6) ? team.owner : team.nikita,
        });
    });
    return out;
}

/** What Loop Local Media's films and walkthroughs need, checked in the database. */
export async function checkPixelChai(prisma: Db, orgId: string, now: Date) {
    return checkStudio(prisma, orgId, now, {
        name: "Loop Local Media",
        gstPrefix: "LL",
        sac: ["998361", "998385", "998912"],
        minimum: {
            products: 4,
            variantsOnOneProduct: 2,
            services: 5,
            staff: 5,
            leads: 24,
            stages: 5,
            entries: 10,
            ordersLast90: 40,
            payingContacts: 80,
            reviews: 3,
            invoices: 500,
            drafts: 1,
            bookingsUpcoming: 10,
            posts: 24,
            postsPerCategory: 8,
            insightDays: 80,
            subscriptionsLive: 45,
            subscriptionsEnded: 45,
        },
        extra: async (fail) => {
            const failed = await prisma.$queryRaw<{ n: bigint }[]>`
                SELECT COUNT(*) AS n FROM "CustomerSubscription" cs
                JOIN LATERAL (SELECT i.* FROM "Invoice" i WHERE i."subscriptionId" = cs.id AND i.status <> 'VOID'
                              ORDER BY i."periodStart" DESC LIMIT 1) latest ON true
                WHERE cs."organizationId" = ${orgId} AND cs.status = 'ACTIVE' AND latest.status = 'ISSUED'
                  AND latest."dueAt" < ${now.toISOString()}::timestamp AND latest."createdByUserId" IS NULL`;
            if (Number(failed[0]?.n ?? 0) < 1) fail("no failed renewal");
            const paused = await prisma.customerSubscription.count({
                where: { organizationId: orgId, status: "PAUSED" },
            });
            if (paused < 1) fail("no paused retainer");
            const plans = await prisma.subscriptionPlan.count({
                where: { organizationId: orgId, status: "ACTIVE" },
            });
            if (plans < 4) fail(`plans on sale: ${plans}`);
        },
    });
}
