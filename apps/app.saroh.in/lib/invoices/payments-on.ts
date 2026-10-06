import { offersOnlinePay } from "@/lib/billing/access";
import { moduleOn } from "@/lib/contacts/panels";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

import { hasPaymentProvider } from "./tax";

/**
 * Invoices need no module (DEC-070); a pay link needs Payments on and a
 * provider that can open the checkout window. Server-only.
 *
 * An invoice that exists carries the API's own answer (`send.payOnline`),
 * which is what its screens read. These are for the screens with no
 * invoice yet to ask about — New invoice and a draft's edit, whose "Issue
 * with pay link" makes a link the moment it issues.
 */

/** The Payments module is on here, by the rail's rule: unknown reads as on. */
export async function paymentsModuleOn(): Promise<boolean> {
    return moduleOn(await modulesOrUnknown(), "PAYMENTS");
}

/**
 * A pay link can be made: the plan takes online payment, Payments is on
 * and a provider opens the checkout window (`offersOnlinePay`). With any of
 * them off the API refuses the pay link, so the form mustn't offer one —
 * it issues, and the invoice goes out as a link to view (DEC-070, R33).
 */
export async function payLinkPossible(): Promise<boolean> {
    const [access, on, provider] = await Promise.all([
        billingAccessOrNull(),
        paymentsModuleOn(),
        hasPaymentProvider().catch(() => false),
    ]);
    return offersOnlinePay(access, on, provider);
}

/**
 * A screen with no invoice yet may offer a pay link: the plan takes online
 * payment and a provider opens the checkout window (`offersOnlinePay`).
 * Bookings ask this for "Send a pay link" and "Take ₹X"'s link; on a plan
 * without online payments they offer paying at the session instead (R33).
 */
export async function onlinePayReady(): Promise<boolean> {
    const [access, provider] = await Promise.all([
        billingAccessOrNull(),
        hasPaymentProvider().catch(() => false),
    ]);
    return offersOnlinePay(access, provider);
}
