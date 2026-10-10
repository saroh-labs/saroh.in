"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEdgeFade } from "@saroh/ui/scroll-x";
import { Fragment, useRef } from "react";

import type { LocationTab } from "@/lib/stores/location-readiness";

/** The id of the panel the tabs control, and of each tab. */
export const LOCATION_PANEL_ID = "location-panel";
export const locationTabId = (tab: LocationTab) => `location-tab-${tab}`;

/**
 * A location's tabs (The place · Payments · Delivery · Customers · People ·
 * Pause or close), drawn as Settings › Business draws its own: one line however
 * narrow, scrolling sideways on a phone with the fade on the side with more
 * and the open tab kept in view (UX-079), arrow keys, Home and End moving
 * between them. Pause or close is last, set apart by a rule.
 */
export function LocationTabs({
    tabs,
    tab,
    onChange,
}: {
    tabs: readonly { id: LocationTab; label: string }[];
    tab: LocationTab;
    onChange: (tab: LocationTab) => void;
}) {
    const strip = useRef<HTMLDivElement>(null);
    const fade = useEdgeFade(strip, {
        current: '[aria-selected="true"]',
        revealKey: tab,
    });
    const index = tabs.findIndex((t) => t.id === tab);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const n = tabs.length;
        const next =
            e.key === "ArrowRight"
                ? (index + 1) % n
                : e.key === "ArrowLeft"
                  ? (index - 1 + n) % n
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? n - 1
                      : null;
        const to = next === null ? undefined : tabs[next];
        if (!to) return;
        e.preventDefault();
        onChange(to.id);
        document.getElementById(locationTabId(to.id))?.focus();
    };

    return (
        <div
            ref={strip}
            role="tablist"
            aria-label="Location settings"
            onKeyDown={onKeyDown}
            style={fade}
            className="flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {tabs.map((t) => {
                const on = t.id === tab;
                return (
                    <Fragment key={t.id}>
                        {t.id === "pause-or-close" ? (
                            <span
                                aria-hidden
                                className="mx-1.5 h-5 w-px shrink-0 bg-border"
                            />
                        ) : null}
                        <button
                            id={locationTabId(t.id)}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls={LOCATION_PANEL_ID}
                            tabIndex={on ? 0 : -1}
                            onClick={() => onChange(t.id)}
                            className={cn(
                                "flex shrink-0 items-center whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                    : "font-medium text-muted-foreground hover:text-foreground active:bg-accent-active",
                            )}
                        >
                            {t.label}
                        </button>
                    </Fragment>
                );
            })}
        </div>
    );
}
