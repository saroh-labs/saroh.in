import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Organization. The tenant's own identity (name + business profile),
 * which until now was write-once at onboarding with no edit path in the product
 * OR the API — so a typo in the legal name was permanent, and visible on
 * published sites.
 *
 * OWNER/ADMIN only, enforced by the API (`org:settings:read` / `org:update`). A
 * MEMBER gets a 403 that surfaces as the explanatory empty state rather than an
 * error page: not being allowed is a legitimate answer, not a failure.
 */
export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
    await requireSession();

    const settings = await getOrganizationSettings().catch(() => null);

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title="Organization"
                description="Your workspace name and the business identity used across Saroh."
            />
            {settings ? (
                <OrganizationSettingsForm settings={settings} />
            ) : (
                <EmptyState
                    title="Not available"
                    description="Organization settings are available to owners and admins."
                />
            )}
        </main>
    );
}
