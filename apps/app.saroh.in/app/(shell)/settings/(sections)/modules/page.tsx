import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Modules (ADR-003 / #115). Lets OWNER/ADMIN enable the capabilities
 * their business needs and see each module's effective state; other roles see
 * it read-only (the API enforces the role).
 *
 * On React Query (DEC-259): the read (`/api/modules`, `lib/modules/access.ts`)
 * loads in the browser, drawn by `SettingsTabScreen`, which switches to the
 * other Settings tabs in place.
 */
export const metadata = { title: "Modules · Settings" };

export default async function ModulesSettingsPage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    return (
        <SettingsTabScreen tab="/settings/modules" kind={org?.kind ?? null} />
    );
}
