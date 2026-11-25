import { forbidden } from "next/navigation";

import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { kindWords } from "@/lib/organizations/kind";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { mayReadOrganization } from "@/lib/settings/access";

/**
 * Settings → Organization. The tenant's own identity (name + business
 * profile), the business's web address (DEC-069, L4), its opening hours,
 * and for someone who may change things one "what's left" card
 * (`loadSettingsChecklist`, DEC-056).
 *
 * OWNER/ADMIN only (`org:settings:read` / `org:update`, enforced by the
 * API): a role without it reaches forbidden.tsx; an unavailable API the
 * tab's failed state.
 *
 * Named in the words of what is being set up (DEC-070, K5): "Business" for
 * a business, "Your details" for Just me and A site for my work.
 *
 * On React Query (DEC-259): the read (`lib/settings/access.ts`) loads in
 * the browser, drawn by `SettingsTabScreen`.
 */
export async function generateMetadata() {
    // The shell's own read of the business, so the title costs no call.
    const organization = await activeOrganizationOnce().catch(() => null);
    return {
        title: `${kindWords(organization?.kind).settingsTab} · Settings`,
    };
}

export default async function OrganizationSettingsPage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    if (!org || !(await mayReadOrganization())) forbidden();
    return (
        <SettingsTabScreen
            tab="/settings/organization"
            kind={org.kind ?? null}
        />
    );
}
