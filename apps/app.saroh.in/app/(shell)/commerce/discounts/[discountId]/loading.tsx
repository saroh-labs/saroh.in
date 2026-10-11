import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={["Sell", "Discount codes"]}
            label="Loading the code"
        />
    );
}
