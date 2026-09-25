import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { settingsPagesFor } from "@/components/shared/nav-items";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * Settings, one screen ("Saroh Settings" design): a band with the breadcrumb
 * and the title across the top, then the tabs on Paper to the left and the
 * tab's page to the right, each page its own `<main>` (`SettingsPanel`).
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
        <div className="flex min-w-0 flex-1 flex-col">
            <SettingsHeader />
            <div className="flex min-h-0 flex-1 flex-col min-[760px]:flex-row">
                {pages.length > 0 ? (
                    <SettingsTabs hrefs={pages.map((page) => page.href)} />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col">{children}</div>
            </div>
        </div>
    );
}
