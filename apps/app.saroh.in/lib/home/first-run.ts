import { rolledOut, rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import type { OrganizationKind } from "@/lib/organizations/kind";
import { firstRunOrder, INVOICE_JOB, kindOf } from "@/lib/organizations/kind";

/**
 * The first-run question on Home (Saroh Workspace): what a business with
 * nothing turned on is offered, and what each pick actually turns on. Pure, so
 * the rules — who may be offered what, and in which order things switch on —
 * are tested without a browser.
 */
export interface FirstRunJob {
    /** A module key, or {@link INVOICE_JOB}. */
    key: string;
    verb: string;
    note: string;
    /**
     * Read after the word "Adds", so it continues rather than restarts.
     * Absent on a job that turns nothing on, which adds no rows.
     */
    gives?: string;
    /** Prerequisites this pick also turns on, prerequisites first. */
    pulls: string[];
    /**
     * Where a job that turns nothing on goes instead of the Turn on sheet:
     * "Invoice a client" opens a new invoice (DEC-070 Decision 5).
     */
    href?: string;
}

/**
 * Four jobs, not the eight modules. They are the ones a business starts with;
 * the rest only mean something once one of these is running, and stay one link
 * away in the full list. Their order is the kind's (`firstRunOrder`), and the
 * kind may reword one (`WORDS_BY_KIND`); a job is never left out for a kind.
 */
const JOBS: Omit<FirstRunJob, "pulls">[] = [
    {
        key: "COMMERCE",
        verb: "Sell things",
        note: "Take money for products, in person or online.",
        gives: "orders, products, customers and discounts",
    },
    {
        key: "APPOINTMENTS",
        verb: "Take bookings",
        note: "A diary people can book time in.",
        gives: "a schedule and your services",
    },
    {
        key: "WEBSITE",
        verb: "Put up a website",
        note: "Pages, a journal and an address.",
        gives: "pages and posts",
    },
    {
        key: "CRM",
        verb: "Keep track of people",
        note: "Everyone you deal with, in one list.",
        gives: "contacts, leads and a pipeline",
    },
];

/**
 * A job's words for a kind, where the business's words would be wrong
 * (plan KTD-5): a freelancer keeps track of clients, and a site for someone's
 * work hears from its readers. Only the words change, never what it turns on.
 */
const WORDS_BY_KIND: Partial<
    Record<OrganizationKind, Record<string, Partial<FirstRunJob>>>
> = {
    SOLO: {
        CRM: {
            verb: "Keep track of clients",
            note: "Everyone you work for, in one list.",
        },
    },
    WORK: {
        CRM: {
            verb: "Hear from readers",
            note: "Everyone who gets in touch, in one list.",
        },
    },
};

/**
 * "Invoice a client" (plan KTD-6): a job with no module behind it. Invoices
 * need no module (DEC-070 Decision 5), so it opens a new invoice rather than
 * the Turn on sheet, and adds nothing to the sidebar.
 */
const INVOICE: Omit<FirstRunJob, "pulls"> = {
    key: INVOICE_JOB,
    verb: "Invoice a client",
    note: "Bill for your work, send it, and mark it paid when they pay.",
    href: "/billing/invoices/new",
};

/**
 * What "Invoice a client" needs to know about the person and the business.
 * Absent, it is not offered: a card nobody has said may be used is a dead
 * end.
 */
export interface InvoiceJobFacts {
    /** They hold `invoice:write`. */
    mayWrite: boolean;
    /**
     * The business already has an invoice, so the job has been done. Null
     * when that could not be read: the card is then offered, since a new
     * invoice is never a false claim.
     */
    hasInvoice: boolean | null;
}

/**
 * What a module is called where the merchant will look for it: the sidebar
 * (`components/shared/nav-items.tsx`). The design says "People"; this sidebar
 * says Contacts, and a toast pointing at a row that does not exist sends the
 * merchant looking for nothing.
 */
const SIDEBAR_NAME: Partial<Record<string, string>> = {
    CRM: "Contacts",
    COMMERCE: "Sell",
    APPOINTMENTS: "Bookings",
    WEBSITE: "Website",
};

export function sidebarName(modules: ModuleView[], key: string): string {
    return (
        SIDEBAR_NAME[key] ?? modules.find((m) => m.key === key)?.label ?? key
    );
}

/**
 * Everything a pick switches on, prerequisites before what needs them — the
 * order the API accepts. Dependencies come from the server's read model, never
 * from this file; what is already on is left alone.
 */
export function turnOnOrder(modules: ModuleView[], key: string): string[] {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    const order: string[] = [];
    const visit = (k: string, seen: string[]) => {
        if (seen.includes(k)) return; // a cycle is the server's bug, not a hang
        for (const dep of byKey.get(k)?.dependencies ?? []) {
            visit(dep, [...seen, k]);
        }
        if (!order.includes(k)) order.push(k);
    };
    visit(key, []);
    return order.filter((k) => byKey.get(k)?.lifecycle !== "ENABLED");
}

/**
 * The jobs this person may pick in this business, in the kind's order
 * (DEC-070): the module exists here (its rollout reached this business), is
 * not on yet, and they may turn on it AND everything it pulls in. A card
 * whose click the server would refuse is a dead end in a nicer frame.
 *
 * "Invoice a client" is in a kind's order only for Just me. It is offered
 * to someone who may write invoices, until the business has one.
 */
export function firstRunJobs(
    modules: ModuleView[],
    kind?: unknown,
    invoicing?: InvoiceJobFacts,
): FirstRunJob[] {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    // Only what Saroh has rolled out here (DEC-057): the API lists every
    // module, a dark one with ROLLOUT_DISABLED.
    const shown = rolledOutKeys(modules);
    const words = WORDS_BY_KIND[kindOf(kind)] ?? {};
    return firstRunOrder(kind).flatMap((key): FirstRunJob[] => {
        if (key === INVOICE_JOB) {
            if (!invoicing?.mayWrite || invoicing.hasInvoice === true) {
                return [];
            }
            return [{ ...INVOICE, pulls: [] }];
        }
        const job = JOBS.find((j) => j.key === key);
        if (!job || !shown.has(key)) return [];
        const view = byKey.get(key);
        if (!view || view.lifecycle === "ENABLED") return [];
        const order = turnOnOrder(modules, key);
        if (!order.every((k) => byKey.get(k)?.canManage)) return [];
        return [
            {
                ...job,
                ...words[key],
                pulls: order.filter((k) => k !== key),
            },
        ];
    });
}

/**
 * Whether this person may write invoices here (`invoice:write`), for
 * "Invoice a client". Without resolved actions (an older response) the
 * built-in roles decide, as the rail does: an Owner and an Admin.
 */
export function mayWriteInvoices(
    business: { role: string; actions?: string[] } | null,
): boolean {
    if (!business) return false;
    if (business.actions) return business.actions.includes("invoice:write");
    return business.role === "OWNER" || business.role === "ADMIN";
}

/**
 * Whether the business has turned on something this person's role doesn't
 * reach. Home then says it isn't open to them, never that the business
 * picked nothing (F16: a Storefront team member reaches no module).
 */
export function onButNotOpen(modules: readonly ModuleView[]): boolean {
    return rolledOut(modules).some(
        (m) =>
            m.lifecycle === "ENABLED" &&
            m.blockers.some((b) => b.code === "UNAUTHORIZED"),
    );
}
