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
            <div className="px-4 py-[60px] sm:px-[22px]">{children}</div>
        </main>
    );
}

/** The "‹ Products / Product" bar every whole-page state sits under. */
export function ProductPageBar() {
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            <Link
                href="/commerce/products"
                className="flex items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[12.5px] text-neutral-700 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:min-h-11 dark:text-muted-foreground"
            >
                <span aria-hidden>‹</span> Products
            </Link>
            <span aria-hidden className="text-[15px] text-muted-foreground">
                /
            </span>
            <span className="text-[13.5px] font-semibold">Product</span>
        </div>
    );
}
