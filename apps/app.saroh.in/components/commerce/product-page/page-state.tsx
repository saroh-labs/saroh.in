import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The product page's whole-page states (#522) — couldn't load, not here,
 * locked — as the design draws them: under the page's header, a dashed
 * card with a 28px mark, a 17px line and what to do next. Each says
 * something different, in words and shape, so none reads as another.
 */
export function ProductPageState({
    icon: Icon,
    title,
    description,
    role = "status",
    children,
}: {
    icon: LucideIcon;
    title: string;
    description: ReactNode;
    role?: "status" | "alert";
    children?: ReactNode;
}) {
    return (
        <main className="w-full">
            <ProductPageBar />
            <div className="px-4 pb-[60px] sm:px-[22px]">
                <div
                    role={role}
                    className="flex flex-col items-center gap-[9px] rounded-[12px] border border-dashed border-border-strong px-6 py-9 text-center"
                >
                    <Icon
                        aria-hidden
                        className="size-7 text-muted-foreground"
                        strokeWidth={1.8}
                    />
                    <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {title}
                    </h2>
                    <p className="max-w-[46ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                        {description}
                    </p>
                    {children ? (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                            {children}
                        </div>
                    ) : null}
                </div>
            </div>
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

/** A state's action: the ink one (38px) or the outline one (32px). */
export const STATE_ACTION = {
    primary:
        "inline-flex h-[38px] items-center rounded-[9px] bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary-hover coarse:min-h-11",
    outline:
        "inline-flex h-8 items-center rounded-[9px] border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted coarse:min-h-11",
} as const;

export function stateAction(
    kind: keyof typeof STATE_ACTION,
    className?: string,
) {
    return cn(
        STATE_ACTION[kind],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
    );
}
