import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for Class packs (ADR-007). A pack is booked time sold
 * ahead, so it belongs to Appointments. A deep link reaches these routes
 * whatever the rail shows, so the gate sits here once for every nested route.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="APPOINTMENTS">{children}</ModuleGate>;
}
