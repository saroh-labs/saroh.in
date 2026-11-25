import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="rows"
            width="full"
            breadcrumb={["Notifications"]}
            title="Notifications"
            label="Loading notifications"
        />
    );
}
