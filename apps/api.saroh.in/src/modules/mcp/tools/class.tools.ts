import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { RangePeriod } from "@saroh/api-contract";
import {
    getClassFillTool,
    listClassPacksTool,
    listWaitlistTool,
} from "@saroh/api-contract";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { enumerateSlots } from "../../bookings/availability";
import type { OwnDiary } from "../../bookings/own-diary";
import { ownBookingsWhere, ownDiaryOf } from "../../bookings/own-diary";
import { businessTimezone } from "../../bookings/staff-availability";
import { LIST_LIMIT, standingOf } from "../../class-packs/pack-reads";
import type { McpCall, McpTool } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { quoteUntrusted, untrusted } from "../untrusted";
import type { Span } from "./period";
import { resolveSpan } from "./period";
import { PAGE, when } from "./v1-bridge";

/**
 * The class reads (14 Nov): how full classes are, who waits for a full
 * session, and the class packs people hold. Saroh counts; the model only
 * phrases. People's names are untrusted text.
 */

/** Sessions a class names in its output. */
const SESSIONS_NAMED = 40;

const pct = (booked: number, places: number) =>
    places > 0 ? Math.round((booked / places) * 100) : null;

const nameOf = (c: { firstName: string | null; lastName: string | null }) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || null;

/** A narrowed caller's classes: the ones they take, or none off the diary. */
const ownServices = (own: OwnDiary | null): Prisma.ServiceWhereInput =>
    own ? { id: { in: own.staffId ? [...own.serviceIds] : [] } } : {};

async function spanOf(
    ctx: OrganizationContext,
    input: { period?: RangePeriod; from?: string; to?: string },
) {
    return resolveSpan(
        input,
        new Date(),
        await businessTimezone(prisma, ctx.organizationId),
    );
}

// ------------------------------------------------------------ class fill

/**
 * Places booked against places offered, per class and per session. A
 * session is every start the class's weekly hours offer in the period
 * (later days included), plus any start someone is booked on outside them;
 * booked is standing (CONFIRMED) bookings, as the summaries count them.
 */
export async function classFill(
    ctx: OrganizationContext,
    s: Span,
    serviceId: string | undefined,
) {
    const org = ctx.organizationId;
    const own = await ownDiaryOf(prisma, ctx);
    const one = serviceId ? { id: serviceId } : {};
    const booked = await prisma.booking.groupBy({
        by: ["serviceId", "startAt"],
        where: {
            organizationId: org,
            status: "CONFIRMED",
            startAt: { gte: s.from, lt: s.to },
            service: { capacity: { gt: 1 }, ...one },
            ...ownBookingsWhere(own),
        },
        _count: { _all: true },
    });
    const services = await prisma.service.findMany({
        where: {
            organizationId: org,
            capacity: { gt: 1 },
            deletedAt: null,
            AND: [
                one,
                {
                    OR: [
                        { status: "ACTIVE", ...ownServices(own) },
                        { id: { in: booked.map((b) => b.serviceId) } },
                    ],
                },
            ],
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            status: true,
            capacity: true,
            durationMinutes: true,
            bufferBeforeMinutes: true,
            bufferAfterMinutes: true,
            timezone: true,
            availabilityRules: {
                select: { dayOfWeek: true, startMinute: true, endMinute: true },
            },
        },
    });
    if (serviceId && services.length === 0) {
        throw new ToolError(
            "No class with that service_id here.",
            "Take a class's service_id from list_services, or leave it out for every class.",
        );
    }
    // shortcut: days the business marked closed still count as offered; read closed-days.ts if a class is skipped often.
    const classes = services.map((svc) => {
        const at = new Map<number, number>();
        if (svc.status === "ACTIVE") {
            for (const slot of enumerateSlots(
                svc,
                svc.availabilityRules,
                s.from,
                s.to,
            )) {
                at.set(slot.startAt.getTime(), 0);
            }
        }
        for (const b of booked) {
            if (b.serviceId !== svc.id) continue;
            const t = b.startAt.getTime();
            at.set(t, (at.get(t) ?? 0) + b._count._all);
        }
        const sessions = [...at.entries()].sort(([a], [b]) => a - b);
        const n = sessions.reduce((t, [, k]) => t + k, 0);
        const places = sessions.length * svc.capacity;
        return {
            service_id: svc.id,
            name: svc.name,
            capacity: svc.capacity,
            sessions: sessions.length,
            places,
            booked: n,
            full_percent: pct(n, places),
            session_list: sessions.slice(0, SESSIONS_NAMED).map(([t, k]) => ({
                starts_at: new Date(t).toISOString(),
                when: when(new Date(t), s.zone),
                booked: k,
                full_percent: pct(k, svc.capacity) ?? 0,
            })),
        };
    });
    const total = classes.reduce((t, c) => t + c.booked, 0);
    const places = classes.reduce((t, c) => t + c.places, 0);
    const data = {
        span: {
            period: s.period,
            timezone: s.zone,
            from: s.firstDay,
            to: s.lastDay,
        },
        booked: total,
        places,
        full_percent: pct(total, places),
        classes,
    };
    const text = [
        `Class places, ${s.words} (${s.firstDay} to ${s.lastDay}, ${s.zone}), days still to come included. Booked = standing bookings; places = sessions × places per session.`,
        classes.length === 0
            ? "No classes (services taking more than one person) in this period."
            : `- All classes: ${total} of ${places} places booked${data.full_percent !== null ? ` (${data.full_percent}% full)` : ""}.`,
        ...classes.flatMap((c) => [
            `- ${JSON.stringify(c.name)} (service_id ${c.service_id}): ${c.booked} of ${c.places} places booked${c.full_percent !== null ? ` (${c.full_percent}% full)` : ""}, ${c.sessions} sessions of ${c.capacity}.`,
            // Each session only over a fortnight or less: a year would be hundreds.
            ...(s.days <= 14 && c.session_list.length
                ? [
                      `  Sessions: ${c.session_list.map((x) => `${x.when} ${x.booked}/${c.capacity}`).join("; ")}.`,
                  ]
                : []),
        ]),
        ...(classes.length
            ? [
                  "The card under the answer holds only each class's totals; every other figure is in this text alone.",
              ]
            : []),
    ].join("\n");
    return { text, data };
}

