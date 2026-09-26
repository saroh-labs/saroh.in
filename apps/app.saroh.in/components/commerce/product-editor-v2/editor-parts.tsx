"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { joinAnd } from "@/lib/products/editor-sections";
import type { ProductStatus } from "@/lib/products/service";

/*
 * The editor shell's smaller pieces, after the Editor design: the saved
 * status beside the name, the read-only note, what opens once a new product
 * exists, and the question before leaving with unsaved changes.
 */

/** A fact about what customers can see, so it follows the SAVED status. */
export function StatusPill({ status }: { status: ProductStatus | null }) {
    if (!status) {
        return (
            <span className="shrink-0 rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Not created yet
            </span>
        );
    }
    return (
        <span
            className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                status === "PUBLISHED"
                    ? "bg-success-subtle text-success-subtle-foreground"
                    : status === "DRAFT"
                      ? "bg-brand-subtle text-brand-subtle-foreground"
                      : "bg-muted text-foreground/75",
            )}
        >
            {status === "PUBLISHED"
                ? "Published"
                : status === "DRAFT"
                  ? "Draft"
                  : "Archived"}
        </span>
    );
}

/** Under the header for someone who can't change (all of) the product. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
    return (
        <div
            role="note"
            className="flex items-start gap-[9px] border-b border-border bg-brand-subtle px-[18px] py-2.5"
        >
            <Lock
                aria-hidden
                className="mt-px size-[15px] shrink-0 text-brand"
                strokeWidth={1.9}
            />
            <span className="text-pretty text-[12.5px] leading-[1.5] text-brand-subtle-foreground">
                {children}
            </span>
        </div>
    );
}

/** Leaving with unsaved changes: names the sections, and Stay is the default. */
export function LeaveDialog({
    open,
    onOpenChange,
    href,
    creating,
    sections,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    href: string;
    creating: boolean;
    sections: string[];
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[380px] rounded-[14px] px-[22px] py-5">
                <AlertDialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    {creating
                        ? "Leave without creating it?"
                        : "Leave with unsaved changes?"}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-[7px] text-pretty text-[13px] leading-[1.55] text-foreground/75">
                    {creating
                        ? "Nothing you have entered is kept."
                        : `Unsaved changes in ${joinAnd(sections)} will be lost.`}
                </AlertDialogDescription>
                <div className="mt-[18px] flex flex-wrap justify-end gap-2">
                    <Link
                        href={href}
                        className="inline-flex h-[38px] items-center rounded-[9px] border border-border px-4 text-[12.5px] font-semibold text-destructive hover:bg-destructive-subtle"
                    >
                        Leave without saving
                    </Link>
                    <button
                        type="button"
                        autoFocus
                        onClick={() => onOpenChange(false)}
                        className="h-[38px] rounded-[9px] bg-foreground px-4 text-[12.5px] font-semibold text-background hover:bg-foreground/90"
                    >
                        Stay
                    </button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/** While creating: what opens once the product exists, and that it stays here. */
export function NextSteps() {
    return (
        <section
            aria-label="After you create it"
            className="rounded-[12px] border border-dashed border-border-strong px-[18px] py-[15px]"
        >
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                Next: variants and stock
            </h2>
            <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                Both are saved against the product, so they open here the moment
                it is created. You stay on this page.
            </p>
            <ol className="mt-[13px] flex flex-col gap-[9px]">
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        1
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Variants
                        </strong>{" "}
                        — one per size, shade or colour. Each starts at the
                        product&apos;s price, and can have its own.
                    </span>
                </li>
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        2
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Stock
                        </strong>{" "}
                        — how many you have, and when to warn you. With
                        variants, each keeps its own count.
                    </span>
                </li>
            </ol>
        </section>
    );
}
