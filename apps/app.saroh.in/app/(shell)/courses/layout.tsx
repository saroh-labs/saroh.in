import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for Courses (ADR-007), its own module. A deep link reaches
 * these routes whatever the rail shows, so the gate sits here once for every
 * nested route.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="COURSES">{children}</ModuleGate>;
}
