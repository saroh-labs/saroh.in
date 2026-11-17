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
import {
    Archive,
    Copy,
    ExternalLink,
    Eye,
    MoreHorizontal,
    QrCode,
    Share2,
    Trash2,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
    refusedResult,
    showPlanRefusal,
} from "@/components/billing/plan-refusal";
import { deleteProduct } from "@/lib/products/actions";
import { productHref } from "@/lib/products/links";
import { duplicateListedProduct } from "@/lib/products/list-actions";
import type { ProductStatus } from "@/lib/products/service";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";

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
/**
 * One more entry of the ⋯ (HPProductDesk, HPProductPhone): the shop page
 * and the views (a phone's, where the website card isn't beside them), and
 * the QR code and Share, whose own buttons wait hidden in the header and
 * are pressed from here (`proxy`), so neither is redrawn.
 */
export interface MoreEntry {
    key: string;
    label: string;
    icon: "shop" | "eye" | "users" | "qr" | "share";
    href?: string;
    newTab?: boolean;
    /** `data-menu-proxy` of the hidden button this entry presses. */
    proxy?: string;
    /** Only on a phone: a desk has it on the website card. */
    phoneOnly?: boolean;
    /** Off, and why (the shop page isn't live). */
    note?: string;
}

const MORE_ICON = {
    shop: ExternalLink,
    eye: Eye,
    users: Users,
    qr: QrCode,
    share: Share2,
} as const;

/** Presses a hidden button, once the menu has closed. */
function press(proxy: string) {
    document
        .querySelector<HTMLElement>(`[data-menu-proxy="${proxy}"] button`)
        ?.click();
}

function MoreItem({
    entry,
    onProxy,
}: {
    entry: MoreEntry;
    /** Picked an entry that presses a hidden button. */
    onProxy: (proxy: string) => void;
}) {
    const Icon = MORE_ICON[entry.icon];
    const cls = entry.phoneOnly ? "sm:hidden" : undefined;
    if (entry.note) {
        return (
            <DropdownMenuItem disabled className={cn("items-start", cls)}>
                <Icon />
                <span className="flex flex-col gap-0.5">
                    <span data-ph-unmask="">{entry.label}</span>
                    <span className="text-pretty text-[12px] leading-[1.4] text-muted-foreground">
                        {entry.note}
                    </span>
                </span>
            </DropdownMenuItem>
        );
    }
    if (entry.proxy) {
        const proxy = entry.proxy;
        return (
            <DropdownMenuItem className={cls} onSelect={() => onProxy(proxy)}>
                <Icon />
                {entry.label}
            </DropdownMenuItem>
        );
    }
    return (
        <DropdownMenuItem asChild className={cls}>
            {entry.newTab ? (
                <a href={entry.href} target="_blank" rel="noopener noreferrer">
                    <Icon />
                    {entry.label}
                </a>
            ) : (
                <Link href={entry.href ?? "#"} scroll={false}>
                    <Icon />
                    {entry.label}
                </Link>
            )}
        </DropdownMenuItem>
    );
}

export function ProductActions({
    product,
    storeId,
    editHref,
    deleteFrom,
    more = [],
}: {
    product: { id: string; name: string; status: ProductStatus };
    storeId: string;
    editHref: string;
    /** "every location that sells it", or the one location's name. */
    deleteFrom: string;
    /** The shop page, the views, QR and Share, above Archive. */
    more?: readonly MoreEntry[];
}) {
    const router = useRouter();
    const { pending, setStatus } = useProductStatus(product);
    const [asking, setAsking] = useState(false);
    const [copying, setCopying] = useState(false);
    // QR or Share picked: pressed once the menu has closed, instead of
    // focus going back to the ⋯ (which would close QR's popover at once).
    const proxyPicked = useRef<string | null>(null);

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
                <DropdownMenuContent
                    align="end"
                    className="w-56"
                    onCloseAutoFocus={(e) => {
                        const proxy = proxyPicked.current;
                        if (!proxy) return;
                        proxyPicked.current = null;
                        e.preventDefault();
                        press(proxy);
                    }}
                >
                    {more.map((entry) => (
                        <MoreItem
                            key={entry.key}
                            entry={entry}
                            onProxy={(proxy) => {
                                proxyPicked.current = proxy;
                            }}
                        />
                    ))}
                    {more.some((e) => !e.phoneOnly) ? (
                        <DropdownMenuSeparator />
                    ) : more.length > 0 ? (
                        <DropdownMenuSeparator className="sm:hidden" />
                    ) : null}
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
