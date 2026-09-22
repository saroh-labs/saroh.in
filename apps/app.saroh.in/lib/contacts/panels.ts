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
    { read: string; write: string; moduleKey: string }
> = {
    subscriptions: {
        read: "subscription:read",
        write: "subscription:write",
        moduleKey: "PAYMENTS",
    },
    // A pack is booked time sold ahead: Appointments (ADR-007).
    packs: {
        read: "pack:read",
        write: "pack:write",
        moduleKey: "APPOINTMENTS",
    },
    courses: {
        read: "course:read",
        write: "course:write",
        moduleKey: "COURSES",
    },
    invoices: {
        read: "invoice:read",
        write: "invoice:write",
        moduleKey: "PAYMENTS",
    },
};

/** Who is looking: `resolveActiveOrganization`'s answer, or null for none. */
export type Viewer = {
    role: string;
    actions?: readonly string[];
} | null;

/** A module as `listModules` returns it; null when that list failed. */
export type ModuleStates = readonly { key: string; readiness: string }[] | null;

/** May this viewer do `action`? The API's answer, else the built-in roles'. */
export function viewerCan(viewer: Viewer, action: string): boolean {
    if (!viewer) return false;
    if (viewer.actions) return viewer.actions.includes(action);
    return viewer.role === "OWNER" || viewer.role === "ADMIN";
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

export function contactPanels(
    viewer: Viewer,
    modules: ModuleStates,
): PanelPlan {
    const shown = (p: ContactPanel) =>
        viewerCan(viewer, NEEDS[p].read) &&
        moduleOn(modules, NEEDS[p].moduleKey);
    const panels = PANEL_ORDER.filter(shown);
    const canAct = Object.fromEntries(
        PANEL_ORDER.map((p) => [
            p,
            panels.includes(p) && viewerCan(viewer, NEEDS[p].write),
        ]),
    ) as Record<ContactPanel, boolean>;
    return {
        panels,
        canAct,
        mentionInvoices: panels.includes("invoices"),
        paymentsOn: moduleOn(modules, "PAYMENTS"),
    };
}
