import { planMeter } from "./metering.service";

/**
 * The plan's say over taking money online (catalogue rows `payments` and
 * `subscriptions`, both under the PAYMENTS registry module).
 *
 * On a plan without online payments, **new** online payments stop: no
 * pay-online on an order or invoice, no online checkout on the site, no pay
 * link that charges, no first connection of a payment provider, and no new
 * customer subscription. What the business already has goes on (ADR-003:
 * disabling never abandons obligations): a subscription it already has
 * keeps renewing, its renewal invoices stay payable online, and autopay
 * keeps charging. Invoicing by hand is on every plan (DEC-070): an invoice
 * without online pay is sent as a view link.
 *
 * This is the plan, beside the business's own Payments switch
 * (`invoices/payments-on.ts`), and asked the way every plan check is:
 * through `planMeter`, behind `PLAN_ENFORCEMENT`, failing open when the
 * plan can't be read (`plan_meter_unresolved`), and never for a business
 * the catalogue doesn't reach yet.
 *
 * Two shapes: the business's own requests are refused with 403
 * `MODULE_LOCKED` (`assert…`), which the app turns into its upgrade panel;
 * a customer's side only asks yes or no, and words its own refusal without
 * naming a plan, as the booking page's cap does.
 */

/** The row that sells taking money online. */
export const PAYMENTS_ROW = "payments";
/** The row that sells memberships that renew. */
export const SUBSCRIPTIONS_ROW = "subscriptions";

async function included(
    organizationId: string,
    moduleId: string,
): Promise<boolean> {
    const row = await planMeter.enforcedRow(organizationId, moduleId);
    return !row || row.state === "on";
}

/** Whether the plan lets this business take a new payment online. */
export function planTakesOnlinePayment(
    organizationId: string,
): Promise<boolean> {
    return included(organizationId, PAYMENTS_ROW);
}

/**
 * Whether the plan lets the business connect one more of its own email or
 * payment accounts (catalogue row `integrations`, DEC-091): the connect's
 * own check (`MeteringService.hasRoom`), without writing. A plan or count
 * that can't be read is room, failing open as every plan check here does:
 * this only decides what a screen offers, and the connect still refuses.
 */
export function planConnectsOwnAccounts(
    organizationId: string,
): Promise<boolean> {
    return planMeter.hasRoom(organizationId, "integrations").catch(() => true);
}

/**
 * Why no payment provider can take money online when none is connected:
 * `NO_PROVIDER` when the business could connect one, `PLAN` when its plan
 * won't let it (no room on `integrations`, DEC-091) — Free on a version
 * with no `payments` row still can't connect one, so no screen says
 * "Connect one" to a key form the connect refuses (UX-006, UX-017).
 */
export async function noProviderReason(
    organizationId: string,
): Promise<"PLAN" | "NO_PROVIDER"> {
    return (await planConnectsOwnAccounts(organizationId))
        ? "NO_PROVIDER"
        : "PLAN";
}

/** 403 `MODULE_LOCKED` when the plan leaves online payments off. */
export async function assertPlanTakesOnlinePayment(
    organizationId: string,
): Promise<void> {
    await planMeter.assertIncluded(organizationId, PAYMENTS_ROW);
}

/**
 * Whether the plan lets a new customer subscription start: memberships,
 * and the online payments they are paid through. Renewals never ask.
 */
export async function planStartsSubscriptions(
    organizationId: string,
): Promise<boolean> {
    return (
        (await included(organizationId, SUBSCRIPTIONS_ROW)) &&
        (await included(organizationId, PAYMENTS_ROW))
    );
}

/** 403 `MODULE_LOCKED` naming the row the plan leaves off. */
export async function assertPlanStartsSubscriptions(
    organizationId: string,
): Promise<void> {
    await planMeter.assertIncluded(organizationId, SUBSCRIPTIONS_ROW);
    await planMeter.assertIncluded(organizationId, PAYMENTS_ROW);
}

/**
 * Whether an invoice is the renewal of a subscription the business already
 * has: issued against one (`subscriptionId`). Such an invoice stays payable
 * online on any plan. An online plan join's draft has no subscription yet,
 * so it isn't one.
 */
export function isRenewalInvoice(
    invoice: { subscriptionId?: string | null } | null | undefined,
): boolean {
    return Boolean(invoice?.subscriptionId);
}

/**
 * Whether this invoice may be paid online as far as the plan goes: a
 * renewal always; anything else only on a plan with online payments.
 */
export async function planTakesInvoiceOnline(
    organizationId: string,
    invoice: { subscriptionId?: string | null } | null | undefined,
): Promise<boolean> {
    if (isRenewalInvoice(invoice)) return true;
    return planTakesOnlinePayment(organizationId);
}
