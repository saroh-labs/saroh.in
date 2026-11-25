import { forbidden } from "next/navigation";

import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { mayReadPeople } from "@/lib/settings/access";

/**
 * Settings → People (#276): who is in the business, their roles, and the
 * roles it has.
 *
 * Everyone who may see the team sees it; only an owner or admin may change
 * it. The API enforces both, and the read (`lib/settings/access.ts`) works
 * out what this person may change from the permissions the API resolved,
 * so a member is not offered controls that would refuse them.
 *
 * On React Query (DEC-259): the gate is the page's; the read loads in the
 * browser, drawn by `SettingsTabScreen`, which switches to Your profile and
 * Business in place.
 */
export const metadata = { title: "Team · Settings" };

export default async function PeoplePage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    if (!org || !(await mayReadPeople())) forbidden();
    return <SettingsTabScreen tab="/settings/people" kind={org.kind ?? null} />;
}
