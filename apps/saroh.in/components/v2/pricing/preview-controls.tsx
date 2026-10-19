"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/cn";
import type { PreviewView } from "@/lib/pricing-preview";
import { previewHref } from "@/lib/pricing-preview";

/**
 * The staff draft preview's controls (admin redesign U13, R24), in the amber
 * bar: Draft or Live now, Desktop or Phone, and Show what changed. Each is
 * part of the address (`previewHref`), so the server draws the page asked
 * for. With nothing live there is nothing to compare: only the width shows.
 */
export function PreviewControls({
    view,
    hasLive,
}: {
    view: PreviewView;
    hasLive: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const go = (next: Partial<PreviewView>) =>
        start(() =>
            router.replace(previewHref({ ...view, ...next }), {
                scroll: false,
            }),
        );
    const draft = view.show === "draft";

    return (
        <div
            aria-busy={pending}
            className="flex flex-wrap items-center gap-x-3 gap-y-2"
        >
            {hasLive ? (
                <Segments
                    label="Version"
                    options={[
                        {
                            on: draft,
                            text: "Draft",
                            pick: () => go({ show: "draft" }),
                        },
                        {
                            on: !draft,
                            text: "Live now",
                            pick: () => go({ show: "live" }),
                        },
                    ]}
                />
            ) : null}
            <Segments
                label="Width"
                options={[
                    {
                        on: view.width === "desktop",
                        text: "Desktop",
                        pick: () => go({ width: "desktop" }),
                    },
                    {
                        on: view.width === "phone",
                        text: "Phone",
                        pick: () => go({ width: "phone" }),
                    },
                ]}
            />
            {hasLive && draft ? (
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-medium">
                    <input
                        type="checkbox"
                        checked={view.marks}
                        onChange={(e) => go({ marks: e.target.checked })}
                        className="size-4 accent-foreground"
                    />
                    Show what changed
                </label>
            ) : null}
        </div>
    );
}

function Segments({
    label,
    options,
}: {
    label: string;
    options: { on: boolean; text: string; pick: () => void }[];
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="inline-flex rounded-[10px] bg-foreground/10 p-[3px]"
        >
            {options.map((o) => (
                <button
                    key={o.text}
                    type="button"
                    aria-pressed={o.on}
                    onClick={o.on ? undefined : o.pick}
                    className={cn(
                        "min-h-9 cursor-pointer rounded-[8px] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]",
                        o.on
                            ? "bg-background text-foreground shadow-sm"
                            : "bg-transparent text-foreground/80 hover:text-foreground",
                    )}
                >
                    {o.text}
                </button>
            ))}
        </div>
    );
}
