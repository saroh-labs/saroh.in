import type { ReactNode } from "react";

import {
    BARE,
    BookingsLocked,
    BookingsTopBar,
} from "@/components/bookings/calendar/parts";
import { ModuleGate } from "@/components/modules/module-gate";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { canReadBookings } from "@/lib/services/access";

/**
 * Capability gate for this section (#117, §21).
 *
 * The sidebar already hides APPOINTMENTS when it is off, but hiding a nav item is
 * not enforcement — a bookmark or a pasted link reaches these routes directly.
 * Gating at the layout covers every nested route, including deep links to a
 * detail page, with one check.
 *
 * A role without `booking:read` (a Reviewer) gets the design's locked card
 * first (E5): it says why and who can change it, rather than an error or the
 * generic denial. The role wins over the switch, as in ModuleGate: the person
 * reading this can do nothing about either.
 */
export default async function Layout({ children }: { children: ReactNode }) {
    const organization = await resolveActiveOrganization().catch(() => null);
    if (organization && !canReadBookings(organization)) {
        return (
            <PageContainer width="full" className={BARE}>
                <BookingsTopBar />
                <BookingsLocked
                    role={organization.role}
                    roleLabel={organization.roleLabel ?? null}
                />
            </PageContainer>
        );
    }
    return <ModuleGate moduleKey="APPOINTMENTS">{children}</ModuleGate>;
}
