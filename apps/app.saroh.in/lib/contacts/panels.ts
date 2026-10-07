import { permits } from "@/lib/organizations/permits";

/**
 * Which of a person's holdings their contact page asks for (ADR-007, U12).
 *
 * Pure, so the rule is tested rather than read off a page: a panel is
 * requested only when the viewer may read it AND its module is on. One that
 * is not is not requested at all — no call, no "you can't see this" — so a
 * Member opens the contact page they always had.
 *
 * Both answers use the ones the workspace already gives: the actions the API
 * resolved for this person (the role map when they are absent, as
 * `lib/class-packs/access.ts` does), and a module's `readiness`, the field
 * the rail and `moduleAccess` read. Module availability fails OPEN, as they
 * do: a list that could not be read, or a module missing from it, is
 * "we don't know", and each panel's own read then says whether it worked.
 */

export type ContactPanel = "subscriptions" | "packs" | "courses" | "invoices";

/** In the order the page draws them, after Leads. */
export const PANEL_ORDER: readonly ContactPanel[] = [
    "subscriptions",
    "packs",
    "courses",
    "invoices",
];

const NEEDS: Record<
    ContactPanel,
    {
        read: string;
        /** Any one of them offers the panel's action. */
        write: string | readonly string[];
        /** None: the panel needs only its read (invoices, DEC-070). */
        moduleKey?: string;
    }
> = {
    subscriptions: {
        read: "subscription:read",
        write: "subscription:write",
        moduleKey: "PAYMENTS",
    },
    // A pack is booked time sold ahead: its own module, Class packs (E12).
    // "Sell a pack" is `pack:sell` (E26); an API from before it asked
    // `pack:write`, which implies it now.
    packs: {
        read: "pack:read",
        write: ["pack:sell", "pack:write"],
        moduleKey: "CLASS_PACKS",
    },
    courses: {
        read: "course:read",
        write: "course:write",
        moduleKey: "COURSES",
    },
    // Invoicing needs no module (DEC-070): a business bills and records
    // paid with Payments off.
    invoices: {
        read: "invoice:read",
        write: "invoice:write",
    },
};

/** Who is looking: `resolveActiveOrganization`'s answer, or null for none. */
export type Viewer = {
    role: string;
    actions?: readonly string[];
} | null;

/** A module as `listModules` returns it; null when that list failed. */
export type ModuleStates = readonly { key: string; readiness: string }[] | null;

/**
 * May this viewer do `action`? The API's answer only — a panel's money
 * (orders, invoices) follows the role's permissions, never its name
 * (DEC-098).
 */
export function viewerCan(viewer: Viewer, action: string): boolean {
    return permits(viewer, action);
}

/**
 * Is a module on for this viewer? Readiness, not lifecycle — the rail's
 * question. An empty or failed list, or a module it does not name, is
 * unknown and allowed through (see `moduleAccess`).
 */
export function moduleOn(modules: ModuleStates, key: string): boolean {
    if (!modules || modules.length === 0) return true;
    const found = modules.find((m) => m.key === key);
    return found ? found.readiness !== "DISABLED" : true;
}

export interface PanelPlan {
    /** The panels to request and draw, in page order. */
    panels: ContactPanel[];
    /** Whether each panel's action (Subscribe, Sell a pack, …) is offered. */
    canAct: Record<ContactPanel, boolean>;
    /**
     * Whether packs and courses may mention an invoice: only when the
     * invoices panel itself is shown, so a line never points at money this
     * page cannot show — and never with Payments off.
     */
    mentionInvoices: boolean;
    /**
     * Payments is on, by the rail's rule: whether enrolling from this page
     * issues an invoice, for the enrol dialog to say.
     */
    paymentsOn: boolean;
}

/**
 * Only what selling a pack needs — the packs on sale and whether a sale
 * issues an invoice — and no panel. Customer Detail (round-2 C7) has the
 * person's packs in its own read, and asks for this only once the viewer
 * may sell and Class packs is on there.
 */
export function sellPacksOnly(): PanelPlan {
    return {
        panels: [],
        canAct: {
            subscriptions: false,
            packs: true,
            courses: false,
            invoices: false,
        },
        mentionInvoices: false,
        paymentsOn: false,
    };
}

export function contactPanels(
    viewer: Viewer,
    modules: ModuleStates,
): PanelPlan {
    const shown = (p: ContactPanel) =>
        viewerCan(viewer, NEEDS[p].read) &&
        (!NEEDS[p].moduleKey || moduleOn(modules, NEEDS[p].moduleKey));
    const panels = PANEL_ORDER.filter(shown);
    const canAct = Object.fromEntries(
        PANEL_ORDER.map((p) => [
            p,
            panels.includes(p) &&
                [NEEDS[p].write]
                    .flat()
                    .some((action) => viewerCan(viewer, action)),
        ]),
    ) as Record<ContactPanel, boolean>;
    const paymentsOn = moduleOn(modules, "PAYMENTS");
    return {
        panels,
        canAct,
        // Packs and courses invoice only with Payments on (DEC-019), even
        // now the invoices panel shows without it (DEC-070).
        mentionInvoices: panels.includes("invoices") && paymentsOn,
        paymentsOn,
    };
}
