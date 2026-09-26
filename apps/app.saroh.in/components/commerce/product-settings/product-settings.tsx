"use client";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from "@saroh/ui/alert-dialog";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import type { SettingsTab } from "@/lib/products/links";
import { productSettingsHref } from "@/lib/products/links";

const LABEL: Record<SettingsTab, string> = {
    categories: "Categories",
    options: "Options",
    fields: "Custom fields",
    allergens: "Allergens",
    sku: "SKUs",
    defaults: "Defaults",
};

interface Unsaved {
    /** A tab with a save bar says whether it has changes. */
    setDirty: (dirty: boolean) => void;
}
const UnsavedContext = createContext<Unsaved>({ setDirty: () => undefined });

export function useUnsaved(): Unsaved {
    return useContext(UnsavedContext);
}

/**
 * Product settings' tabs and the one leave guard. Most changes here take
 * effect at once and offer Undo; the defaults and the SKU pattern are forms
 * with a save bar, and leaving either with changes asks first.
 */
export function ProductSettings({
    tab,
    tabs,
    children,
}: {
    tab: SettingsTab;
    /** Each tab with its count, when it has one. */
    tabs: { key: SettingsTab; count?: number }[];
    children: ReactNode;
}) {
    const [dirty, setDirty] = useState(false);
    const [leaveTo, setLeaveTo] = useState<string | null>(null);
    useLeaveGuard(dirty);

    return (
        <UnsavedContext.Provider value={{ setDirty }}>
            <div
                role="tablist"
                aria-label="Product settings"
                className="flex flex-wrap gap-0.5 border-b border-border max-[760px]:flex-nowrap max-[760px]:overflow-x-auto"
            >
                {tabs.map(({ key, count }) => {
                    const on = key === tab;
                    const href = productSettingsHref(key);
                    return (
                        <Link
                            key={key}
                            href={href}
                            role="tab"
                            aria-selected={on}
                            scroll={false}
                            onClick={(e) => {
                                if (dirty && !on) {
                                    e.preventDefault();
                                    setLeaveTo(href);
                                }
                            }}
                            className={cn(
                                "inline-flex shrink-0 items-center whitespace-nowrap px-3.5 py-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {LABEL[key]}
                            {count !== undefined ? (
                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                                    {count}
                                </span>
                            ) : null}
                        </Link>
                    );
                })}
            </div>
            <div className="pt-5">{children}</div>

            <AlertDialog
                open={leaveTo !== null}
                onOpenChange={(o) => {
                    if (!o) setLeaveTo(null);
                }}
            >
                <AlertDialogContent className="max-w-[380px] rounded-[14px] px-[22px] py-5">
                    <AlertDialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        Leave with unsaved changes?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="mt-[7px] text-[13px] leading-[1.55] text-foreground/75">
                        Your changes to the defaults or the SKU pattern will be
                        lost.
                    </AlertDialogDescription>
                    <div className="mt-[18px] flex flex-wrap justify-end gap-2">
                        <Link
                            href={leaveTo ?? "#"}
                            scroll={false}
                            onClick={() => {
                                setDirty(false);
                                setLeaveTo(null);
                            }}
                            className="inline-flex h-[34px] items-center rounded-[9px] border border-border px-[13px] text-[12.5px] font-semibold text-destructive hover:bg-destructive-subtle"
                        >
                            Leave without saving
                        </Link>
                        <button
                            type="button"
                            autoFocus
                            onClick={() => setLeaveTo(null)}
                            className="h-[34px] rounded-[9px] bg-foreground px-3.5 text-[12.5px] font-semibold text-background hover:bg-foreground/90"
                        >
                            Stay
                        </button>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </UnsavedContext.Provider>
    );
}

/** A tab's heading and the line under it. */
export function TabIntro({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <>
            <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                {title}
            </h2>
            <p className="mb-4 mt-[5px] max-w-[64ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                {children}
            </p>
        </>
    );
}

/** The design's small buttons: 28px row actions, 30px and 36px primaries. */
export const rowBtn =
    "inline-flex h-7 items-center rounded-[7px] border border-border bg-card px-2.5 text-[12px] font-semibold hover:bg-muted/50 disabled:cursor-not-allowed disabled:text-muted-foreground/60 coarse:h-11";
export const smallBtn =
    "inline-flex h-[30px] items-center rounded-[7px] border border-border bg-card px-[11px] text-[12px] font-semibold hover:bg-muted/50 disabled:cursor-not-allowed coarse:h-11";
export const primaryBtn =
    "inline-flex h-[30px] items-center rounded-[7px] bg-foreground px-3 text-[12px] font-semibold text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground coarse:h-11";
export const bigBtn =
    "inline-flex h-9 shrink-0 items-center rounded-[8px] bg-foreground px-3.5 text-[12.5px] font-semibold text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground coarse:h-11";
export const textBox =
    "h-9 min-w-0 rounded-[8px] border bg-card px-2.5 text-[13px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/50 coarse:h-11";
export const chipBtn = (on: boolean) =>
    cn(
        "inline-flex h-[30px] items-center rounded-full border px-[11px] text-[12.5px] disabled:cursor-not-allowed coarse:h-11",
        on
            ? "border-foreground bg-foreground font-semibold text-background"
            : "border-border bg-card font-medium text-foreground/75 hover:bg-muted/50",
    );
