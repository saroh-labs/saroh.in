import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/shared/access-denied";
import { settingsPagesFor } from "@/components/shared/nav-items";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * `/settings` opens the first settings tab this person may open (2026-09-25):
 * Business for an owner, Your profile for someone who reaches nothing of the
 * business's. The tabs are the screen now, so the index of cards that used
 * to be here would only have been a step before them.
 */
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
    await requireSession();
    const org = await resolveActiveOrganization();
    const first = settingsPagesFor({
        role: org?.role ?? null,
        actions: org?.actions ?? null,
    }).at(0);
    if (first) redirect(first.href);

    return (
        <PageContainer>
            <AccessDenied description="Settings are limited to certain roles in this business. An owner or admin can change what you can reach." />
        </PageContainer>
    );
}
