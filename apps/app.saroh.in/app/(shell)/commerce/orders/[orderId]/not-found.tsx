import { NotFound } from "@saroh/ui/not-found";

import { PageContainer } from "@/components/shared/page-container";

/**
 * An order this business does not have — the design's "No order #9999":
 * another business's order, or a mistyped link. Said plainly, with a way back.
 */
export default function OrderNotFound() {
    return (
        <PageContainer>
            <NotFound
                variant="card"
                title="No order here"
                description="It may have been deleted, or it belongs to another business. Check the number if you typed it."
                primary={{ href: "/commerce/orders", label: "Back to orders" }}
            />
        </PageContainer>
    );
}
