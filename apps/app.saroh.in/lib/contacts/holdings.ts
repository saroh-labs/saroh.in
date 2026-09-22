import { apiFetch, orgBase } from "@/lib/api/http";
import type { ClassPack, PackPurchase } from "@/lib/class-packs/service";
import { getSellingTerms } from "@/lib/class-packs/service";
import type { Course, Enrollment } from "@/lib/courses/service";
import type { Invoice } from "@/lib/invoices/service";
import type { Plan, Subscription } from "@/lib/subscriptions/service";

import type { ContactPanel, PanelPlan } from "./panels";

/**
 * A person's holdings for their contact page (ADR-007, U12): subscriptions,
 * class packs, course seats and invoices, each read through the API's
 * `?contactId=` filters. Server-only.
 *
 * Every read here is an extra on a page that works without it, so none may
 * fail the page: not `getJson`, whose 403 raises `forbidden()` and whose 5xx
 * throws to the segment boundary. A read that fails is `null`, and only its
 * own panel says so.
 */

/** What one panel read: the rows, or null when they could not be read. */
export type Panel<T> = T | null;

/** What each panel's action needs, when this person may take it. */
export interface PanelChoices {
    /** Plans to subscribe them to; null when they could not be read. */
    plans: Plan[] | null;
    /** Packs to sell them, and whether selling issues an invoice. */
    packs: ClassPack[] | null;
    invoicesOnSale: boolean;
    /** Courses they could be enrolled on. */
    courses: Course[] | null;
}

export interface OwedSummary {
    unpaidCount: number;
    overdueCount: number;
    /** Kept per currency; never added across them. */
    totals: { currency: string; amount: string }[];
}

export interface ContactHoldings {
    subscriptions?: Panel<Subscription[]>;
    packs?: Panel<PackPurchase[]>;
    courses?: Panel<Enrollment[]>;
    invoices?: Panel<{ rows: Invoice[]; owed: OwedSummary }>;
    choices: PanelChoices;
}

async function read<T>(path: string): Promise<T | null> {
    try {
        const res = await apiFetch(path);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

async function readInvoices(
    base: string,
    q: string,
): Promise<{ rows: Invoice[]; owed: OwedSummary } | null> {
    const [rows, owed] = await Promise.all([
        read<Invoice[]>(`${base}/invoices?${q}`),
        read<OwedSummary>(`${base}/invoices/owed?${q}`),
    ]);
    // Both, or the panel would show rows beside a total it could not read.
    return rows && owed ? { rows, owed } : null;
}

const none = <T>(): Promise<T | null> => Promise.resolve(null);

/**
 * Read the panels the plan asks for — and only those: a panel the viewer
 * may not see, or whose module is off, costs no request.
 */
export async function loadContactHoldings(
    contactId: string,
    plan: PanelPlan,
): Promise<ContactHoldings> {
    const base = await orgBase();
    const empty: PanelChoices = {
        plans: null,
        packs: null,
        invoicesOnSale: false,
        courses: null,
    };
    if (!base) {
        const failed = Object.fromEntries(plan.panels.map((p) => [p, null]));
        return { ...failed, choices: empty };
    }
    const q = new URLSearchParams({ contactId }).toString();
    const wants = (p: ContactPanel) => plan.panels.includes(p);
    const acts = (p: ContactPanel) => plan.canAct[p];

    const [
        subscriptions,
        packs,
        courses,
        invoices,
        plans,
        packsOnSale,
        selling,
        openCourses,
    ] = await Promise.all([
        wants("subscriptions")
            ? read<Subscription[]>(`${base}/subscriptions?${q}`)
            : none<Subscription[]>(),
        wants("packs")
            ? read<PackPurchase[]>(`${base}/class-packs/purchases?${q}`)
            : none<PackPurchase[]>(),
        wants("courses")
            ? read<Enrollment[]>(`${base}/course-enrollments?${q}`)
            : none<Enrollment[]>(),
        wants("invoices") ? readInvoices(base, q) : none<never>(),
        acts("subscriptions")
            ? read<Plan[]>(`${base}/subscription-plans?status=ACTIVE`)
            : none<Plan[]>(),
        acts("packs")
            ? read<ClassPack[]>(`${base}/class-packs?status=ACTIVE`)
            : none<ClassPack[]>(),
        acts("packs") ? getSellingTerms() : null,
        acts("courses")
            ? read<Course[]>(`${base}/courses?status=OPEN`)
            : none<Course[]>(),
    ]);

    return {
        ...(wants("subscriptions") ? { subscriptions } : {}),
        ...(wants("packs") ? { packs } : {}),
        ...(wants("courses") ? { courses } : {}),
        ...(wants("invoices") ? { invoices } : {}),
        choices: {
            plans,
            packs: packsOnSale,
            invoicesOnSale: selling?.invoicesOnSale ?? false,
            courses: openCourses,
        },
    };
}
