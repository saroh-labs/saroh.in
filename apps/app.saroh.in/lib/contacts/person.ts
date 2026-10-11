import type { Tab, TabKey } from "@/lib/customer-workspace/view";
import { orderPowers } from "@/lib/orders/access";

import type { ModuleStates, Viewer } from "./panels";
import { moduleOn, viewerCan } from "./panels";
import { personHref } from "./person-href";

/**
 * One person, one page (UX-050, #869): `/contacts/<contactId>`, with tabs
 * for what the business has with them — leads and enquiries beside orders,
 * bookings, packs, courses, billing and messages. Pure, so the rules are
 * tested rather than read off the page.
 *
 * `/customers/<id>`, Customer Detail's old address, redirects here, and
 * every link to a person in the workspace is built by `personHref`
 * (`person-href.ts`, which imports nothing, so any module can use it).
 */

/**
 * Where `/customers/<id>` goes. The id there was always a contact's, but a
 * store customer's id may reach it from an older link: one linked to a
 * contact goes to that contact. Anything else is taken as a contact's id,
 * and the person page says so if no one has it.
 */
export function customerRedirectPath(
    id: string,
    linkedContactId: string | null,
    tab?: string | null,
): string {
    return personHref(linkedContactId ?? id, tab);
}

/**
 * The tabs the person page adds to Customer Detail's own (which the API's
 * read decides, block by block): Leads and Enquiries where CRM is on and
 * the viewer reads leads, Courses where Courses is on and they read
 * courses. A module that is off, or not in the business's plan, reads as
 * DISABLED — readiness folds the plan's entitlement in — and its tab is
 * not shown; an unknown module list fails open, as the rail does.
 */
export interface PersonTabGates {
    leads: boolean;
    enquiries: boolean;
    courses: boolean;
}

export function personTabGates(
    viewer: Viewer,
    modules: ModuleStates,
): PersonTabGates {
    const crm = moduleOn(modules, "CRM") && viewerCan(viewer, "lead:read");
    return {
        leads: crm,
        enquiries: crm,
        courses:
            moduleOn(modules, "COURSES") && viewerCan(viewer, "course:read"),
    };
}

/**
 * What the Subscriptions and Invoices tabs offer, beside what they list:
 * Subscribe (`subscription:write`, Payments on), New invoice, and Record
 * payment on each unpaid invoice (`invoice:write`, as Invoice Detail asks
 * it; invoicing needs no module, DEC-070). Money follows the role's
 * permissions only, never its name (DEC-098).
 */
export function personTabActions(
    viewer: Viewer,
    modules: ModuleStates,
): { subscribe: boolean; newInvoice: boolean; recordPayment: boolean } {
    const invoices =
        viewerCan(viewer, "invoice:read") && viewerCan(viewer, "invoice:write");
    return {
        recordPayment: invoices,
        subscribe:
            moduleOn(modules, "PAYMENTS") &&
            viewerCan(viewer, "subscription:read") &&
            viewerCan(viewer, "subscription:write"),
        newInvoice: invoices,
    };
}

/**
 * New order and New booking from the person (#247): each the existing flow,
 * opened with them already chosen. Shown only where it can be used — its
 * module on (DEC-057: a module that is off is hidden, not explained) and the
 * role holding what that flow's own button asks. New order on the Orders
 * list is `orderPowers().create` (`order:create`, or the old `order:write`)
 * for someone who reads orders, never the kitchen's view; New booking on the
 * calendar is `booking:write`, in a section that opens on `booking:read`.
 * Only the role's permissions decide (DEC-098). A module list that couldn't
 * be read fails open, as the rail does; the API decides again.
 */
export function personNewActions(
    viewer: Viewer,
    modules: ModuleStates,
): { newOrder: boolean; newBooking: boolean } {
    return {
        newOrder:
            !!viewer &&
            moduleOn(modules, "COMMERCE") &&
            viewerCan(viewer, "order:read") &&
            orderPowers(viewer).create,
        newBooking:
            moduleOn(modules, "APPOINTMENTS") &&
            viewerCan(viewer, "booking:read") &&
            viewerCan(viewer, "booking:write"),
    };
}

/** New order on the Orders list, opened for this person. */
export function newOrderHref(contactId: string): string {
    return `/commerce/orders?new=1&contactId=${encodeURIComponent(contactId)}`;
}

/** New booking on the calendar, opened for this person. */
export function newBookingHref(contactId: string): string {
    return `/bookings?new=1&contactId=${encodeURIComponent(contactId)}`;
}

/**
 * The header's New order and New booking for this person, in that order:
 * each one `personNewActions` allows, New order only where the business
 * sells something a counter takes (the Orders list's own rule), and
 * neither for someone whose details were removed for a privacy request
 * (C11) — nothing new is made for them.
 */
export function personStarts(
    contactId: string,
    can: { newOrder: boolean; newBooking: boolean },
    { removed, sellsProducts }: { removed: boolean; sellsProducts: boolean },
): { label: string; href: string }[] {
    if (removed) return [];
    const starts: { label: string; href: string }[] = [];
    if (can.newOrder && sellsProducts) {
        starts.push({ label: "New order", href: newOrderHref(contactId) });
    }
    if (can.newBooking) {
        starts.push({ label: "New booking", href: newBookingHref(contactId) });
    }
    return starts;
}

/** The order the page draws its tabs in. */
const ORDER: readonly TabKey[] = [
    "over",
    "lead",
    "enq",
    "ord",
    "bk",
    "pk",
    "crs",
    "sub",
    "inv",
    "rev",
    "msg",
    "notes",
];

/** Customer Detail's tabs with the person page's own, in page order. */
export function withPersonTabs(base: Tab[], extra: Tab[]): Tab[] {
    const keys = new Set(base.map((t) => t.key));
    return [...base, ...extra.filter((t) => !keys.has(t.key))].sort(
        (a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key),
    );
}

/**
 * The crumbs: Contacts, the person page's own list. Only where Contacts is
 * not on the rail (CRM off) does someone who buys file under Sell ›
 * Customers, as #858 had it, so the crumb never leads to a section that is
 * switched off.
 */
export function crumbsToSell(
    crmOn: boolean,
    sells: boolean,
    linkedCustomers: number,
): boolean {
    return !crmOn && sells && linkedCustomers > 0;
}
