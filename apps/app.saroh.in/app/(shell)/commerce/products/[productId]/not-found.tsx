import { NotFound } from "@saroh/ui/not-found";

import { ProductPageBar } from "@/components/commerce/product-page/page-state";

/** A product link that no longer leads anywhere — said plainly, with a way back. */
export default function ProductNotFound() {
    return (
        <main className="w-full">
            <ProductPageBar />
            <div className="px-4 py-[60px] sm:px-[22px]">
                <NotFound
                    variant="card"
                    title="This product isn't here"
                    description="It may have been deleted, or the link is out of date. Deleted products leave their past orders untouched."
                    primary={{
                        href: "/commerce/products",
                        label: "Back to Products",
                    }}
                />
            </div>
        </main>
    );
}
