"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Archive, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    refusedResult,
    showPlanRefusal,
} from "@/components/billing/plan-refusal";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteProduct } from "@/lib/products/actions";
import { productHref } from "@/lib/products/links";
import { duplicateListedProduct } from "@/lib/products/list-actions";
import type { ProductStatus } from "@/lib/products/service";

import { useProductStatus } from "./use-product-status";

/**
 * The header's buttons, by the product's state (Products audit, 16 Oct
 * 2026): a draft's one thing is Publish, an archived one's is Sell
 * again — each at once, with Undo — and a live one's is Edit product.
 * Archive · Duplicate · Delete sit in the ⋯ menu; Delete asks first, as
 * the list's does. "Edit product" is the one way to the full editor.
 *
 * On a phone the row docks at the foot of the screen, above the tab bar,
 * so the header is the name and its state.
 */
export function ProductActions({
    product,
    storeId,
    editHref,
    deleteFrom,
}: {
    product: { id: string; name: string; status: ProductStatus };
    storeId: string;
    editHref: string;
    /** "every location that sells it", or the one location's name. */
    deleteFrom: string;
}) {
    const router = useRouter();
    const { pending, setStatus } = useProductStatus(product);
    const [asking, setAsking] = useState(false);
    const [copying, setCopying] = useState(false);

    async function duplicate() {
        setCopying(true);
        try {
            const res = await duplicateListedProduct(product.id, storeId);
            if (!res.ok) {
                if (res.plan) showPlanRefusal(res.plan);
                else showError("It couldn't be duplicated.", res.error);
                return;
            }
            showSuccess(`${res.data.name} is a draft. Stock starts at 0.`);
            router.push(productHref(res.data.storeId, res.data.id));
        } finally {
            setCopying(false);
        }
    }

    async function remove() {
        const res = await deleteProduct(product.id);
        if (!res.ok) return refusedResult(res, "It couldn't be deleted.");
        showSuccess("Product deleted.");
        router.push("/commerce/products");
    }

    const primary =
        product.status === "DRAFT" ? (
            <Button
                type="button"
                onClick={() => setStatus("PUBLISHED")}
                busy={pending}
                busyLabel="Publishing…"
            >
                Publish
            </Button>
        ) : product.status === "ARCHIVED" ? (
            <Button
                type="button"
                onClick={() => setStatus("PUBLISHED")}
                busy={pending}
                busyLabel="Putting it back…"
            >
                Sell again
            </Button>
        ) : null;

    return (
        <div
            data-product-actions=""
            className={cn(
                "flex flex-wrap items-center gap-2",
                // A phone: docked at the foot, above the tab bar.
                "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[var(--tab-bar-inset)] max-sm:z-30 max-sm:flex-nowrap max-sm:border-t max-sm:border-border max-sm:bg-card max-sm:px-4 max-sm:py-2.5 print:hidden",
            )}
        >
            {primary}
            <Button
                asChild
                variant={primary ? "outline" : "default"}
                className="max-sm:flex-1"
            >
                <Link href={editHref}>Edit product</Link>
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label={`More actions for ${product.name}`}
                        icon={<MoreHorizontal />}
                        variant="outline"
                        size="md"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {product.status === "PUBLISHED" ? (
                        <DropdownMenuItem
                            onSelect={() => setStatus("ARCHIVED")}
                        >
                            <Archive />
                            Archive
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                        disabled={copying}
                        onSelect={() => void duplicate()}
                    >
                        <Copy />
                        Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setAsking(true)}
                    >
                        <Trash2 />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                title={`Delete ${product.name}?`}
                description={`It is removed from ${deleteFrom} and from any collection it belongs to. Past orders keep their record. This cannot be undone.`}
                confirmLabel="Delete product"
                keepLabel="Keep product"
                onConfirm={remove}
            />
        </div>
    );
}

/**
 * Publish, where a draft's checklist ends: the same act as the header's,
 * with the same Undo.
 */
export function PublishButton({
    product,
    className,
}: {
    product: { id: string; name: string; status: ProductStatus };
    className?: string;
}) {
    const { pending, setStatus } = useProductStatus(product);
    return (
        <Button
            type="button"
            size="sm"
            onClick={() => setStatus("PUBLISHED")}
            busy={pending}
            busyLabel="Publishing…"
            className={className}
        >
            Publish
        </Button>
    );
}
