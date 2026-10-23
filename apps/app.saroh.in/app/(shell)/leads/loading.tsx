import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Leads"]}
            title="Leads"
            label="Loading leads"
        />
    );
}
