import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Contacts"]}
            title="Contacts"
            label="Loading contacts"
        />
    );
}
