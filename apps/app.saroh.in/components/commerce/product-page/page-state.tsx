import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The product page's whole-page states (#522): couldn't load, not here,
 * locked. Each is the app's own named state (`@saroh/ui/data-state` and
 * `NotFound`), drawn under the "‹ Products" bar so the person still knows
 * where they are. This is only the frame they sit in.
 */
export function ProductPageFrame({ children }: { children: ReactNode }) {
    return (
        <main className="w-full">
            <ProductPageBar />
            <div className="px-4 pb-[60px] sm:px-[22px]">{children}</div>
        </main>
    );
}

/**
 * "Sell › Products", and "Product" as the title: the page header every
 * whole-page state sits under, in the product page's own gutter.
 */
export function ProductPageBar() {
    return (
        <div className="px-4 pt-5 sm:px-[22px]">
            <PageHeader
                breadcrumb={[
                    "Sell",
                    <Link key="list" href="/commerce/products">
                        Products
                    </Link>,
                ]}
                title="Product"
            />
        </div>
    );
}