// -------------------------------------------------------------- waitlist

/** The live waitlist (waiting, or offered a place), per session. */
export async function waitlist(
    ctx: OrganizationContext,
    input: { service_id?: string; date?: string },
) {
    const org = ctx.organizationId;
    const zone = await businessTimezone(prisma, org);
    const own = await ownDiaryOf(prisma, ctx);
    let startAt: Prisma.DateTimeFilter = { gte: new Date() };
    if (input.date) {
        const day = DateTime.fromISO(input.date, { zone }).startOf("day");
        if (!day.isValid) {
            throw new ToolError(
                "date: not a day.",
                "Send a day as YYYY-MM-DD, like 2026-11-21.",
            );
        }
        startAt = {
            gte: day.toJSDate(),
            lt: day.plus({ days: 1 }).toJSDate(),
        };
    }
    // shortcut: the first 200 places in line; page it if a business ever waitlists more.
    const rows = await prisma.classWaitlistEntry.findMany({
        where: {
            organizationId: org,
            status: { in: ["WAITING", "OFFERED"] },
            startAt,
            AND: [
                input.service_id ? { serviceId: input.service_id } : {},
                { service: ownServices(own) },
            ],
        },
        orderBy: [
            { startAt: "asc" },
            { serviceId: "asc" },
            { position: "asc" },
        ],
        take: 200,
        select: {
            serviceId: true,
            startAt: true,
            position: true,
            status: true,
            offeredUntil: true,
            contactId: true,
            service: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
        },
    });
    const sessions: {
        service_id: string;
        service: string;
        starts_at: string;
        when: string;
        waiting: {
            position: number;
            customer_id: string;
            name: ReturnType<typeof untrusted> | null;
            status: "waiting" | "offered";
            offered_until: string | null;
        }[];
    }[] = [];
    for (const r of rows) {
        const starts = r.startAt.toISOString();
        let session = sessions[sessions.length - 1] as
            (typeof sessions)[number] | undefined;
        if (
            session?.service_id !== r.serviceId ||
            session.starts_at !== starts
        ) {
            session = {
                service_id: r.serviceId,
                service: r.service.name,
                starts_at: starts,
                when: when(r.startAt, zone),
                waiting: [],
            };
            sessions.push(session);
        }
        const name = nameOf(r.contact);
        session.waiting.push({
            position: session.waiting.length + 1,
            customer_id: r.contactId,
            name: name ? untrusted(name) : null,
            status: r.status === "OFFERED" ? "offered" : "waiting",
            offered_until:
                r.status === "OFFERED" && r.offeredUntil
                    ? when(r.offeredUntil, zone)
                    : null,
        });
    }
    const people = rows.length;
    const text = [
        people === 0
            ? `Nobody is waiting for a place${input.date ? ` on ${input.date}` : " in any coming class"}.`
            : `${people} waiting for a place, in ${sessions.length} session${sessions.length === 1 ? "" : "s"}, first in line first (${zone}).`,
        ...sessions.flatMap((x) => [
            `- ${JSON.stringify(x.service)} (service_id ${x.service_id}), ${x.when}:`,
            ...x.waiting.map(
                (w) =>
                    `  ${w.position}. ${w.name ? quoteUntrusted("Customer", w.name.text) : "someone"} (customer_id ${w.customer_id})${w.status === "offered" ? `, offered a place${w.offered_until ? ` until ${w.offered_until}` : ""}` : ""}`,
            ),
        ]),
    ].join("\n");
    return { text, data: { sessions, people } };
}

// ------------------------------------------------------------ class packs

const packWord = (n: number) => `${n} class pack${n === 1 ? "" : "s"}`;

const STANDING = {
    ACTIVE: "active",
    USED_UP: "used_up",
    EXPIRED: "expired",
} as const;

