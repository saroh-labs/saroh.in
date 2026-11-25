import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Your profile: your login and the alerts you get. For everyone
 * signed in, whatever their role — it is about them, not the business.
 * Your identity is read from the session and changed on accounts.saroh.in;
 * your alerts are your own in this business ("Only for you — your team
 * picks their own", F14). A failed alerts read is the tab's failed state
 * rather than choices nobody made.
 *
 * It ends with "Leave {business}" (UX audit, 10 Oct 2026): every role opens
 * this page, so it is where everyone finds the way out. "Help improve
 * Saroh" (DEC-125) is here too, only where session recording is switched
 * on for this environment.
 *
 * On React Query (DEC-259): the read (`lib/settings/access.ts`) loads in
 * the browser, drawn by `SettingsTabScreen`.
 */
export const metadata = { title: "Your profile · Settings" };

export default async function ProfilePage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    return (
        <SettingsTabScreen tab="/settings/profile" kind={org?.kind ?? null} />
    );
}
