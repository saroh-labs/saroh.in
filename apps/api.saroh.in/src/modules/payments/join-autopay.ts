import type { Prisma } from "@saroh/database";

import type {
    ReportedMandateChange,
    ReportedMandateStatus,
} from "./mandate-rules";
import type {
    MandateFrequency,
    MandateMethod,
} from "./providers/provider.port";
import {
    isMandateMethod,
    MANDATE_FREQUENCIES,
} from "./providers/provider.port";

/**
 * Autopay chosen while joining a plan online (round-2 D12 on G20's
 * pay-first join, DEC-062). Nobody is on the plan until the first period is
 * paid, so there is no subscription for a mandate row to belong to yet
 * (`PaymentMandate.subscriptionId` is required, DEC-038). The authorisation
 * started for the join is kept on the draft invoice's `planTerms.autopay`
 * instead, and the row is made, under the id the provider already knows,
 * when the payment starts the subscription (`plan-join-autopay.ts`).
 *
 * A provider report that arrives first (a `token.confirmed` before the
 * payment's capture) is held here as `reported` and applied once the row
 * exists, so neither order loses it. Pure shapes; no database.
 */

/** A report held on the draft: the change, with its dates as text. */
export interface HeldReport {
    status: ReportedMandateStatus;
    providerMandateId?: string;
    providerCustomerId?: string;
    method?: string;
    displayHint?: string;
    maxAmountCents?: number;
    expiresAt?: string;
    failureReason?: string;
}

/** What `planTerms.autopay` holds. */
export interface JoinAutopay {
    mandateId: string;
    provider: string;
    method: MandateMethod;
    maxAmountCents: number;
    currency: string;
    frequency: MandateFrequency;
    providerCustomerId: string;
    /** For UPI and card, also the provider order the first period is paid on. */
    setupReference: string;
    expiresAt: string;
    setupExpiresAt: string;
    reported?: HeldReport;
}

const isText = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0;

const REPORTED: readonly string[] = ["ACTIVE", "PAUSED", "CANCELLED", "FAILED"];

function readReport(v: unknown): HeldReport | undefined {
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const r = v as Record<string, unknown>;
    if (typeof r.status !== "string" || !REPORTED.includes(r.status)) {
        return undefined;
    }
    const out: HeldReport = { status: r.status as ReportedMandateStatus };
    if (isText(r.providerMandateId))
        out.providerMandateId = r.providerMandateId;
    if (isText(r.providerCustomerId)) {
        out.providerCustomerId = r.providerCustomerId;
    }
    if (isText(r.method)) out.method = r.method;
    if (isText(r.displayHint)) out.displayHint = r.displayHint;
    if (typeof r.maxAmountCents === "number") {
        out.maxAmountCents = r.maxAmountCents;
    }
    if (isText(r.expiresAt)) out.expiresAt = r.expiresAt;
    if (isText(r.failureReason)) out.failureReason = r.failureReason;
    return out;
}

/** The draft's autopay, checked; null when it has none or it is malformed. */
export function readJoinAutopay(
    planTerms: Prisma.JsonValue | null | undefined,
): JoinAutopay | null {
    if (
        !planTerms ||
        typeof planTerms !== "object" ||
        Array.isArray(planTerms)
    ) {
        return null;
    }
    const v = (planTerms as Record<string, unknown>).autopay;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const a = v as Record<string, unknown>;
    const frequency = MANDATE_FREQUENCIES.find((f) => f === a.frequency);
    if (
        !isText(a.mandateId) ||
        !isText(a.provider) ||
        !isMandateMethod(a.method) ||
        typeof a.maxAmountCents !== "number" ||
        !Number.isInteger(a.maxAmountCents) ||
        a.maxAmountCents <= 0 ||
        !isText(a.currency) ||
        !frequency ||
        !isText(a.providerCustomerId) ||
        !isText(a.setupReference) ||
        !isText(a.expiresAt) ||
        !isText(a.setupExpiresAt)
    ) {
        return null;
    }
    const reported = readReport(a.reported);
    return {
        mandateId: a.mandateId,
        provider: a.provider,
        method: a.method,
        maxAmountCents: a.maxAmountCents,
        currency: a.currency,
        frequency,
        providerCustomerId: a.providerCustomerId,
        setupReference: a.setupReference,
        expiresAt: a.expiresAt,
        setupExpiresAt: a.setupExpiresAt,
        ...(reported ? { reported } : {}),
    };
}

/** A provider's report as the draft keeps it (dates as text). */
export function heldReportOf(change: ReportedMandateChange): HeldReport {
    const out: HeldReport = { status: change.status };
    if (change.providerMandateId) {
        out.providerMandateId = change.providerMandateId;
    }
    if (change.providerCustomerId) {
        out.providerCustomerId = change.providerCustomerId;
    }
    if (change.method) out.method = change.method;
    if (change.displayHint) out.displayHint = change.displayHint;
    if (typeof change.maxAmountCents === "number") {
        out.maxAmountCents = change.maxAmountCents;
    }
    if (change.expiresAt && !Number.isNaN(change.expiresAt.getTime())) {
        out.expiresAt = change.expiresAt.toISOString();
    }
    if (change.failureReason) out.failureReason = change.failureReason;
    return out;
}

/** A held report as a change to apply, for the set-up it answered. */
export function changeOfHeld(
    held: HeldReport,
    setupReference: string,
): ReportedMandateChange {
    return {
        status: held.status,
        setupReference,
        ...(held.providerMandateId
            ? { providerMandateId: held.providerMandateId }
            : {}),
        ...(held.providerCustomerId
            ? { providerCustomerId: held.providerCustomerId }
            : {}),
        ...(held.method ? { method: held.method } : {}),
        ...(held.displayHint ? { displayHint: held.displayHint } : {}),
        ...(typeof held.maxAmountCents === "number"
            ? { maxAmountCents: held.maxAmountCents }
            : {}),
        ...(held.expiresAt ? { expiresAt: new Date(held.expiresAt) } : {}),
        ...(held.failureReason ? { failureReason: held.failureReason } : {}),
    };
}
