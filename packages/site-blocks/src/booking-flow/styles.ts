import { cn } from "../lib/utils";

// ── Shapes drawn from the site layer ─────────────────────────────────────

export const card =
    "bg-site-surface border-site-border rounded-[calc(var(--site-radius)+14px)] border p-[22px] shadow-[0_1px_2px_hsl(var(--site-fg)/0.08)]";
export const accentTint =
    "bg-[color-mix(in_srgb,hsl(var(--site-accent))_10%,hsl(var(--site-surface)))]";
export const quietFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-bg)))]";
export const inputFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_3%,hsl(var(--site-surface)))]";
export const onDarkMuted =
    "text-[color-mix(in_srgb,hsl(var(--site-bg))_72%,hsl(var(--site-fg)))]";
export const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/** A choice row: a service, a session, a way to pay. */
export function optionClasses(on: boolean): string {
    return cn(
        "text-site-fg flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[calc(var(--site-radius)+10px)] border px-[18px] py-[15px] text-left transition-colors duration-100 ease-out",
        focusRing,
        on
            ? cn(
                  "border-site-accent shadow-[inset_3px_0_0_hsl(var(--site-accent))]",
                  accentTint,
              )
            : "border-site-border bg-site-surface",
    );
}

/** The confirm button: the accent when it can go, quiet when it cannot. */
export function confirmClasses(blocked: boolean): string {
    return cn(
        "h-[45px] rounded-[calc(var(--site-radius)+7px)] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg",
        blocked
            ? cn(
                  "cursor-not-allowed bg-[color-mix(in_srgb,hsl(var(--site-bg))_14%,hsl(var(--site-fg)))]",
                  onDarkMuted,
              )
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90",
    );
}
