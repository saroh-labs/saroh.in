import { PageContainer } from "@/components/shared/page-container";
import { SubscriptionsSkeleton } from "@/components/subscriptions/subscriptions-skeleton";

export default function Loading() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <SubscriptionsSkeleton here="Subscriptions" />
        </PageContainer>
    );
}
