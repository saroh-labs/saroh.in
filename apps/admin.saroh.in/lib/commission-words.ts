/**
 * Commission in the console's words (DEC-169, admin console U21): the
 * shapes `GET /admin/team/payouts`, `GET /admin/staff/:id/earnings` and
 * `GET /admin/commission/rates` answer with, and how each part is said.
 * Client-safe: no `next/headers`. Amounts arrive in paise and rates in
 * basis points from the API; no rate is ever written in the console.
 */

export type LineStatus =
    "PENDING" | "HELD" | "NO_RATE" | "PAYABLE" | "CANCELLED" | "PAID";

export type RateKind = "BROUGHT_IN" | "ASSIGNED";

export const RATE_KINDS: readonly RateKind[] = ["BROUGHT_IN", "ASSIGNED"];

export interface StatementLine {
    id: string;
    organizationId: string;
    businessName: string;
    invoiceNumber: string | null;
    kind: RateKind;
    baseAmountPaise: number;
    basisPoints: number | null;
    /** Priced by the business's own rate (#1035), not the kind's. */
    ownRate: boolean;
    amountPaise: number | null;
    periodEnd: string;
    status: LineStatus;
    statementMonth: string | null;
    installment: number;
    installments: number;
    note: string | null;
}

export interface BroughtInBusiness {
    organizationId: string;
    name: string;
    /** LINK, CODE or LEAD_EMAIL. */
    source: string;
    startedAt: string;
    evidence: Record<string, unknown>;
    ended: boolean;
}

export interface PayoutView {
    id: string;
    amountPaise: number;
    lineCount: number;
    reference: string;
    paidAt: string;
    paidByName: string;
}

export interface PayoutRow {
    platformAdminId: string;
    name: string;
    onCommission: boolean;
    amountPaise: number;
    lineCount: number;
    status: "DUE" | "PAID" | "NONE";
    payout: PayoutView | null;
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
    current: boolean;
    totals: {
        duePaise: number;
        paidPaise: number;
        waitingPaise: number;
        newBusinesses: number;
    };
    people: PayoutRow[];
}

export interface EarningsSummary {
    platformAdminId: string;
    name: string;
    onCommission: boolean;
    totals: {
        pendingPaise: number;
        held: number;
        noRate: number;
        duePaise: number;
        paidPaise: number;
    };
    months: {
        month: string;
        amountPaise: number;
        lines: number;
        paid: boolean;
        reference: string | null;
    }[];
    recent: StatementLine[];
}

export interface RateView {
    id: string;
    kind: RateKind;
    basisPoints: number;
    effectiveFrom: string;
    setByName: string;
    reason: string;
    createdAt: string;
}

/** A business's own rate running now or later (#1035). */
export interface OwnRateRow {
    id: string;
    organizationId: string;
    businessName: string;
    platformAdminId: string;
    managerName: string;
    basisPoints: number;
    earnsFrom: string;
    /** Exclusive end; null while it runs on. */
    until: string | null;
    /** Its first and last days in India; last null while it runs on. */
    earnsFromDay: string;
    lastDay: string | null;
}

export interface RatesView {
    current: Record<RateKind, RateView | null>;
    upcoming: RateView[];
    history: RateView[];
    ownRates: OwnRateRow[];
}

export const KIND_LABEL: Record<RateKind, string> = {
    BROUGHT_IN: "Brought in",
    ASSIGNED: "Assigned",
};

export const KIND_HINT: Record<RateKind, string> = {
    BROUGHT_IN:
        "Businesses that came through the manager's own link, code or lead.",
    ASSIGNED: "Businesses Saroh's team gave the manager to look after.",
};

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
    PENDING: "Not yet payable",
    HELD: "Held",
    NO_RATE: "No rate: earns nothing",
    PAYABLE: "Due",
    CANCELLED: "Cancelled",
    PAID: "Paid",
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Whether `value` is a month as the address carries it ("2026-12"). */
export function readMonth(value: string | undefined | null): string | null {
    const v = value?.trim();
    return v && MONTH.test(v) ? v : null;
}

