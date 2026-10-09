"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEdgeFade } from "@saroh/ui/scroll-x";
import { useRef } from "react";

export interface SettingsTab<K extends string> {
    key: K;
    label: string;
    /** The panel this tab shows (`aria-controls`). */
    controls: string;
    /** Drawn after the label, such as a dot for unsaved changes. */
    extra?: React.ReactNode;
}

/**
 * A settings page's tab strip, as Settings › Business draws it: one line
 * however narrow, scrolling sideways with no scrollbar and fading on the
 * side with more, the open tab kept in view (UX-079). Arrow keys, Home
 * and End move between tabs (the ARIA tabs pattern), and each tab is
 * `${idPrefix}-${key}` for its panel's `aria-labelledby`.
 */
export function SettingsTabStrip<K extends string>({
    label,
    idPrefix,
    tabs,
    current,
    onChange,
    className,
}: {
    /** The strip's accessible name: "Business details". */
    label: string;
    idPrefix: string;
    tabs: readonly SettingsTab<K>[];
    current: K;
    onChange: (key: K) => void;
    className?: string;
}) {
    const strip = useRef<HTMLDivElement>(null);
    const fade = useEdgeFade(strip, {
        current: '[aria-selected="true"]',
        revealKey: current,
    });
    const index = tabs.findIndex((t) => t.key === current);
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
        if (next === null) return;
        e.preventDefault();
        onChange(tabs[next].key);
        document.getElementById(`${idPrefix}-${tabs[next].key}`)?.focus();
    };

    return (
        <div
            ref={strip}
            role="tablist"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={fade}
            className={cn(
                "flex flex-nowrap gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                className,
            )}
        >
            {tabs.map((t) => {
                const on = t.key === current;
                return (
                    <button
                        key={t.key}
                        id={`${idPrefix}-${t.key}`}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-controls={t.controls}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(t.key)}
                        className={cn(
                            "flex shrink-0 items-center gap-[7px] whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                : "font-medium text-muted-foreground hover:text-foreground active:bg-accent-active",
                        )}
                    >
                        {t.label}
                        {t.extra}
                    </button>
                );
            })}
        </div>
    );
}
