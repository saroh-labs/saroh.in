import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { YourProfile } from "@/components/settings/your-profile";
import { accountSettingsUrl } from "@/lib/accounts";
import {
    alertRows,
    getAlertPreferences,
} from "@/lib/notifications/preferences";
import { requireSession } from "@/lib/session";

/**
 * Settings → Your profile: your login and the alerts you get. For everyone
 * signed in, whatever their role — it is about them, not the business.
 * Your identity is read from the session and changed on accounts.saroh.in;
 * the alerts wait on the API (`lib/notifications/preferences.ts`).
 */
export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
    const { user } = await requireSession();
    const alerts = await getAlertPreferences();

    return (
        <SettingsPanel header={<SettingsPanelHeader title="Your profile" />}>
            <YourProfile
                name={user.name?.trim() ?? ""}
                email={user.email}
                accountUrl={accountSettingsUrl}
                alerts={alertRows(alerts)}
                alertsSaved={alerts.status === "ok"}
            />
        </SettingsPanel>
    );
}
