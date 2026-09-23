import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { OrderReadLine } from "@/lib/orders/read";
import { productHref } from "@/lib/products/links";

import { FOCUS, PanelTitle } from "./parts";

/**
 * What was bought: a photo, the name (to its product), variant and SKU, the
 * allergy tag where a customer's note matches the line, and — only with a
 * money read — the price and the line's total. A Member sees how many.
 */
export function OrderItems({
    lines,
    storeId,
    clashes,
    money,
}: {
    lines: OrderReadLine[];
    storeId: string;
    /** Per line id, from `allergyCheck`. */
    clashes: Record<string, string>;
    /** Formats a major-unit amount, or null for a role without money. */
    money: ((amount: number) => string) | null;
}) {
    const units = lines.reduce((n, l) => n + l.quantity, 0);
    return (
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-baseline gap-2 px-4 pb-1 pt-[13px]">
                <PanelTitle className="flex-1">Items</PanelTitle>
                <span className="text-[12px] text-muted-foreground">
                    {units === 1 ? "1 item" : `${units} items`}
                </span>
            </div>
            <ul>
                {lines.map((l) => {
                    const sub = [l.variantTitle, l.sku].filter(Boolean);
                    const price =
                        l.price !== undefined ? Number(l.price) : null;
                    return (
                        <li
                            key={l.id}
                            className="flex items-center gap-3 border-t border-foreground/10 px-4 py-2.5"
                        >
                            {l.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist
                                <img
                                    src={l.imageUrl}
                                    alt=""
                                    className="size-11 shrink-0 rounded-lg bg-muted object-cover"
                                />
                            ) : (
                                <span
                                    aria-hidden
                                    className="size-11 shrink-0 rounded-lg bg-muted"
                                />
                            )}
                            <div className="min-w-0 flex-1">
                                <div>
                                    {l.name ? (
                                        <Link
                                            href={productHref(
                                                storeId,
                                                l.productId,
                                            )}
                                            className={cn(
                                                FOCUS,
                                                "text-[13.5px] font-semibold text-foreground underline-offset-4 hover:underline",
                                            )}
                                        >
                                            {l.name}
                                        </Link>
                                    ) : (
                                        <span className="text-[13.5px] font-semibold text-muted-foreground">
                                            A product that no longer exists
                                        </span>
                                    )}
                                </div>
                                {sub.length > 0 || l.refundedQuantity > 0 ? (
                                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                                        {sub.join(" · ")}
                                        {l.refundedQuantity > 0 ? (
                                            <span className="text-destructive-subtle-foreground">
                                                {sub.length ? " · " : ""}
                                                {l.refundedQuantity ===
                                                l.quantity
                                                    ? "Refunded"
                                                    : `${l.refundedQuantity} refunded`}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                                {clashes[l.id] ? (
                                    <div className="mt-[5px] inline-block rounded-full bg-destructive-subtle px-2 py-0.5 text-[11.5px] font-bold text-destructive-subtle-foreground">
                                        {clashes[l.id]}
                                    </div>
                                ) : null}
                            </div>
                            <span className="whitespace-nowrap text-[12.5px] tabular-nums text-muted-foreground">
                                {money && price !== null
                                    ? `${l.quantity} × ${money(price)}`
                                    : `× ${l.quantity}`}
                            </span>
                            {money && price !== null ? (
                                <span className="min-w-16 text-right text-[13.5px] font-semibold tabular-nums">
                                    {money(price * l.quantity)}
                                </span>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/**
 * "Priya is allergic to sesame" above Items: the customer's note, matched by
 * allergen id to what a line contains or may contain. When the notes could
 * not be read it says so — silence would read as "no allergy".
 */
export function AllergyBanner({
    first,
    hits,
    named,
    unchecked,
}: {
    first: string;
    hits: string;
    named: string[];
    /** The customer's notes could not be read. */
    unchecked: boolean;
}) {
    if (unchecked) {
        return (
            <div
                role="status"
                className="rounded-xl border border-border bg-muted px-4 py-3"
            >
                <div className="text-[13.5px] font-bold">
                    Couldn&apos;t check {first}&apos;s allergy notes
                </div>
                <p className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground">
                    Their notes didn&apos;t load, so nothing here was checked
                    against them. Ask {first} before it goes out.
                </p>
            </div>
        );
    }
    if (named.length === 0) return null;
    return (
        <div
            role="alert"
            className="rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-3"
        >
            <div className="text-[13.5px] font-bold text-destructive-subtle-foreground">
                {first} is allergic to {hits}
            </div>
            <p className="mt-[3px] text-pretty text-[12.5px] leading-[1.5] text-neutral-700 dark:text-muted-foreground">
                {named.join("; ")}. Check with {first} before it goes out.
            </p>
        </div>
    );
}
