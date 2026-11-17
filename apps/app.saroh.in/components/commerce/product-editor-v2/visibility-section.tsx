"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { Check, ChevronDown, Clock, Globe } from "lucide-react";
import { useState } from "react";

import { patchProduct } from "@/lib/products/actions";
import { visibilityLine } from "@/lib/products/overview-words";
import type { ProductDetail, ProductStatus } from "@/lib/products/service";

import { PRODUCT_STATUS_WORD } from "@/lib/products/status-word";
import { Notice } from "@saroh/ui/notice";
import { useEditor, useSection } from "./editor-state";
import { SectionCard } from "./section-card";

const STATUSES: { value: ProductStatus; label: string; note: string }[] = [
    {
        value: "DRAFT",
        label: PRODUCT_STATUS_WORD.DRAFT,
        note: "Only the team can see it.",
    },
    {
        value: "PUBLISHED",
        label: PRODUCT_STATUS_WORD.PUBLISHED,
        note: "Customers can buy it.",
    },
    {
        value: "ARCHIVED",
        label: PRODUCT_STATUS_WORD.ARCHIVED,
        note: "No longer sold. Its orders keep their record.",
    },
];

const DOT: Record<ProductStatus, string> = {
    PUBLISHED: "bg-success",
    DRAFT: "bg-muted-foreground/60",
    ARCHIVED: "bg-foreground",
};

const label = (s: ProductStatus) =>
    STATUSES.find((x) => x.value === s)?.label ?? s;

/**
 * Who can see it. The header's pill is a fact about what customers see, so
 * it follows the saved status; this shows the one chosen, and until it is
 * saved the bar says what saving will do — Publish, Archive, Sell again
 * (or back to a draft) — on a button named for exactly that.
 */
export function VisibilitySection({
    product,
    storeId,
    value,
    onChange,
    shopLive = null,
    paused = false,
}: {
    product: ProductDetail | null;
    storeId: string;
    /** Whether the online shop is live; null when not known. */
    shopLive?: boolean | null;
    /** Paused by the plan (#800). */
    paused?: boolean;
    /** Creating keeps the choice in the shell: it names the create button. */
    value?: ProductStatus;
    onChange?: (status: ProductStatus) => void;
}) {
    const { mode, canWrite, sayError } = useEditor();
    const creating = mode === "create";
    const saved: ProductStatus = product?.status ?? "DRAFT";
    const [own, setOwn] = useState<ProductStatus>(saved);
    const [loadedFor, setLoadedFor] = useState(saved);
    if (loadedFor !== saved) {
        // Saved elsewhere (or just now): the saved status is the new start.
        setLoadedFor(saved);
        setOwn(saved);
    }
    const status = creating ? (value ?? "DRAFT") : own;
    const set = creating ? (s: ProductStatus) => onChange?.(s) : setOwn;
    const dirty = !creating && status !== saved;
    // An archived product comes back with Sell again; a draft is published.
    const archived = saved === "ARCHIVED";
    const named = product?.name.trim() ?? "";
    const name = named === "" ? "It" : named;

    const pending = creating
        ? "Live puts it on sale as soon as it's created. Draft keeps it to the team."
        : status === "PUBLISHED"
          ? archived
              ? "Saving sells it again. Until then customers can't buy it."
              : "Saving publishes it, so customers can buy it."
          : status === "DRAFT"
            ? "Saving makes it a draft. Customers can't see it, and its link finds nothing."
            : "Saving archives it. It stops being sold, and its link stops opening.";

    useSection(
        "visibility",
        {
            dirty,
            problem: "",
            note: pending,
            // Publish · Archive · Sell again, as everywhere else.
            saveLabel:
                status === "PUBLISHED"
                    ? archived
                        ? "Sell again"
                        : "Publish"
                    : status === "DRAFT"
                      ? "Make it a draft"
                      : "Archive",
            discardLabel: `Keep it ${label(saved).toLowerCase()}`,
            savedMessage:
                status === "PUBLISHED"
                    ? `${name} is live.`
                    : status === "DRAFT"
                      ? `${name} is a draft. Only the team can see it.`
                      : `Archived ${named === "" ? "it" : named}.`,
        },
        {
            save: async () => {
                if (!product) return false;
                const res = await patchProduct(storeId, product.id, {
                    status,
                });
                if (!res.ok) {
                    sayError("visibility", res.error);
                    return false;
                }
                return true;
            },
            discard: () => setOwn(saved),
            collect: () => ({ status }),
        },
    );

    return (
        <SectionCard k="visibility" title="Visibility">
            {creating ? (
                <p
                    data-ph-unmask=""
                    className="mb-2.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground"
                >
                    Choose who can see it once it is created.
                </p>
            ) : null}
            <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={!canWrite}>
                    <button
                        type="button"
                        aria-label={`Status: ${label(status)}. Change it.`}
                        className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-border bg-card px-2.5 text-left text-[13px] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground coarse:h-11"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-2 shrink-0 rounded-full",
                                DOT[status],
                            )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                            {label(status)}
                        </span>
                        <ChevronDown
                            aria-hidden
                            className="size-[13px] text-muted-foreground"
                        />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-[196px] rounded-[10px] p-1.5"
                >
                    <DropdownMenuRadioGroup
                        value={status}
                        onValueChange={(s) => set(s as ProductStatus)}
                    >
                        {STATUSES.map((o) => (
                            <DropdownMenuRadioItem
                                key={o.value}
                                value={o.value}
                                className={cn(
                                    "items-start gap-[9px] rounded-[7px] py-2 pl-[9px] pr-[9px] [&>span:first-child]:hidden",
                                    o.value === status && "bg-muted/60",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mt-1 size-2 shrink-0 rounded-full",
                                        DOT[o.value],
                                    )}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[12.5px] font-medium">
                                        {o.label}
                                    </span>
                                    <span className="mt-px block text-[11px] leading-[1.4] text-muted-foreground">
                                        {o.note}
                                    </span>
                                </span>
                                {o.value === status ? (
                                    <Check aria-hidden className="size-3.5" />
                                ) : null}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {creating ? null : (
                // The product's one status sentence, as its page says it
                // (HPEditDesk), with the way to the shop while it is off.
                <p
                    data-ph-unmask=""
                    className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground"
                >
                    <Globe
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span>{visibilityLine(saved, shopLive, paused)}</span>
                    {shopLive === false && saved === "PUBLISHED" ? (
                        <TextLink href="/sites" className="font-semibold">
                            Set up your shop
                        </TextLink>
                    ) : null}
                </p>
            )}
            {creating ? (
                <Notice
                    tone={status === "PUBLISHED" ? "success" : "info"}
                    className="mt-2.5"
                    icon={<Clock />}
                >
                    {pending}
                </Notice>
            ) : null}
        </SectionCard>
    );
}
