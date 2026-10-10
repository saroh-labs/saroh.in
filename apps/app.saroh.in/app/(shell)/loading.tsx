import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="dashboard"
            width="full"
            breadcrumb={["Home"]}
            label="Loading Home"
        />
    );
}
