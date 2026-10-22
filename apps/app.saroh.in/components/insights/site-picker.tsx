"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { QuickLook } from "@/components/shared/forms/quick-look";
import { useNarrow } from "@/lib/hooks/use-narrow";

/**
 * Which website the "Where customers come from" figures are for (DEC-171,
 * plan U14, #1097; `IBSiteD` beside the page, `IBSiteP` as a sheet on a
 * phone). Shown only when the business has more than one website: the
 * caller leaves it out otherwise.
 *
 * Each choice is an address (`?siteId=`, kept with the tab and the
 * period), so Back, a refresh and a shared link keep it; "All your sites"
 * drops it. Choosing one goes there and closes the sheet. Each choice is
 * 48px or more, past a thumb's 44.
 */

export interface SiteOption {
    /** Null: every website together. */
    id: string | null;
    /** "Rye & Co." or "All your sites". */
    name: string;
    /** "rye.saroh.app", or what "All your sites" covers. */
    line: string;
    /** This tab and period, for that website. */
    href: string;
}

export function SitePicker({
    value,
    options,
}: {
    /** The website chosen, or null for all of them. */
    value: string | null;
    options: readonly SiteOption[];
}) {
    const [open, setOpen] = useState(false);
    const narrow = useNarrow();
    const chosen = options.find((o) => o.id === value) ?? options.at(0);

    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                data-ph-unmask=""
                className="shrink-0 text-[13px] text-muted-foreground"
            >
                Website
            </span>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Website: ${chosen?.name ?? "All your sites"}`}
                data-testid="site-picker"
                onClick={() => setOpen(true)}
                className={cn(
                    "inline-flex h-9 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-foreground bg-card px-3 text-[13px] font-semibold text-foreground transition-colors duration-fast hover:bg-muted active:bg-accent-active coarse:h-11",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
            >
                <span data-ph-mask="" className="truncate">
                    {chosen?.name ?? "All your sites"}
                </span>
                <ChevronDown aria-hidden className="size-3.5 shrink-0" />
            </button>
            <QuickLook
                open={open}
                onOpenChange={setOpen}
                side={narrow ? "bottom" : "right"}
                title={<span data-ph-unmask="">Which website</span>}
                subtitle={
                    <span data-ph-unmask="">Where customers come from</span>
                }
                description="Choose the website these figures are for."
            >
                <ul className="grid gap-2" data-testid="site-options">
                    {options.map((o) => {
                        const on = o.id === (chosen?.id ?? null);
                        return (
                            <li key={o.id ?? "all"}>
                                <Link
                                    href={o.href}
                                    scroll={false}
                                    aria-current={on ? "true" : undefined}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        "flex min-h-12 w-full items-center gap-3 rounded-[10px] border bg-card px-3 py-1.5 text-left text-foreground transition-colors duration-fast hover:bg-muted active:bg-accent-active",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                                        on
                                            ? "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                                            : "border-border",
                                    )}
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-[18px] shrink-0 rounded-full",
                                            on
                                                ? "border-[5.5px] border-foreground"
                                                : "border-[1.5px] border-border-strong",
                                        )}
                                    />
                                    <span
                                        className="grid min-w-0 flex-1 gap-0.5 text-[13.5px]"
                                        {...(o.id === null
                                            ? { "data-ph-unmask": "" }
                                            : { "data-ph-mask": "" })}
                                    >
                                        <b className="truncate font-semibold">
                                            {o.name}
                                        </b>
                                        <small className="truncate text-xs text-muted-foreground">
                                            {o.line}
                                        </small>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </QuickLook>
        </div>
    );
}
