import { OrdersLoading } from "@/components/commerce/orders/orders-states";
import { PageContainer } from "@/components/shared/page-container";

/**
 * The Orders list while it arrives (B7): its heading, the tabs without
 * counts, the search and rows the shape of the ones on their way — a
 * loading read, never an empty one.
 */
export default function Loading() {
    return (
        <PageContainer width="full">
            <OrdersLoading />
        </PageContainer>
    );
}
