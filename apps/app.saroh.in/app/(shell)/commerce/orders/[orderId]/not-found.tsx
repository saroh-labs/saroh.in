import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { SearchX } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/**
 * An order this business does not have — the design's "No order #9999":
 * another business's order, or a mistyped link. Said plainly, with a way back.
 */
export default function OrderNotFound() {
    return (
        <PageContainer>
            <EmptyState
                outline="solid"
                icon={<SearchX />}
                title="No order here"
                description="It may be in another business, or the number is mistyped."
                action={
                    <Button asChild variant="outline">
                        <Link href="/commerce/orders">Back to orders</Link>
                    </Button>
                }
            />
        </PageContainer>
    );
}
