"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Check, ChevronDown, Clock } from "lucide-react";
import { useState } from "react";

import { patchProduct } from "@/lib/products/actions";
import type { ProductDetail, ProductStatus } from "@/lib/products/service";

import { useEditor, useSection } from "./editor-state";
import { SectionCard } from "./section-card";

const STATUSES: { value: ProductStatus; label: string; note: string }[] = [
    { value: "DRAFT", label: "Draft", note: "Only the team can see it." },
    { value: "PUBLISHED", label: "Published", note: "Customers can buy it." },
    {
        value: "ARCHIVED",
        label: "Archived",
        note: "Was sold, and is not any more.",
    },
];

const DOT: Record<ProductStatus, string> = {
    PUBLISHED: "bg-success",
    DRAFT: "bg-muted-foreground/60",
    ARCHIVED: "bg-brand",
};

const label = (s: ProductStatus) =>
    STATUSES.find((x) => x.value === s)?.label ?? s;

/**
 * Who can see it. The header's pill is a fact about what customers see, so
 * it follows the saved status; this shows the one chosen, and until it is
 * saved the bar says what saving will do — publish, take it off the shop,
 * archive — on a button named for exactly that.
 */
export function VisibilitySection({
    product,
    storeId,
    value,
    onChange,
}: {
    product: ProductDetail | null;
    storeId: string;
    /** Creating keeps the choice in the shell: it names the create button. */
    value?: ProductStatus;
    onChange?: (status: ProductStatus) => void;
}) {
    const { mode, canWrite } = useEditor();
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
    // Archived was on sale once; a draft may never have been.
    const everLive = saved !== "DRAFT";

    const pending = creating
        ? "Creating it as Published puts it on the shop straight away. Draft keeps it to the team."
        : status === "PUBLISHED"
          ? everLive
              ? "Saving puts this back on the shop. Until then customers still cannot see it."
              : "Saving publishes it for the first time. Nobody outside the team has seen it yet."
          : status === "DRAFT"
            ? "Saving takes it off the shop. Anyone who had the link finds nothing there."
            : "Saving archives it — it stops being sold, and its address stops resolving.";

    useSection(
        "visibility",
        {
            dirty,
            problem: "",
            note: pending,
            saveLabel:
                status === "PUBLISHED"
                    ? everLive
                        ? "Put back on the shop"
                        : "Publish"
                    : status === "DRAFT"
                      ? "Take off the shop"
                      : "Archive",
            discardLabel: `Keep it ${label(saved).toLowerCase()}`,
            savedMessage:
                status === "PUBLISHED"
                    ? everLive
                        ? "Back on the shop."
                        : "Published. Customers can buy it now."
                    : status === "DRAFT"
                      ? "Taken off the shop. Only the team can see it."
                      : "Archived. It is no longer sold.",
        },
        {
            save: async () => {
                if (!product) return false;
                const res = await patchProduct(storeId, product.id, {
                    status,
                });
                if (!res.ok) {
                    showError(res.error);
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
            <p className="mb-2.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                {creating
                    ? "Choose who can see it once it is created."
                    : saved === "PUBLISHED"
                      ? "On the shop now. Customers can buy it."
                      : saved === "DRAFT"
                        ? "A draft. Only the team can see it."
                        : "Archived. It is not sold, and its address does not open."}
            </p>
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
                            strokeWidth={2}
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
                                    <Check
                                        aria-hidden
                                        className="size-3.5"
                                        strokeWidth={2.4}
                                    />
                                ) : null}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            {creating ? (
                <div
                    role="status"
                    className={cn(
                        "mt-2.5 flex items-start gap-[9px] rounded-[9px] px-3 py-2.5",
                        status === "PUBLISHED"
                            ? "bg-success-subtle text-success-subtle-foreground"
                            : "bg-brand-subtle text-brand-subtle-foreground",
                    )}
                >
                    <Clock
                        aria-hidden
                        className="mt-px size-[15px] shrink-0"
                        strokeWidth={1.9}
                    />
                    <span className="text-pretty text-[12px] leading-[1.5]">
                        {pending}
                    </span>
                </div>
            ) : null}
        </SectionCard>
    );
}
