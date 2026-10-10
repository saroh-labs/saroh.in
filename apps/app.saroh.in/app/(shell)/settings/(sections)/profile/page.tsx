import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { YourProfile } from "@/components/settings/your-profile";
import { env } from "@/env";
import { accountSettingsUrl } from "@/lib/accounts";
import { getAlertPreferences } from "@/lib/notifications/service";
import { requireSession } from "@/lib/session";
import { usageSharingOrNull } from "@/lib/usage-sharing/service";
import { replaySwitchedOn, sharesUsageNow } from "@/lib/usage-sharing/sharing";

/**
 * Settings → Your profile: your login and the alerts you get. For everyone
 * signed in, whatever their role — it is about them, not the business.
 * Your identity is read from the session and changed on accounts.saroh.in;
 * your alerts are your own in this business ("Only for you — your team
 * picks their own", F14). A failed alerts read throws to this tab's
 * boundary rather than showing choices nobody made.
 *
 * "Help improve Saroh" (DEC-125) is here too, only where session recording
 * is switched on for this environment: a switch that did nothing would not
 * be true. It is left out when the choice couldn't be read, rather than
 * shown as a choice nobody made.
 */
export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
    const { user } = await requireSession();
    const recordingOn = replaySwitchedOn({
        key: env.NEXT_PUBLIC_POSTHOG_KEY,
        replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    });
    const [alerts, usageSharing] = await Promise.all([
        getAlertPreferences(),
        recordingOn ? usageSharingOrNull() : null,
    ]);

    return (
        <SettingsPanel header={<SettingsPanelHeader title="Your profile" />}>
            <YourProfile
                name={user.name?.trim() ?? ""}
                email={user.email}
                accountUrl={accountSettingsUrl}
                alerts={alerts}
                sharesUsage={
                    usageSharing ? sharesUsageNow(usageSharing) : undefined
                }
            />
        </SettingsPanel>
    );
}
