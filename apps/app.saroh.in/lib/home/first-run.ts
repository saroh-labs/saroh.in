import { goalFor, goalHref, INVOICE_GOAL } from "@/lib/modules/goals";
import { moduleName } from "@/lib/modules/names";
import { rolledOut, rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { firstRunOrder, INVOICE_JOB } from "@/lib/organizations/kind";
import { permits } from "@/lib/organizations/permits";

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

/*
 * Four jobs, not the eight modules. They are the ones a business starts with;
 * the rest only mean something once one of these is running, and stay one link
 * away in the full list. Their order is the kind's (`firstRunOrder`), and the
 * kind may reword one; a job is never left out for a kind. Their words and
 * where each one lands are `lib/modules/goals.ts`, which setup and the module
 * picker read too, so the same choice is never worded twice.
 */

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
 * (`components/shared/navigation/nav-items.tsx`). The design says "People"; this sidebar
 * says Contacts, and a toast pointing at a row that does not exist sends the
 * merchant looking for nothing.
 */
export function sidebarName(modules: ModuleView[], key: string): string {
    return moduleName(key, modules);
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
    return firstRunOrder(kind).flatMap((key): FirstRunJob[] => {
        if (key === INVOICE_JOB) {
            if (!invoicing?.mayWrite || invoicing.hasInvoice === true) {
                return [];
            }
            return [
                {
                    ...INVOICE_GOAL,
                    pulls: [],
                    href: goalHref(INVOICE_JOB),
                },
            ];
        }
        const job = goalFor(key, kind);
        if (!job || !shown.has(key)) return [];
        const view = byKey.get(key);
        if (!view || view.lifecycle === "ENABLED") return [];
        const order = turnOnOrder(modules, key);
        if (!order.every((k) => byKey.get(k)?.canManage)) return [];
        return [
            {
                ...job,
                pulls: order.filter((k) => k !== key),
            },
        ];
    });
}

/**
 * Whether this person may write invoices here (`invoice:write`), for
 * "Invoice a client". The role's permissions only, never its name
 * (DEC-098).
 */
export function mayWriteInvoices(
    business: { role: string; actions?: string[] } | null,
): boolean {
    return permits(business, "invoice:write");
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

/**
 * Whether what the business turned on is held only by its plan (U14's
 * lock, `ENTITLEMENT_REQUIRED` and nothing else). Its readiness then reads
 * DISABLED, so Home has nothing "on" and falls to the first run, yet the
 * business did pick (#837): Home says the plan holds it, never that nobody
 * has chosen.
 */
export function heldByPlan(modules: readonly ModuleView[]): boolean {
    return rolledOut(modules).some(
        (m) =>
            m.lifecycle === "ENABLED" &&
            m.blockers.length > 0 &&
            m.blockers.every((b) => b.code === "ENTITLEMENT_REQUIRED"),
    );
}

/** Whether this person may turn modules on and off here (`module:manage`). */
export function mayManageModules(modules: readonly ModuleView[]): boolean {
    return modules.some((m) => m.canManage);
}
