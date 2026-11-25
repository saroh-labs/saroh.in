import { SettingsLoading } from "@/components/settings/page/settings-loading";

export default function Loading() {
    return (
        <SettingsLoading
            title="Share"
            description="Ways to put your pages in front of customers, in your shop and on paper."
            width="full"
            rows={4}
        />
    );
}
