import { cn } from "@saroh/ui/lib/utils";

import { initials } from "@/lib/products/catalogue";

/**
 * A product's tile: its cover photo, or its initials without one. The
 * design draws initials only; showing the photo is a deliberate difference
 * (#519) — a merchant finds a product by its picture faster than by two
 * letters. Decorative: the name is always beside it.
 */
export function ProductThumb({
    name,
    image,
    size = 30,
}: {
    name: string;
    image: string | null;
    size?: 30 | 52;
}) {
    const box =
        size === 30
            ? "size-[30px] rounded-[7px] text-[11px]"
            : "size-[52px] rounded-[10px] text-[15px]";
    if (image) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist
            <img
                src={image}
                alt=""
                aria-hidden
                className={cn("shrink-0 bg-muted object-cover", box)}
            />
        );
    }
    return (
        <span
            aria-hidden
            className={cn(
                "flex shrink-0 items-center justify-center bg-muted font-display font-semibold text-neutral-700 dark:text-foreground",
                box,
            )}
        >
            {initials(name)}
        </span>
    );
}
