import { SettingsLoading } from "@/components/settings/page/settings-loading";

/** The same as the tab draws while its read is on the way (`BillingContainer`). */
export default function Loading() {
    return <SettingsLoading title="Plan and billing" rows={4} />;
}
