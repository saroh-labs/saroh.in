"use client";

import type { MouseEvent, ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react";

import { useLeaveGuard } from "@/components/shared/use-leave-guard";
import { count } from "@/lib/format/plural";
import type { SettingsTab } from "@/lib/products/links";
import { productSettingsHref } from "@/lib/products/links";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { TabStrip } from "@saroh/ui/tabs";

const LABEL: Record<SettingsTab, string> = {
    categories: "Categories",
    options: "Options",
    fields: "Custom fields",
    allergens: "Allergens",
    sku: "SKUs",
    defaults: "Defaults",
};

/** "Your 1 change to Defaults will be lost." */
export function lostLine(changes: number, tab: SettingsTab): string {
    return `Your ${count(Math.max(1, changes), "change")} to ${LABEL[tab]} will be lost.`;
}

interface Unsaved {
    /**
     * A tab with a save bar says how many changes it holds (0 when none)
     * and how to save them, for the leave guard's Save and leave.
     */
    report: (changes: number, save?: () => Promise<boolean>) => void;
}
const UnsavedContext = createContext<Unsaved>({ report: () => undefined });

export function useUnsaved(): Unsaved {
    return useContext(UnsavedContext);
}

/**
 * Product settings' tabs and the one leave guard. The lists are read first:
 * a change is made in a dialog or a side sheet, saved there and offered Undo.
 * The defaults and the SKU pattern are forms with a save bar, and leaving
 * either with changes asks first, naming the tab and how many changes, with
 * Save and leave.
 *
 * Each tab is an address the server reads. On a slow line the press would
 * show nothing until the next page arrived, so the pressed tab takes the
 * underline at once and the panel dims until it lands.
 */
export function ProductSettings({
    tab,
    tabs,
    children,
}: {
    tab: SettingsTab;
    /** Each tab with its count, when it has one (`null`: not known). */
    tabs: { key: SettingsTab; count?: number | null }[];
    children: ReactNode;
}) {
    const [changes, setChanges] = useState(0);
    const saveRef = useRef<(() => Promise<boolean>) | undefined>(undefined);
    const report = useCallback((n: number, save?: () => Promise<boolean>) => {
        saveRef.current = save;
        setChanges(n);
    }, []);
    // Another tab is another address, so the guard catches the tabs too.
    const guard = useLeaveGuard({
        dirty: changes > 0,
        lost: lostLine(changes, tab),
        save: () => saveRef.current?.() ?? Promise.resolve(true),
    });

    // The tab pressed, until the server's page for it arrives.
    const [pressed, setPressed] = useState<SettingsTab | null>(null);
    const [shownTab, setShownTab] = useState(tab);
    if (shownTab !== tab) {
        setShownTab(tab);
        setPressed(null);
    }
    const loading = pressed !== null && pressed !== tab;

    function onPress(e: MouseEvent<HTMLDivElement>) {
        // The leave guard asked first (it prevents the link), or the press
        // opens a new tab: nothing moves here.
        if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
        )
            return;
        const link = (e.target as HTMLElement).closest("a[href]");
        const key = link?.id.split("-").pop();
        const hit = tabs.find((t) => t.key === key);
        if (hit && hit.key !== tab) setPressed(hit.key);
    }

    return (
        <UnsavedContext.Provider value={{ report }}>
            <div onClick={onPress}>
                <TabStrip
                    label="Product settings"
                    idPrefix="settings-tab"
                    value={pressed ?? tab}
                    tabs={tabs.map(({ key, count }) => ({
                        value: key,
                        label: LABEL[key],
                        href: productSettingsHref(key),
                        count,
                    }))}
                />
            </div>
            <div
                aria-busy={loading || undefined}
                className={cn(
                    "pt-5 transition-opacity duration-fast",
                    loading && "pointer-events-none opacity-50",
                )}
            >
                {children}
            </div>

            {guard.dialog}
        </UnsavedContext.Provider>
    );
}

/**
 * The read-only line every tab shows a role that can read but not change:
 * `ReadOnlyNote`'s look, with "your role" said, since "this" read as the
 * setting rather than the role.
 */
export function SettingsReadOnly() {
    return (
        <Notice icon={false} data-ph-unmask="" className="mb-3.5">
            You can see these but not change them. An owner or admin can change
            your role in Settings › Team.
        </Notice>
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
