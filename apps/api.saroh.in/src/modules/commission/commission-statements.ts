import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { teammateName } from "../saroh-leads/lead-views";
import type { LineStatus, RateKind } from "./commission-rules";
import { monthBounds, monthOf, RATE_KINDS } from "./commission-rules";

/**
 * What the console reads about commission (DEC-169, admin console U21):
 * a month's statement for the whole team, one teammate's earnings, the
 * month's export and the rates. Cross-tenant reads for staff with
 * `team:pay` (rates: `commission:rates`), made with no organization
 * context; `admin-commission.service.ts` checks who may and records the
 * read. Amounts are paise; a rate is basis points as stored.
 */

/** One line, as a statement lists it. */
export interface StatementLine {
    id: string;
    organizationId: string;
    businessName: string;
    invoiceNumber: string | null;
    kind: RateKind;
    baseAmountPaise: number;
    basisPoints: number | null;
    amountPaise: number | null;
    periodEnd: Date;
    status: LineStatus;
    statementMonth: string | null;
    installment: number;
    installments: number;
    note: string | null;
}

/** A business the teammate brought in during the month, and its proof. */
export interface BroughtInBusiness {
    organizationId: string;
    name: string;
    /** LINK, CODE or LEAD_EMAIL. */
    source: string;
    startedAt: Date;
    /** As kept on the link: the code, the cookie's time, the lead. Never an email. */
    evidence: Record<string, unknown>;
    /** The link has ended since. */
    ended: boolean;
}

export interface PayoutView {
    id: string;
    amountPaise: number;
    lineCount: number;
    reference: string;
    paidAt: Date;
    paidByName: string;
}

/** One teammate's row in a month's statement. */
export interface PayoutRow {
    platformAdminId: string;
    name: string;
    onCommission: boolean;
    /** What the month owes or paid them: PAYABLE and PAID lines in it. */
    amountPaise: number;
    lineCount: number;
    /** DUE: payable lines, not marked paid. PAID: marked. NONE: nothing. */
    status: "DUE" | "PAID" | "NONE";
    payout: PayoutView | null;
    /**
     * Earned but not yet payable, whatever the month: PENDING and HELD
     * (`lines`, `held`). `noRate` counts apart the payments that earned
     * nothing because no rate was set when they paid (no back-pay).
     */
    waiting: {
        amountPaise: number;
        lines: number;
        held: number;
        noRate: number;
    };
    newBusinesses: BroughtInBusiness[];
    lines: StatementLine[];
}

export interface PayoutStatement {
    month: string;
    /** It is this month in India. */
    current: boolean;
    totals: {
        duePaise: number;
        paidPaise: number;
        waitingPaise: number;
        newBusinesses: number;
    };
    people: PayoutRow[];
}

/** Lines a statement row lists at most. */
const LINES_PER_ROW = 300;

type LineRow = Prisma.CommissionLineGetPayload<object>;

async function namesOf(platformAdminIds: string[]) {
    const admins = await prisma.platformAdmin.findMany({
        where: { id: { in: platformAdminIds } },
        select: {
            id: true,
            user: { select: { name: true } },
            staffProfile: { select: { onCommission: true } },
        },
    });
    return new Map(
        admins.map((a) => [
            a.id,
            {
                name: teammateName(a.user.name),
                onCommission: a.staffProfile?.onCommission ?? false,
            },
        ]),
    );
}

async function userNames(userIds: string[]) {
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
    });
    return new Map(
        users.map((u) => [u.id, teammateName(u.name, "Saroh's team")]),
    );
}

/** Lines in words: each with its business's name and invoice number. */
export async function viewLines(rows: LineRow[]): Promise<StatementLine[]> {
    const [orgs, invoices] = await Promise.all([
        prisma.organization.findMany({
            where: {
                id: { in: [...new Set(rows.map((r) => r.organizationId))] },
            },
            select: { id: true, name: true },
        }),
        prisma.sarohInvoice.findMany({
            where: {
                id: { in: [...new Set(rows.map((r) => r.sarohInvoiceId))] },
            },
            select: { id: true, number: true },
        }),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const number = new Map(invoices.map((i) => [i.id, i.number]));
    return rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        businessName: orgName.get(r.organizationId) ?? "A deleted business",
        invoiceNumber: number.get(r.sarohInvoiceId) ?? null,
        kind: r.kind as RateKind,
        baseAmountPaise: r.baseAmountPaise,
        basisPoints: r.basisPoints,
        amountPaise: r.amountPaise,
        periodEnd: r.periodEnd,
        status: r.status as LineStatus,
        statementMonth: r.statementMonth,
        installment: r.installment,
        installments: r.installments,
        note: r.note,
    }));
}

const sum = (rows: { amountPaise: number | null }[]) =>
    rows.reduce((total, r) => total + (r.amountPaise ?? 0), 0);

/**
 * A month's statement: everyone on commission, everyone with a line in the
 * month or waiting, everyone paid for it, and everyone who brought a
 * business in during it (shown for review, R36; the owner approves none).
 */
