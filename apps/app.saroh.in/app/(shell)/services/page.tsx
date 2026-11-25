import { PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";

import { ServicesContainer } from "@/components/services/list/services-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { knownRoleName } from "@/lib/organizations/role-name";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { canReadServices } from "@/lib/services/access";
import { readCanEditServices } from "@/lib/services/editor-data";
import { requireSession } from "@/lib/session";

/**
 * Bookings › Services (U16, E2; U15, #1031): what people can book.
 *
 * On React Query (DEC-259), loaded in the browser: the page awaits only
 * its gates, `service:read` (a role without it is told so, calmly, never
 * shown a failure) and `service:write` (what the screen offers). The
 * services, who takes each, how each is used, the booking page, "Also
 * sell" and the GST notice are `ServicesContainer`'s one read
 * (`/api/services`), drawn into the real header at once.
 */
export const metadata = { title: "Services" };

export default async function ServicesPage() {
    await requireSession();
    const [organization, canEdit] = await Promise.all([
        resolveActiveOrganization(),
        readCanEditServices(),
    ]);

    if (!canReadServices(organization)) {
        return (
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Bookings", "Services"]}
                    title="Services"
                />
                <div>
                    <PermissionDeniedState
                        {...whoCanChange({
                            thing: "Services",
                            business: organization?.name,
                            role: organization
                                ? knownRoleName(organization)
                                : null,
                        })}
                    />
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer width="full">
            <ServicesContainer canEdit={canEdit} />
        </PageContainer>
    );
}
