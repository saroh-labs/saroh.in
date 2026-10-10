"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QuickSheet } from "@/components/commerce/product-page/quick-sheet";
import { CheckRow } from "@/components/shared/check-row";
import { runAction } from "@/lib/api/run-action";
import { saveProductCollections } from "@/lib/collections/actions";
import type { MembershipRow } from "@/lib/collections/rules";
import { membershipRows, pickedIds, sameList } from "@/lib/collections/rules";
import type { CollectionSummary } from "@/lib/collections/service";
import type { ProductPlacement } from "@/lib/products/overview-rules";

/**
 * The product page's "Edit collections" (#524), after the design's sheet:
 * every collection, ticked where the product is in it. A hand-picked one
 * takes it or lets it go; an automatic one is locked and says why — it
 * follows the product's category. Saving puts it in exactly the ticked
 * hand-picked ones; the API refuses a full one and says so. Undo puts the
 * hand-picked set back as it was.
 */
export function ProductCollectionsSheet({
    open,
    onOpenChange,
    productId,
    productName,
    all,
    placement,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: string;
    productName: string;
    all: CollectionSummary[];
    placement: ProductPlacement;
}) {
    const router = useRouter();
    const start = membershipRows(all, placement);
    const [rows, setRows] = useState<MembershipRow[]>(start);
    const [saving, setSaving] = useState(false);
    // Each opening starts from what is saved (adjusted while rendering).
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (open) setRows(start);
    }
    const dirty = !sameList(pickedIds(start, all), pickedIds(rows, all));

    async function save() {
        // The hand-picked set as it was, for Undo to put back.
        const previous = pickedIds(start, all);
        const res = await runAction(
            () => saveProductCollections(productId, pickedIds(rows, all)),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            showError("Its collections weren't saved.", res.error);
            return;
        }
        onOpenChange(false);
        router.refresh();
        showUndo("Collections saved.", async () => {
            const undo = await saveProductCollections(productId, previous);
            router.refresh();
            return undo;
        });
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={onOpenChange}
            productName={productName}
            title="Edit collections"
            moreLink={{
                href: "/commerce/products?tab=collections",
                label: "All collections",
            }}
            dirty={dirty}
            saving={saving}
            onSave={save}
        >
            {rows.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    There are no collections yet. Make one from Products ›
                    Collections.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((r) => (
                        <CheckRow
                            key={r.id}
                            checked={r.on}
                            disabled={r.locked}
                            onChange={(on) =>
                                setRows((had) =>
                                    had.map((x) =>
                                        x.id === r.id ? { ...x, on } : x,
                                    ),
                                )
                            }
                            className={cn(
                                "w-full items-start gap-2.5 rounded-[9px] border border-border px-3 py-2.5 text-foreground",
                                r.locked
                                    ? "bg-disabled"
                                    : "bg-card hover:bg-muted",
                            )}
                            boxClassName="mt-px"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-semibold">
                                    {r.name}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                                    {r.note}
                                </span>
                            </span>
                        </CheckRow>
                    ))}
                </div>
            )}
            <p className="mt-2.5 text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                {placement.website.showsProducts
                    ? "Website pages show collections, so this also decides where it appears on the site."
                    : "The website doesn't show products yet."}
            </p>
        </QuickSheet>
    );
}
