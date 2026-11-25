import { SettingsLoading } from "@/components/settings/page/settings-loading";
import { ACTIVITY_SAYS } from "@/lib/settings/queries";

export default function Loading() {
    return (
        <SettingsLoading
            title="Activity"
            description={ACTIVITY_SAYS}
            rows={6}
        />
    );
}
