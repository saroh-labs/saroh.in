"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TurnOnSheet } from "@/components/modules/turn-on/turn-on-sheet";
import { setModuleStatusAction } from "@/lib/modules/actions";
import { refusalSentence } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import type { AlsoSellFeature } from "@/lib/services/also-sell";
import { alsoSellToast } from "@/lib/services/also-sell";

/**
 * "Also sell" (E12, the "Saroh Bookings" design): Courses and Class packs,
 * on or off for the business, for the owners and admins who may switch
 * modules. Ticking one opens the "Turn on" sheet (DEC-068), the same one
 * Settings › Modules uses, so the menu, `/class-packs` and Settings all
 * follow. Turning one off takes Undo; nothing it holds is deleted.
 */
export function AlsoSell({
    features,
    modules = [],
}: {
    features: AlsoSellFeature[];
    /** Every module, for what the sheet brings with it. */
    modules?: readonly ModuleView[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [picked, setPicked] = useState<string[] | null>(null);

    const set = (key: string, on: boolean) =>
        setModuleStatusAction(key, on ? "ENABLED" : "DISABLED");

    const flip = (f: AlsoSellFeature) => {
        if (!f.on) return setPicked([f.key]);
        startTransition(async () => {
            const res = await set(f.key, false);
            if (!res.ok) {
                // The API says why in a sentence.
                showError(refusalSentence(res));
                return;
            }
            router.refresh();
            showUndo(alsoSellToast(f.label, false), () => {
                void set(f.key, true).then((back) => {
                    if (!back.ok) showError(refusalSentence(back));
                    router.refresh();
                });
            });
        });
    };

    return (
        <div
            role="group"
            aria-label="Also sell"
            aria-busy={pending || undefined}
            className="mb-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-[12px] border border-border bg-card px-3.5 py-[11px]"
        >
            <span className="text-[13px] font-semibold">Also sell</span>
            {features.map((f) => (
                <label
                    key={f.key}
                    className="flex max-w-[300px] cursor-pointer items-start gap-[7px] text-[13px]"
                >
                    <Checkbox
                        checked={f.on}
                        disabled={pending}
                        onCheckedChange={() => flip(f)}
                        className="mt-0.5"
                    />
                    <span>
                        {f.label}
                        <span className="block text-[11.5px] text-muted-foreground">
                            {f.note}
                        </span>
                    </span>
                </label>
            ))}
            <TurnOnSheet
                picked={picked}
                modules={modules}
                onOpenChange={(open) => {
                    if (!open) setPicked(null);
                }}
            />
        </div>
    );
}
