import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";

import { OrganizationSettingsForm } from "@/components/organizations/organization-settings-form";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Organization. The tenant's own identity (name + business profile),
 * which until now was write-once at onboarding with no edit path in the product
 * OR the API — so a typo in the legal name was permanent, and visible on
 * published sites.
 *
 * OWNER/ADMIN only, enforced by the API (`org:settings:read` / `org:update`). A
 * role denial reaches forbidden.tsx; an unavailable API reaches error.tsx.
 */
export const metadata = { title: "Business" };

export default async function OrganizationSettingsPage() {
    await requireSession();

    const [settings, organization] = await Promise.all([
        getOrganizationSettings(),
        resolveActiveOrganization(),
    ]);
    // From what the API resolved this person may do; the role's name is only
    // the fallback for a response that predates permissions.
    const canEdit = organization?.actions
        ? organization.actions.includes("org:update")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={["Workspace", "Business"]}
                title="Business"
            />
            {settings ? (
                <OrganizationSettingsForm
                    settings={settings}
                    canEdit={canEdit}
                />
            ) : (
                <EmptyState
                    title="Not available"
                    description="Choose an organization to view its settings."
                />
            )}
        </PageContainer>
    );
}
