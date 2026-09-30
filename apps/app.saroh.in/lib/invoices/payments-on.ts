import { moduleOn } from "@/lib/contacts/panels";
import { modulesOrUnknown } from "@/lib/modules/guard";

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
 * A pay link can be made: Payments on and a provider that opens the
 * checkout window. With Payments off the API refuses the pay link, so the
 * form mustn't offer one.
 */
export async function payLinkPossible(): Promise<boolean> {
    const [on, provider] = await Promise.all([
        paymentsModuleOn(),
        hasPaymentProvider(),
    ]);
    return on && provider;
}
