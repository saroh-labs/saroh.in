import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for Class packs, its own module since E12 (it needs
 * Appointments). A deep link reaches these routes whatever the rail shows,
 * so the gate sits here once for every nested route. Switched off, it points
 * at "Also sell" on Services, which flips the same switch as Settings.
 */
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <ModuleGate
            moduleKey="CLASS_PACKS"
            switchedOnAt={{
                href: "/services",
                label: "Turn it on in Services",
            }}
        >
            {children}
        </ModuleGate>
    );
}
