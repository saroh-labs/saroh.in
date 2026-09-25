import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";

import { formatMoneyMajor } from "@/lib/format/money";
import { mediaCounter } from "@/lib/products/editor-sections";
import type { EditorSection } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";

/**
 * "Before it goes on the shop" — a draft's checklist. Nothing here is
 * required to publish; these are what a customer will look for, each with
 * the one section of the editor that fills it.
 */
export function DraftChecklist({
    overview,
    edit,
    canWrite,
}: {
    overview: ProductOverview;
    edit: (section?: EditorSection) => string;
    canWrite: boolean;
}) {
    const { product, stock } = overview;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;
    const tracked = stock.mode === "variant" || stock.product !== null;
    const rows: {
        done: boolean;
        title: string;
        sub: string;
        cta?: { label: string; section: EditorSection };
    }[] = [
        {
            done: true,
            title: "Name and price",
            sub: `${product.name} · ${money(product.price)}`,
        },
        {
            done: product.images.length > 0,
            title: "Photos",
            sub:
                product.images.length > 0
                    ? `${mediaCounter(product.images)} — the first photo is the cover.`
                    : "No photos yet — up to 15 photos and 3 videos.",
            cta: { label: "Add photos", section: "photos" },
        },
        {
            done: Boolean(product.description),
            title: "Description",
            sub: product.description ? "Written." : "Nothing written yet.",
            cta: { label: "Write it", section: "description" },
        },
        {
            done: product.howToUse !== null || product.materials !== null,
            title: "How to use and what it's made of",
            sub:
                product.howToUse !== null || product.materials !== null
                    ? "Set."
                    : "Not set. The shop says nothing rather than guessing.",
            cta: { label: "Add", section: "details" },
        },
        {
            done: tracked,
            title: "Stock",
            sub: tracked
                ? `${stock.totals.onHand} on hand.`
                : "No stock count yet.",
            cta: { label: "Add stock", section: "stock" },
        },
        {
            done: product.variants.length > 0,
            title: "Variants",
            sub:
                product.variants.length > 0
                    ? `${product.variants.length} — ${product.variants.map((v) => v.title).join(", ")}.`
                    : `Optional. Sold as itself at ${money(product.price)} until you add sizes or shades.`,
            cta: { label: "Add variants", section: "variants" },
        },
    ];

    return (
        <Card className="px-5 py-4">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.015em]">
                Before it goes on the shop
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
                A draft — only the team can see it. Nothing here is required to
                publish; these are what customers will look for.
            </p>
            <ul className="mt-3 divide-y divide-border">
                {rows.map((row) => (
                    <li
                        key={row.title}
                        className="flex flex-wrap items-center gap-3 py-2.5"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "grid size-[22px] shrink-0 place-items-center rounded-full",
                                row.done
                                    ? "bg-success-subtle text-success-subtle-foreground"
                                    : "border-[1.5px] border-dashed border-border-strong",
                            )}
                        >
                            {row.done ? <Check className="size-3.5" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-medium">
                                {row.title}
                                <span className="sr-only">
                                    {row.done ? " — done" : " — to do"}
                                </span>
                            </p>
                            <p className="text-[12.5px] text-muted-foreground">
                                {row.sub}
                            </p>
                        </div>
                        {!row.done && row.cta && canWrite ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={edit(row.cta.section)}>
                                    {row.cta.label}
                                </Link>
                            </Button>
                        ) : null}
                    </li>
                ))}
            </ul>
        </Card>
    );
}
