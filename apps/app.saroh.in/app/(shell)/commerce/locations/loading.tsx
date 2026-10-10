import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="settings"
            width="full"
            breadcrumb={["Sell", "Location"]}
            label="Loading the location"
        />
    );
}
