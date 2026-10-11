import { NotFound } from "@saroh/ui/not-found";

import { ProductPageFrame } from "@/components/commerce/product-page/page-state";

export const metadata = { title: "Product not found" };

/** A product link that no longer leads anywhere — said plainly, with a way back. */
export default function ProductNotFound() {
    return (
        <ProductPageFrame>
            <NotFound
                variant="card"
                title="Product not found"
                description="It may have been deleted, or the link is out of date. Deleted products leave their past orders untouched."
                primary={{
                    href: "/commerce/products",
                    label: "Back to Products",
                }}
            />
        </ProductPageFrame>
    );
}
