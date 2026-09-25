import { SettingsTabs } from "@/components/settings/settings-tabs";
import { settingsPagesFor } from "@/components/shared/nav-items";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * Settings, one screen (2026-09-25): the tabs on the left, the tab's page on
 * the right. Each page keeps its own container and width, so the tabs column
 * is padded to line up with the page's own top edge.
 *
 * The tabs are the pages this person may open, judged by the same actions the
 * rail's Settings row checks. A page they may not open is left off the list
 * rather than shown and refused.
 */
export default async function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const org = await resolveActiveOrganization();
    const pages = settingsPagesFor({
        role: org?.role ?? null,
        actions: org?.actions ?? null,
    });

    return (
        <div className="flex min-w-0 flex-1 flex-col min-[760px]:flex-row">
            {pages.length > 0 ? (
                <div className="px-4 pt-5 sm:px-[26px] min-[760px]:pr-0 min-[760px]:pt-8">
                    <SettingsTabs hrefs={pages.map((page) => page.href)} />
                </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
    );
}
