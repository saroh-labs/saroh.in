import type { ReactNode } from "react";

import { paymentsDenied } from "@/components/invoices/locked/payments-denied";
import { ModuleGate } from "@/components/modules/gate/module-gate";
import { SubscriptionSaveProvider } from "@/lib/subscriptions/use-subscriptions";

/**
 * Capability gate for a plan's page (D4). Plans come with Payments, as
 * Subscriptions do; a deep link reaches this route whatever the rail shows.
 * A role Payments is out of reach for gets the locked card (D18). Every
 * write below saves as the tab's business and reads Subscriptions' queries
 * again (`SubscriptionSaveProvider`, DEC-259).
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate moduleKey="PAYMENTS" denied={paymentsDenied}>
            <SubscriptionSaveProvider>{children}</SubscriptionSaveProvider>
        </ModuleGate>
    );
}
