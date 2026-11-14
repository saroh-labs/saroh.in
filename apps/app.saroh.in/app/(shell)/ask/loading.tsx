import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Ask AI"]}
            title="Ask AI"
            label="Loading Ask AI"
        />
    );
}
