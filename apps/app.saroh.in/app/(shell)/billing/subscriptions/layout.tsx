import type { ReactNode } from "react";

import { paymentsDenied } from "@/components/invoices/payments-denied";
import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for Billing → Subscriptions (ADR-007). Subscriptions come with
 * Payments; a deep link reaches these routes whatever the rail shows, so the
 * gate sits here once for every nested route. A role Payments is out of
 * reach for gets the design's locked card (D18), not the generic denial.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate moduleKey="PAYMENTS" denied={paymentsDenied}>
            {children}
        </ModuleGate>
    );
}
