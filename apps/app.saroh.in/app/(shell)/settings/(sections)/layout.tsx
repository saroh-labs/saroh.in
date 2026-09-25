import { SettingsTabs } from "@/components/settings/settings-tabs";
import { settingsPagesFor } from "@/components/shared/nav-items";
import { listModules } from "@/lib/modules/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listCommsProviders } from "@/lib/providers/service";
import { emailAttention, providersTabNote } from "@/lib/settings/ready";

/**
 * Settings, one screen ("Saroh Settings" design): the tabs on Paper to the
 * left, headed "Settings", and the tab's page to the right, each page its own
 * `<main>` (`SettingsPanel`).
 *
 * No breadcrumb and no title band (2026-09-25): the rail's Settings row and
 * the tabs' own heading say where you are. From 760px the screen fills the
 * window below the top bar and only the page scrolls, so the tabs stay in
 * reach however long a page runs. On a phone the tabs are a row above the page and
 * the page scrolls as any other does.
 *
 * The tabs are the pages this person may open, judged by the same actions the
 * rail's Settings row checks. A page they may not open is left off the list
 * rather than shown and refused.
 *
 * When email needs a person, the Providers tab says so in place of its line
 * ("Needs you: email is disconnected"), so it is seen from any tab. Asked only
 * of someone who may manage messaging, and best-effort: a failed read drops
 * the line, never the screen.
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
    const mayMessaging = org?.actions
        ? org.actions.includes("comms:manage")
        : org?.role === "OWNER" || org?.role === "ADMIN";
    let providersNote: string | null = null;
    if (mayMessaging && pages.some((p) => p.href === "/settings/providers")) {
        const [modules, messaging] = await Promise.all([
            listModules().catch(() => null),
            listCommsProviders().catch(() => null),
        ]);
        providersNote = providersTabNote(emailAttention(modules, messaging));
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col min-[760px]:h-[calc(100dvh-61px)] min-[760px]:flex-none">
            <div className="flex min-h-0 flex-1 flex-col min-[760px]:flex-row">
                {pages.length > 0 ? (
                    <SettingsTabs
                        hrefs={pages.map((page) => page.href)}
                        notes={
                            providersNote
                                ? { "/settings/providers": providersNote }
                                : undefined
                        }
                    />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col min-[760px]:overflow-y-auto min-[760px]:overscroll-contain">
                    {children}
                </div>
            </div>
        </div>
    );
}
