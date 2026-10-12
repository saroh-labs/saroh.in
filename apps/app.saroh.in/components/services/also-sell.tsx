"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TurnOnSheet } from "@/components/modules/turn-on/turn-on-sheet";
import { CheckRow } from "@/components/shared/check-row";
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
 * A quiet row under the list since the Bookings audit (12 Oct 2026): the
 * list starts the screen, and a switch for a module doesn't sit where it
 * should begin. Once Courses is on, "New course" is in the header's New
 * service menu.
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
            className="mt-4 flex flex-wrap items-start gap-x-[18px] gap-y-1.5 px-[14px]"
        >
            <span className="text-[13px] font-medium leading-snug text-muted-foreground">
                Also sell
            </span>
            {features.map((f) => (
                <CheckRow
                    key={f.key}
                    checked={f.on}
                    disabled={pending}
                    onChange={() => flip(f)}
                    boxClassName="mt-0.5"
                    className="max-w-[300px] items-start gap-[7px]"
                >
                    <span>
                        {f.label}
                        <span className="block text-[11.5px] text-muted-foreground">
                            {f.note}
                        </span>
                    </span>
                </CheckRow>
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
