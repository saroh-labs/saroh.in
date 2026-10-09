import type { ReactNode } from "react";

import { ModuleGate } from "@/components/modules/module-gate";

/**
 * Capability gate for the Contacts list (#117, §21).
 *
 * The sidebar already hides CRM when it is off, but hiding a nav item is
 * not enforcement — a bookmark or a pasted link reaches this route directly.
 *
 * The person page beside it (`/contacts/<id>`, #869) is outside this group
 * on purpose: it is every customer's page, CRM or not, and gates its own
 * tabs — Leads and Enquiries go with CRM (`lib/contacts/person.ts`).
 */
export default function Layout({ children }: { children: ReactNode }) {
    return <ModuleGate moduleKey="CRM">{children}</ModuleGate>;
}
