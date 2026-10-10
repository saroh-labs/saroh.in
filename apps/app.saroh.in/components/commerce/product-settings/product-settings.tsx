"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import { useLeaveGuard } from "@/components/shared/use-leave-guard";
import type { SettingsTab } from "@/lib/products/links";
import { productSettingsHref } from "@/lib/products/links";
import { TabStrip } from "@saroh/ui/tabs";

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
 * Product settings' tabs and the one leave guard. The lists are read first:
 * a change is made in a dialog or a side sheet, saved there and offered Undo.
 * The defaults and the SKU pattern are forms with a save bar, and leaving
 * either with changes asks first.
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
    // Another tab is another address, so the guard catches the tabs too.
    const guard = useLeaveGuard({
        dirty,
        lost: "Your changes to the defaults or the SKU pattern will be lost.",
    });

    return (
        <UnsavedContext.Provider value={{ setDirty }}>
            <TabStrip
                label="Product settings"
                value={tab}
                tabs={tabs.map(({ key, count }) => ({
                    value: key,
                    label: LABEL[key],
                    href: productSettingsHref(key),
                    count,
                }))}
            />
            <div className="pt-5">{children}</div>

            {guard.dialog}
        </UnsavedContext.Provider>
    );
}

/**
 * A tab's heading and the line under it, with the tab's one action (New
 * category, Add field) beside them when it has one.
 */
export function TabIntro({
    title,
    action,
    children,
}: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-[1_1_320px]">
                <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                    {title}
                </h2>
                <p className="mt-[5px] max-w-[64ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                    {children}
                </p>
            </div>
            {action}
        </div>
    );
}

/** A problem under a field, or at the foot of a sheet. */
export const PROBLEM =
    "text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground";

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
