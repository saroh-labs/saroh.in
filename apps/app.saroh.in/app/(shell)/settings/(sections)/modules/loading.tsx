import { SettingsLoading } from "@/components/settings/page/settings-loading";
import { MODULES_SAYS } from "@/components/settings/tabs/modules-tab";

/** The same as the tab draws while its read is on the way (`ModulesContainer`). */
export default function Loading() {
    return (
        <SettingsLoading title="Modules" description={MODULES_SAYS} rows={6} />
    );
}