/** "December 2026". */
export function monthLabel(month: string): string {
    const m = MONTH.exec(month);
    if (!m) return month;
    return new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
}

/** The month `step` months from `month` ("2026-12", 1 → "2027-01"). */
export function stepMonth(month: string, step: number): string {
    const m = MONTH.exec(month);
    if (!m) return month;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + step, 1))
        .toISOString()
        .slice(0, 7);
}

/** A rate as a percentage: "12.5%", "3%", "0.25%". */
export function rateLabel(basisPoints: number | null): string {
    if (basisPoints === null) return "No rate";
    const whole = Math.floor(basisPoints / 100);
    const rest = basisPoints % 100;
    if (rest === 0) return `${whole}%`;
    return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}%`;
}

/** A line's rate, saying when it is the business's own: "4% (own rate for Asha's)". */
export function lineRateWords(
    line: Pick<StatementLine, "basisPoints" | "ownRate" | "businessName">,
): string {
    const rate = rateLabel(line.basisPoints);
    return line.ownRate ? `${rate} (own rate for ${line.businessName})` : rate;
}

/**
 * A percentage typed by the operator, in basis points: up to two decimals,
 * 0 to 100. Null for anything else.
 */
export function percentToBasisPoints(text: string): number | null {
    const typed = text.trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(typed)) return null;
    const [whole, decimals = ""] = typed.split(".");
    const bps = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
    return bps <= 10_000 ? bps : null;
}

/** How a brought-in business was proved, in a few words. */
export function sourceWords(source: string): string {
    switch (source) {
        case "LINK":
            return "Signed up through their link";
        case "CODE":
            return "Owner typed their code";
        case "LEAD_EMAIL":
            return "Owner's email was on their lead";
        case "ASSIGNED":
            return "Given to them by Saroh's team";
        default:
            return "Brought in";
    }
}

/** The proof's details, as short labelled facts. Never an email. */
export function evidenceFacts(
    evidence: Record<string, unknown>,
): { label: string; value: string }[] {
    const facts: { label: string; value: string }[] = [];
    const text = (key: string) => {
        const value = evidence[key];
        return typeof value === "string" ? value : null;
    };
    const code = text("code");
    if (code) facts.push({ label: "Code", value: code });
    const cookie = text("cookieSetAt");
    if (cookie) facts.push({ label: "Link opened", value: cookie });
    const lead = text("leadId");
    if (lead) facts.push({ label: "Lead", value: lead });
    const recorded = text("emailRecordedAt");
    if (recorded) facts.push({ label: "Email recorded", value: recorded });
    return facts;
}

/** A line's part of a year paid at once: "3 of 12"; nothing for a month. */
export function partLabel(line: {
    installment: number;
    installments: number;
}): string | null {
    return line.installments > 1
        ? `${line.installment} of ${line.installments}`
        : null;
}

/** Why the Mark paid button is off for this row, or null when it is on. */
export function markPaidProblem(
    row: Pick<PayoutRow, "platformAdminId" | "status">,
    viewer: { platformAdminId: string | null; canPay: boolean },
): string | null {
    if (!viewer.canPay)
        return "Only a Platform owner or Billing marks payouts.";
    if (row.status !== "DUE") return null;
    if (
        viewer.platformAdminId &&
        viewer.platformAdminId === row.platformAdminId
    ) {
        return "Someone else on the team marks your own commission paid.";
    }
    return null;
}

/** What is waiting for a person, in one line; null when nothing is. */
export function waitingWords(waiting: PayoutRow["waiting"]): string | null {
    const parts: string[] = [];
    if (waiting.lines > 0) {
        const count = `${waiting.lines} ${waiting.lines === 1 ? "payment" : "payments"}`;
        parts.push(
            waiting.held > 0 ? `${count} (${waiting.held} held)` : count,
        );
    }
    // No back-pay (owner, 19 Oct): these never become due.
    if (waiting.noRate > 0) {
        parts.push(
            `${waiting.noRate} earned nothing: no rate was set when ${waiting.noRate === 1 ? "it" : "they"} paid`,
        );
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
