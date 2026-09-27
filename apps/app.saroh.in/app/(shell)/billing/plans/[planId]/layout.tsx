import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for a plan's page (D4). Plans come with Payments, as
 * Subscriptions do; a deep link reaches this route whatever the rail shows.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="PAYMENTS">{children}</ModuleGate>;
}
