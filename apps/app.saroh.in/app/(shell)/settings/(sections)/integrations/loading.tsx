import { SettingsLoading } from "@/components/settings/page/settings-loading";
import { INTEGRATIONS_SAYS } from "@/components/settings/tabs/providers-tab";

/** The same as the tab draws while its read is on the way (`ProvidersContainer`). */
export default function Loading() {
    return (
        <SettingsLoading
            title="Integrations"
            description={INTEGRATIONS_SAYS}
            rows={4}
        />
    );
}
