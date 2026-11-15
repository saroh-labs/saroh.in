import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * A phone around a drawn screen (a hero, a customer's view): Ink body with
 * 56px corners, the status bar's time in mono and the island. The screen is
 * the page's drawing, at the phone's own 390px; `width` scales the whole
 * frame. `label` names it for a screen reader ("Asha's Home at 7:02 am, an
 * example").
 */
export function PhoneFrame({
    label,
    time,
    width = 400,
    screen = "#FBFAF7",
    children,
    className,
}: {
    label: string;
    /** The status bar's clock, as the phone shows it: "7:02". */
    time?: string;
    width?: number;
    /** The screen's fill, as a CSS colour. */
    screen?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <figure
            aria-label={label}
            className={cn(
                "m-0 aspect-[400/812] max-w-full rounded-[56px] bg-foreground p-[11px] shadow-[0_30px_60px_-20px_rgba(40,44,40,0.35),0_10px_24px_rgba(40,44,40,0.12)]",
                className,
            )}
            style={{ width }}
        >
            <div
                className="relative flex h-full flex-col overflow-hidden rounded-[46px]"
                style={{ background: screen }}
            >
                <div
                    aria-hidden
                    className="flex items-center justify-between px-[30px] pt-4 text-[14px] font-semibold"
                >
                    <span className="font-mono">{time}</span>
                    <span className="size-3.5" />
                </div>
                <span
                    aria-hidden
                    className="absolute left-1/2 top-2.5 h-[30px] w-[110px] -translate-x-1/2 rounded-[20px] bg-foreground"
                />
                <div className="min-h-0 flex-1">{children}</div>
            </div>
        </figure>
    );
}

/**
 * A browser window around a drawn screen.
 *
 * - `app` — Saroh's app: three dots and "app.saroh.in · Orders" on the left.
 * - `site` — a merchant's site: the padlock and its address in the middle
 *   ("rye-and-co.saroh.app"), the bar in the site's own colours.
 */
export function BrowserFrame({
    label,
    address,
    look = "app",
    children,
    className,
}: {
    label: string;
    address: string;
    look?: "app" | "site";
    children: ReactNode;
    className?: string;
}) {
    return (
        <figure
            aria-label={label}
            className={cn(
                "m-0 min-w-0 overflow-hidden rounded-mk-card bg-card shadow-[0_24px_50px_-18px_rgba(40,44,40,0.3),0_3px_10px_rgba(40,44,40,0.07)]",
                className,
            )}
        >
            {look === "app" ? (
                <div className="flex h-10 items-center gap-2 bg-mk-hover px-4 text-[13px] font-medium text-mk-copy">
                    <span
                        aria-hidden
                        className="size-2.5 rounded-full bg-border-strong"
                    />
                    <span
                        aria-hidden
                        className="size-2.5 rounded-full bg-border-strong"
                    />
                    <span
                        aria-hidden
                        className="size-2.5 rounded-full bg-border-strong"
                    />
                    <span className="ml-3.5 truncate">{address}</span>
                </div>
            ) : (
                <div
                    className="flex h-11 items-center justify-center gap-2 text-[13px] font-medium"
                    style={{
                        background:
                            "color-mix(in srgb, hsl(var(--site-bg, 40 31% 94%)) 88%, black)",
                        color: "hsl(var(--site-fg, 60 4% 11%))",
                    }}
                >
                    <Lock aria-hidden className="size-3.5" />
                    <span className="truncate">{address}</span>
                </div>
            )}
            {children}
        </figure>
    );
}
