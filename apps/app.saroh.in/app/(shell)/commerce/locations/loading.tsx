import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="settings"
            width="full"
            breadcrumb={["Location"]}
            label="Loading the location"
        />
    );
}
