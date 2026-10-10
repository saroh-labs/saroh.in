import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { YourProfile } from "@/components/settings/your-profile";
import { accountSettingsUrl } from "@/lib/accounts";
import { getAlertPreferences } from "@/lib/notifications/service";
import { isOnlyOwner } from "@/lib/organizations/leave-business";
import { listMembers } from "@/lib/organizations/members";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Your profile: your login and the alerts you get. For everyone
 * signed in, whatever their role — it is about them, not the business.
 * Your identity is read from the session and changed on accounts.saroh.in;
 * your alerts are your own in this business ("Only for you — your team
 * picks their own", F14). A failed alerts read throws to this tab's
 * boundary rather than showing choices nobody made.
 *
 * It ends with "Leave {business}" (UX audit, 10 Oct 2026): every role opens
 * this page, so it is where everyone finds the way out. The roster is read
 * only by someone who may (`member:read`), to know whether they are the
 * only owner and which locations they come off. Unread, the button is
 * offered and the API decides.
 */
export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
    const { user } = await requireSession();
    const [alerts, org] = await Promise.all([
        getAlertPreferences(),
        resolveActiveOrganization(),
    ]);
    // An owner always reads the roster. Anyone else only with the
    // permission: a refused read would turn this page into a denial.
    const mayReadTeam =
        org !== null && (org.role === "OWNER" || permits(org, "member:read"));
    const roster = mayReadTeam ? await listMembers().catch(() => null) : null;
    const me = roster?.find((m) => m.isSelf);

    return (
        <SettingsPanel header={<SettingsPanelHeader title="Your profile" />}>
            <YourProfile
                name={user.name?.trim() ?? ""}
                email={user.email}
                accountUrl={accountSettingsUrl}
                alerts={alerts}
                leave={
                    org
                        ? {
                              business: org.name,
                              onlyOwner: isOnlyOwner(roster) === true,
                              locations: (me?.storefronts ?? []).map(
                                  (s) => s.name,
                              ),
                          }
                        : null
                }
            />
        </SettingsPanel>
    );
}
