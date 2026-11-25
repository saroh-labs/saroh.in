import { SettingsLoading } from "@/components/settings/page/settings-loading";

export default function Loading() {
    return (
        <SettingsLoading
            title="Your data"
            description="Everything this business keeps in Saroh is yours to take away, whenever you like."
            rows={3}
        />
    );
}
