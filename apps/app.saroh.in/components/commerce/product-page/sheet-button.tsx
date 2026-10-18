"use client";

import type { ButtonProps } from "@saroh/ui/button";
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
 * A button on the product page that opens one of its quick sheets over the
 * page rather than leaving for the editor — the same split as the editor's
 * sections, so a small fix stays a small act and is finished where it was
 * started (owner, 10 Oct). The panels' "Edit", the draft checklist's "Add
 * photos" and the Customer view's notes all open their sheet through this.
 */
export function SheetButton({
    kind,
    label,
    ariaLabel,
    product,
    storeId,
    categories = [],
    variant = "outline",
    size = "xs",
    icon = true,
    className = "gap-[5px]",
}: {
    kind: SheetKind;
    label: string;
    /** What it edits, for a screen reader when the label is just "Edit". */
    ariaLabel?: string;
    product: ProductDetail;
    storeId: string;
    categories?: { id: string; name: string }[];
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    /** The pencil before the label; off for a checklist's "Add photos". */
    icon?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const common = { open, onOpenChange: setOpen, product, storeId };
    return (
        <>
            <Button
                size={size}
                type="button"
                variant={variant}
                onClick={() => setOpen(true)}
                aria-label={ariaLabel ?? label}
                className={className}
            >
                {icon ? <Pencil className="size-3" aria-hidden /> : null}
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
