import type { ReactNode } from "react";

import { paymentsDenied } from "@/components/invoices/payments-denied";
import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for a new plan (D7), as a plan's own page has: plans come
 * with Payments, and a deep link reaches this route whatever the rail shows.
 * A role Payments is out of reach for gets the locked card (D18).
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate moduleKey="PAYMENTS" denied={paymentsDenied}>
            {children}
        </ModuleGate>
    );
}
