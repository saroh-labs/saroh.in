import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Sell", "Stock"]}
            title="Stock"
            label="Loading stock"
        />
    );
}
