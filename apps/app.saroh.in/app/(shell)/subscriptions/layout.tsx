import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for Billing → Subscriptions (ADR-007). Subscriptions come with
 * Payments; a deep link reaches these routes whatever the rail shows, so the
 * gate sits here once for every nested route.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="PAYMENTS">{children}</ModuleGate>;
}
