import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Sell", "Discount codes"]}
            title="Discount codes"
            label="Loading discount codes"
        />
    );
}
