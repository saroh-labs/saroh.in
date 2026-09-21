"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { useId, useState } from "react";

import { eyebrow } from "@/components/site/bits";
import { ALWAYS_ROWS, TOGGLES } from "@/lib/site-content";

type Key = (typeof TOGGLES)[number]["key"];

/**
 * "Try the switching": the real control with the real dependency. Turning
 * Bookings on brings Contacts with it, because a booking needs somewhere to
 * keep the person who made it; Contacts cannot be turned off while Bookings
 * needs it. The sidebar below is the one the workspace would draw.
 */
export function SwitchDemo() {
    const id = useId();
    const [on, setOn] = useState<Record<Key, boolean>>({
        sell: true,
        website: true,
        bookings: false,
        contacts: false,
        insights: true,
    });

    const flip = (key: Key, next: boolean) =>
        setOn((prev) => {
            const out = { ...prev, [key]: next };
            for (const t of TOGGLES) {
                if (!("needs" in t)) continue;
                // Turning something on turns on what it needs…
                if (next && t.key === key) out[t.needs] = true;
                // …and a need cannot be turned off from under it.
                if (!next && t.needs === key && out[t.key]) out[key] = true;
            }
            return out;
        });

    const needed = (key: Key) =>
        TOGGLES.some((t) => "needs" in t && t.needs === key && on[t.key]);

    const chosen = TOGGLES.filter((t) => on[t.key]).flatMap((t) => t.rows);
    const rows = ["Home", ...chosen, ...ALWAYS_ROWS];

    return (
        <div className="overflow-hidden rounded-[16px] border border-border bg-card">
            <ul>
                {TOGGLES.map((t, i) => {
                    const locked = on[t.key] && needed(t.key);
                    return (
                        <li
                            key={t.key}
                            className={cn(
                                "flex items-start gap-3 px-[19px] py-3.5",
                                i > 0 && "border-t border-border",
                            )}
                        >
                            <label
                                htmlFor={`${id}-${t.key}`}
                                className="min-w-0 flex-1 cursor-pointer"
                            >
                                <span className="block text-[16px] font-semibold">
                                    {t.label}
                                </span>
                                <span className="mt-0.5 block text-pretty text-[12px] leading-normal text-muted-foreground">
                                    {t.note}
                                </span>
                                {locked ? (
                                    <span className="mt-1 block text-[12px] leading-[1.45] text-brand-subtle-foreground">
                                        Needed by Bookings. Turn Bookings off to
                                        release it.
                                    </span>
                                ) : null}
                            </label>
                            <Switch
                                id={`${id}-${t.key}`}
                                checked={on[t.key]}
                                disabled={locked}
                                onCheckedChange={(next) => flip(t.key, next)}
                                className="mt-0.5"
                            />
                        </li>
                    );
                })}
            </ul>
            <div className="border-t border-border bg-neutral-50 px-[19px] pb-[18px] pt-4 dark:bg-muted">
                <div className={cn(eyebrow, "mb-[9px]")}>
                    Your sidebar would be
                </div>
                <ul
                    aria-live="polite"
                    className="mb-[9px] flex flex-wrap gap-1.5"
                >
                    {rows.map((row) => {
                        const always =
                            row === "Home" || ALWAYS_ROWS.includes(row);
                        return (
                            <li
                                key={row}
                                className={cn(
                                    "rounded-full border border-border px-2.5 py-1 text-[12px]",
                                    always
                                        ? "bg-muted text-muted-foreground"
                                        : "bg-card text-foreground",
                                )}
                            >
                                {row}
                            </li>
                        );
                    })}
                </ul>
                <p className="text-pretty text-[12px] leading-normal text-muted-foreground">
                    {rows.length} rows. {ALWAYS_ROWS.length + 1} of them every
                    business gets; {chosen.length} came from what you switched
                    on.
                </p>
            </div>
        </div>
    );
}
