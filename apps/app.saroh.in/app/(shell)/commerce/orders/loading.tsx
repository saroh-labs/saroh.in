import { PageLoading } from "@/components/shared/page/page-loading";
import { ORDERS_TABS } from "@/lib/orders/list-query";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Sell", "Orders"]}
            title="Orders"
            label="Loading orders"
            tabs={ORDERS_TABS.map((t) => t.label)}
        />
    );
}
