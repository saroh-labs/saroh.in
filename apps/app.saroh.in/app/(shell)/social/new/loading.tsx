import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Social", "New post"]}
            title="New post"
            label="Loading Create post"
        />
    );
}
