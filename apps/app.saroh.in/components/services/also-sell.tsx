"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TurnOnSheet } from "@/components/modules/turn-on/turn-on-sheet";
import { CheckRow } from "@/components/shared/fields/check-row";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
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
 *
 * Under the list since the Bookings audit (12 Oct 2026): the list starts
 * the screen. A card of tick rows on a phone, two cards at the desk (U15,
 * BKMServices and BKDStates). Once Courses is on, "New course" is in the
 * New service menu.
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
            const res = await runAction(() => set(f.key, false));
            if (!res) return;
            if (!res.ok) {
                // The API says why in a sentence.
                showError(refusalSentence(res));
                return;
            }
            router.refresh();
            showUndo(alsoSellToast(f.label, false), async () => {
                const back = await runAction(() => set(f.key, true), {
                    quiet: true,
                });
                if (!back) return { ok: false, error: UNREACHED };
                router.refresh();
                return back.ok
                    ? true
                    : { ok: false, error: refusalSentence(back) };
            });
        });
    };

    return (
        <div
            role="group"
            aria-label="Also sell"
            aria-busy={pending || undefined}
            // A card of rows on a phone; a heading and two cards at the desk
            // (BKMServices, BKDStates).
            className="mt-3.5 rounded-xl border border-border bg-card px-3.5 pb-1 min-[760px]:mt-[22px] min-[760px]:border-0 min-[760px]:bg-transparent min-[760px]:p-0"
        >
            <span aria-hidden className="label block pt-2.5 min-[760px]:hidden">
                Also sell
            </span>
            <span
                aria-hidden
                className="mb-2.5 hidden font-display text-base font-semibold tracking-tight min-[760px]:block"
            >
                Also sell
            </span>
            <div className="divide-y divide-border min-[760px]:grid min-[760px]:grid-cols-2 min-[760px]:gap-3 min-[760px]:divide-y-0">
                {features.map((f) => (
                    <CheckRow
                        key={f.key}
                        checked={f.on}
                        disabled={pending}
                        onChange={() => flip(f)}
                        boxClassName="mt-0.5"
                        className="min-h-14 items-start gap-3 py-2.5 min-[760px]:rounded-xl min-[760px]:border min-[760px]:border-border min-[760px]:bg-card min-[760px]:px-3.5"
                    >
                        <span>
                            <span className="block text-[14.5px] font-semibold text-foreground">
                                {f.label}
                            </span>
                            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                {f.note}
                            </span>
                        </span>
                    </CheckRow>
                ))}
            </div>
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