export async function readStatement(
    month: string,
    now: Date,
): Promise<PayoutStatement> {
    const { from, to } = monthBounds(month);
    const [inMonth, waiting, payouts, brought, onCommission] =
        await Promise.all([
            prisma.commissionLine.findMany({
                where: {
                    statementMonth: month,
                    status: { in: ["PAYABLE", "PAID"] },
                },
                orderBy: [{ periodEnd: "asc" }, { id: "asc" }],
            }),
            prisma.commissionLine.findMany({
                where: { status: { in: ["PENDING", "HELD", "NO_RATE"] } },
                select: {
                    platformAdminId: true,
                    status: true,
                    amountPaise: true,
                },
            }),
            prisma.commissionPayout.findMany({ where: { month } }),
            prisma.accountManagerLink.findMany({
                where: { kind: "BROUGHT_IN", startedAt: { gte: from, lt: to } },
                orderBy: { startedAt: "asc" },
                select: {
                    organizationId: true,
                    platformAdminId: true,
                    source: true,
                    startedAt: true,
                    evidence: true,
                    endedAt: true,
                },
            }),
            prisma.staffProfile.findMany({
                where: { onCommission: true },
                select: { platformAdminId: true },
            }),
        ]);

    const ids = new Set<string>([
        ...inMonth.map((l) => l.platformAdminId),
        ...waiting.map((l) => l.platformAdminId),
        ...payouts.map((p) => p.platformAdminId),
        ...brought.map((b) => b.platformAdminId),
        ...onCommission.map((p) => p.platformAdminId),
    ]);
    const [people, payers, orgs, lines] = await Promise.all([
        namesOf([...ids]),
        userNames(payouts.map((p) => p.paidByUserId)),
        prisma.organization.findMany({
            where: { id: { in: brought.map((b) => b.organizationId) } },
            select: { id: true, name: true },
        }),
        viewLines(inMonth),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const ownerOf = new Map(inMonth.map((l) => [l.id, l.platformAdminId]));

    const rows: PayoutRow[] = [...ids].map((platformAdminId) => {
        const mine = lines.filter((l) => ownerOf.get(l.id) === platformAdminId);
        const waits = waiting.filter(
            (w) => w.platformAdminId === platformAdminId,
        );
        const payout = payouts.find(
            (p) => p.platformAdminId === platformAdminId,
        );
        const person = people.get(platformAdminId);
        const due = mine.filter((l) => l.status === "PAYABLE");
        return {
            platformAdminId,
            name: person?.name ?? "A former teammate",
            onCommission: person?.onCommission ?? false,
            amountPaise: sum(mine),
            lineCount: mine.length,
            status: due.length > 0 ? "DUE" : payout ? "PAID" : "NONE",
            payout: payout
                ? {
                      id: payout.id,
                      amountPaise: payout.amountPaise,
                      lineCount: payout.lineCount,
                      reference: payout.reference,
                      paidAt: payout.paidAt,
                      paidByName:
                          payers.get(payout.paidByUserId) ?? "Saroh's team",
                  }
                : null,
            waiting: {
                amountPaise: sum(waits),
                lines: waits.filter((w) => w.status !== "NO_RATE").length,
                held: waits.filter((w) => w.status === "HELD").length,
                noRate: waits.filter((w) => w.status === "NO_RATE").length,
            },
            newBusinesses: brought
                .filter((b) => b.platformAdminId === platformAdminId)
                .map((b) => ({
                    organizationId: b.organizationId,
                    name: orgName.get(b.organizationId) ?? "A deleted business",
                    source: b.source,
                    startedAt: b.startedAt,
                    evidence: safeEvidence(b.evidence),
                    ended: b.endedAt !== null,
                })),
            lines: mine.slice(0, LINES_PER_ROW),
        };
    });
    rows.sort(
        (a, b) =>
            rank(a.status) - rank(b.status) ||
            b.amountPaise - a.amountPaise ||
            a.name.localeCompare(b.name),
    );
    return {
        month,
        current: month === monthOf(now),
        totals: {
            duePaise: sum(inMonth.filter((l) => l.status === "PAYABLE")),
            paidPaise: sum(inMonth.filter((l) => l.status === "PAID")),
            waitingPaise: sum(waiting),
            newBusinesses: brought.length,
        },
        people: rows,
    };
}

const rank = (s: PayoutRow["status"]) =>
    s === "DUE" ? 0 : s === "PAID" ? 1 : 2;

/** The proof as kept, keeping only what a link's evidence carries. */
function safeEvidence(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const allowed = [
        "source",
        "code",
        "cookieSetAt",
        "leadId",
        "leadField",
        "emailRecordedAt",
        "via",
    ];
    const out: Record<string, unknown> = {};
    for (const key of allowed) {
        const value = (raw as Record<string, unknown>)[key];
        if (value !== undefined) out[key] = value;
    }
    return out;
}

/** One teammate's earnings, for their page's Earnings tab (U22). */
export interface EarningsSummary {
    platformAdminId: string;
    name: string;
    onCommission: boolean;
    totals: {
        /** Earned, its period not over yet. */
        pendingPaise: number;
        held: number;
        noRate: number;
        /** Payable, not yet marked paid. */
        duePaise: number;
        paidPaise: number;
    };
    /** The last twelve statements they have a line in, newest first. */
    months: {
        month: string;
        amountPaise: number;
        lines: number;
        paid: boolean;
        reference: string | null;
    }[];
    /** Their latest lines, newest first. */
    recent: StatementLine[];
}

export async function readEarnings(
    platformAdminId: string,
): Promise<EarningsSummary | null> {
    const [people, all, payouts] = await Promise.all([
        namesOf([platformAdminId]),
        prisma.commissionLine.findMany({
            where: { platformAdminId },
            select: { status: true, amountPaise: true, statementMonth: true },
        }),
        prisma.commissionPayout.findMany({ where: { platformAdminId } }),
    ]);
    const person = people.get(platformAdminId);
    if (!person) return null;
    const recent = await prisma.commissionLine.findMany({
        where: { platformAdminId },
        orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
        take: 20,
    });
    const by = (s: LineStatus) => all.filter((l) => l.status === s);
    const months = new Map<string, { amountPaise: number; lines: number }>();
    for (const l of all) {
        if (
            !l.statementMonth ||
            (l.status !== "PAYABLE" && l.status !== "PAID")
        ) {
            continue;
        }
        const m = months.get(l.statementMonth) ?? { amountPaise: 0, lines: 0 };
        m.amountPaise += l.amountPaise ?? 0;
        m.lines += 1;
        months.set(l.statementMonth, m);
    }
    return {
        platformAdminId,
        name: person.name,
        onCommission: person.onCommission,
        totals: {
            pendingPaise: sum(by("PENDING")),
            held: by("HELD").length,
            noRate: by("NO_RATE").length,
            duePaise: sum(by("PAYABLE")),
            paidPaise: sum(by("PAID")),
        },
        months: [...months.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 12)
            .map(([month, m]) => {
                const payout = payouts.find((p) => p.month === month);
                return {
                    month,
                    ...m,
                    paid: Boolean(payout),
                    reference: payout?.reference ?? null,
                };
            }),
        recent: await viewLines(recent),
    };
}

/** A rate as the console shows it. */
export interface RateView {
    id: string;
    kind: RateKind;
    basisPoints: number;
    effectiveFrom: Date;
    setByName: string;
    reason: string;
    createdAt: Date;
}

export interface RatesView {
    /** The rate in force now for each kind; null where none is set. */
    current: Record<RateKind, RateView | null>;
    /** Rates set to start later. */
    upcoming: RateView[];
    /** Every rate ever set, newest first. */
    history: RateView[];
}

export async function readRates(now: Date): Promise<RatesView> {
    const rows = await prisma.commissionRate.findMany({
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
        take: 200,
    });
    const names = await userNames([...new Set(rows.map((r) => r.setByUserId))]);
    const views: RateView[] = rows.map((r) => ({
        id: r.id,
        kind: r.kind as RateKind,
        basisPoints: r.basisPoints,
        effectiveFrom: r.effectiveFrom,
        setByName: names.get(r.setByUserId) ?? "Saroh's team",
        reason: r.reason,
        createdAt: r.createdAt,
    }));
    const current = Object.fromEntries(
        RATE_KINDS.map((kind) => [
            kind,
            views.find((v) => v.kind === kind && v.effectiveFrom <= now) ??
                null,
        ]),
    ) as Record<RateKind, RateView | null>;
    return {
        current,
        upcoming: views.filter((v) => v.effectiveFrom > now).reverse(),
        history: views,
    };
}

/** A CSV field, quoted when it must be, and never read as a formula. */
function csvField(value: string | number | null): string {
    if (value === null) return "";
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rupees = (paise: number | null) =>
    paise === null ? null : (paise / 100).toFixed(2);

/** The month's statement as a CSV: one row per line, with who and how paid. */
export function statementCsv(statement: PayoutStatement): string {
    const head = [
        "Month",
        "Teammate",
        "Business",
        "Invoice",
        "Kind",
        "Part",
        "Period ends",
        "Before GST (₹)",
        "Rate (%)",
        "Commission (₹)",
        "Status",
        "Paid on",
        "Reference",
    ];
    const out = [head.map(csvField).join(",")];
    for (const person of statement.people) {
        for (const line of person.lines) {
            out.push(
                [
                    statement.month,
                    person.name,
                    line.businessName,
                    line.invoiceNumber,
                    line.kind === "BROUGHT_IN" ? "Brought in" : "Assigned",
                    `${line.installment} of ${line.installments}`,
                    line.periodEnd.toISOString().slice(0, 10),
                    rupees(line.baseAmountPaise),
                    line.basisPoints === null
                        ? null
                        : (line.basisPoints / 100).toFixed(2),
                    rupees(line.amountPaise),
                    line.status === "PAID" ? "Paid" : "Due",
                    person.payout && line.status === "PAID"
                        ? person.payout.paidAt.toISOString().slice(0, 10)
                        : null,
                    line.status === "PAID"
                        ? (person.payout?.reference ?? null)
                        : null,
                ]
                    .map(csvField)
                    .join(","),
            );
        }
    }
    return `${out.join("\r\n")}\r\n`;
}
