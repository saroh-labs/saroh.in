import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { SearchX } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/** A product link that no longer leads anywhere — said plainly, with a way back. */
export default function ProductNotFound() {
    return (
        <PageContainer>
            <EmptyState
                outline="solid"
                icon={<SearchX />}
                title="This product isn't here"
                description="It may have been deleted, or the link is out of date. Deleting a product leaves its past orders untouched."
                action={
                    <Button asChild variant="outline">
                        <Link href="/commerce/products">Back to Products</Link>
                    </Button>
                }
            />
        </PageContainer>
    );
}
