"use client";

import { Button } from "@saroh/ui/button";
import { Pencil } from "lucide-react";
import { useState } from "react";

import type { ProductDetail } from "@/lib/products/service";

import { DescriptionSheet } from "./sheets/description-sheet";
import { DetailsSheet } from "./sheets/details-sheet";
import { PhotosSheet } from "./sheets/photos-sheet";

/** The stock sheet has its own button (`StockSheetButton`, #523). */
export type SheetKind = "details" | "description" | "photos";

/**
 * An "Edit" beside a panel of the product page. It opens that panel's quick
 * sheet over the page rather than leaving for the editor — the same split as
 * the editor's sections, so a small fix stays a small act.
 */
export function SheetButton({
    kind,
    label,
    ariaLabel,
    product,
    storeId,
    categories = [],
}: {
    kind: SheetKind;
    label: string;
    /** What it edits, for a screen reader when the label is just "Edit". */
    ariaLabel?: string;
    product: ProductDetail;
    storeId: string;
    categories?: { id: string; name: string }[];
}) {
    const [open, setOpen] = useState(false);
    const common = { open, onOpenChange: setOpen, product, storeId };
    return (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(true)}
                aria-label={ariaLabel ?? label}
                className="h-[26px] gap-[5px] rounded-[7px] px-[9px] text-[12px] coarse:h-11"
            >
                <Pencil className="size-3" strokeWidth={2} aria-hidden />
                {label}
            </Button>
            {kind === "details" ? (
                <DetailsSheet {...common} categories={categories} />
            ) : null}
            {kind === "description" ? <DescriptionSheet {...common} /> : null}
            {kind === "photos" ? <PhotosSheet {...common} /> : null}
        </>
    );
}
