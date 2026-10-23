import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Website"]}
            title="Website"
            label="Loading your website"
        />
    );
}
