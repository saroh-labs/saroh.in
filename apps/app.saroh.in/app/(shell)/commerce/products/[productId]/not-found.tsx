import { SearchX } from "lucide-react";
import Link from "next/link";

import {
    ProductPageState,
    stateAction,
} from "@/components/commerce/product-page/page-state";

/** A product link that no longer leads anywhere — said plainly, with a way back. */
export default function ProductNotFound() {
    return (
        <ProductPageState
            icon={SearchX}
            title="This product isn't here"
            description="It may have been deleted, or the link is out of date. Deleted products leave their past orders untouched."
        >
            <Link href="/commerce/products" className={stateAction("primary")}>
                Back to Products
            </Link>
        </ProductPageState>
    );
}
