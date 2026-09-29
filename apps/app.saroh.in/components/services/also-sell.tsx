"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setModuleStatusAction } from "@/lib/modules/actions";
import { blockerSentence } from "@/lib/modules/blocker-copy";
import type { AlsoSellFeature } from "@/lib/services/also-sell";
import { alsoSellToast } from "@/lib/services/also-sell";

/**
 * "Also sell" (E12, the "Saroh Bookings" design): Courses and Class packs,
 * on or off for the business, for the owners and admins who may switch
 * modules. Each box flips the module itself, through the same action as
 * Settings › Modules, so the menu, `/class-packs` and Settings all follow.
 * Turning one off takes Undo; nothing it holds is deleted.
 */
export function AlsoSell({ features }: { features: AlsoSellFeature[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const set = (key: string, on: boolean) =>
        setModuleStatusAction(key, on ? "ENABLED" : "DISABLED");

    const flip = (f: AlsoSellFeature) => {
        const turningOn = !f.on;
        startTransition(async () => {
            const res = await set(f.key, turningOn);
            if (!res.ok) {
                // The API says why in a sentence ("Class packs needs
                // Appointments. Turn on Appointments first.").
                const refused = res.blockers?.[0];
                showError(refused ? blockerSentence(refused) : res.error);
                return;
            }
            router.refresh();
            const said = alsoSellToast(f.label, turningOn);
            if (turningOn) return showSuccess(said);
            showUndo(said, () => {
                void set(f.key, true).then((back) => {
                    if (!back.ok) showError(back.error);
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
        </div>
    );
}