const STANDING_WORDS = {
    active: "active",
    used_up: "used up",
    expired: "expired",
} as const;

/**
 * Class packs sold: with a period, those whose use-by date falls in it,
 * whatever their standing; without, the ones held now (classes and time
 * left). Each with classes used and left (redemptions not given back).
 */
export async function classPacks(
    ctx: OrganizationContext,
    input: {
        period?: RangePeriod;
        from?: string;
        to?: string;
        customer_id?: string;
        limit?: number;
    },
) {
    const org = ctx.organizationId;
    const now = new Date();
    const byDate = [input.period, input.from, input.to].some(Boolean);
    const s = byDate ? await spanOf(ctx, input) : null;
    const zone = s?.zone ?? (await businessTimezone(prisma, org));
    // shortcut: the 500 that run out first (pack-reads' LIST_LIMIT); a business with more gets totals of those.
    const rows = await prisma.packPurchase.findMany({
        where: {
            organizationId: org,
            ...(input.customer_id ? { contactId: input.customer_id } : {}),
            expiresAt: s ? { gte: s.from, lt: s.to } : { gt: now },
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
        select: {
            id: true,
            credits: true,
            expiresAt: true,
            contactId: true,
            pack: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    const all = rows
        .map((r) => {
            const used = r._count.redemptions;
            const left = Math.max(0, r.credits - used);
            const name = nameOf(r.contact);
            return {
                purchase_id: r.id,
                pack: r.pack.name,
                customer_id: r.contactId,
                customer: name ? untrusted(name) : null,
                classes: r.credits,
                used,
                left,
                use_by:
                    DateTime.fromJSDate(r.expiresAt, { zone }).toISODate() ??
                    "",
                standing:
                    STANDING[standingOf({ expiresAt: r.expiresAt, left }, now)],
            };
        })
        // Held now: classes and time left.
        .filter((p) => s !== null || p.standing === "active");
    const count = (k: keyof typeof STANDING_WORDS) =>
        all.filter((p) => p.standing === k).length;
    const packs = all.slice(0, input.limit ?? PAGE);
    const data = {
        span: s ? { period: s.period, from: s.firstDay, to: s.lastDay } : null,
        total: all.length,
        active: count("active"),
        used_up: count("used_up"),
        expired: count("expired"),
        packs,
    };
    const head = s
        ? `${packWord(data.total)} with a use-by date ${s.words} (${s.firstDay} to ${s.lastDay}, ${s.zone}): ${data.active} active, ${data.used_up} used up, ${data.expired} already expired.`
        : `${packWord(data.total)} held now (classes and time left).`;
    const text = [
        head,
        ...packs.map(
            (p) =>
                `- ${p.customer ? quoteUntrusted("Customer", p.customer.text) : "someone"} (customer_id ${p.customer_id}): ${JSON.stringify(p.pack)}, ${p.used} of ${p.classes} used, ${p.left} left, use by ${p.use_by}, ${STANDING_WORDS[p.standing]}`,
        ),
        ...(data.total > packs.length
            ? [`${packs.length} of ${data.total} named; the card links to all.`]
            : []),
    ].join("\n");
    return { text, data };
}

// ----------------------------------------------------------------- tools

const PERIOD_HINT =
    'period this_week, this_month…, or from and to; "this week" → this_week.';

export function classTools(): McpTool[] {
    return [
        defineTool({
            name: "get_class_fill",
            title: "How full classes are",
            description: `Use this when the person asks how full their classes are over a period: places booked out of places offered, per class and per session, days still to come included. Example: "how full are the 7 AM classes this week?" → ${PERIOD_HINT} Not for who is booked (list_bookings) or who waits (list_waitlist).`,
            contract: getClassFillTool,
            capability: "booking:read",
            module: "APPOINTMENTS",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) =>
                classFill(ctx, await spanOf(ctx, input), input.service_id),
        }),
        defineTool({
            name: "list_waitlist",
            title: "Class waitlist",
            description:
                "Use this when the person asks who is waiting for a place in a full class: per session, in line order, and who has been offered a place. Example: \"who's on the waitlist for Saturday's 7 AM?\" → date 2026-11-21. Not for who is booked (list_bookings).",
            contract: listWaitlistTool,
            capability: "booking:read",
            module: "APPOINTMENTS",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) => waitlist(ctx, input),
        }),
        defineTool({
            name: "list_class_packs",
            title: "Class packs held",
            description: `Use this when the person asks about class packs people hold: who has one, classes used and left, and which run out (use-by date) in a period. Example: "how many packs expire this month?" → period this_month; "who has packs?" → no period. Not for making or selling a pack (done in Class packs).`,
            contract: listClassPacksTool,
            capability: "pack:read",
            module: "CLASS_PACKS",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) => classPacks(ctx, input),
        }),
    ];
}

/** Registers the class reads at boot. */
@Injectable()
export class ClassTools implements OnModuleInit {
    constructor(private readonly registry: McpToolRegistry) {}

    onModuleInit(): void {
        this.registry.register(...classTools());
    }
}
