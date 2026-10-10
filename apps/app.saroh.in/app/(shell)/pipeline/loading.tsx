import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Pipeline"]}
            title="Pipeline"
            label="Loading the pipeline"
        />
    );
}
