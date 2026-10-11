import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="settings"
            width="default"
            breadcrumb={["Settings"]}
            title="Settings"
            label="Loading Settings"
        />
    );
}
