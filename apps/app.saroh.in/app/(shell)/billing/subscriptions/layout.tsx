import type { ReactNode } from "react";

import { paymentsDenied } from "@/components/invoices/locked/payments-denied";
import { ModuleGate } from "@/components/modules/gate/module-gate";
import { SubscriptionSaveProvider } from "@/lib/subscriptions/use-subscriptions";

/**
 * Capability gate for Billing → Subscriptions (ADR-007). Subscriptions come with
 * Payments; a deep link reaches these routes whatever the rail shows, so the
 * gate sits here once for every nested route. A role Payments is out of
 * reach for gets the design's locked card (D18), not the generic denial.
 * Every write below saves as the tab's business and reads Subscriptions'
 * queries again (`SubscriptionSaveProvider`, DEC-259).
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate moduleKey="PAYMENTS" denied={paymentsDenied}>
            <SubscriptionSaveProvider>{children}</SubscriptionSaveProvider>
        </ModuleGate>
    );
}
