"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { LATE_AFTER_ANCHOR } from "@/components/stores/fulfilment-section";
import { lateAfterWords } from "@/lib/stores/late-after";
import { storefrontHref } from "@/lib/stores/links";
import { dismissLateRuleNotice } from "@/lib/stores/storefront-actions";
import type { LateRuleNotice } from "@/lib/stores/storefronts";
import { IconButton } from "@saroh/ui/icon-button";
import { Notice } from "@saroh/ui/notice";

/**
 * One storefront's one-time notice on Orders (plan B, B17): pick-up orders
 * now count as late after 2 hours; a business sets what suits its counter.
 * No business type's figure is suggested (UX-082), and on a phone it keeps
 * to one line of words so it doesn't take the screen.
 * "Change it" opens the setting; someone who can't change it is told who
 * can. Dismissed for the storefront, for everyone who works there.
 */
export function LateRuleNoticeCard({
    notice,
    canChange,
}: {
    notice: LateRuleNotice;
    canChange: boolean;
}) {
    const [gone, setGone] = useState(false);
    const [pending, start] = useTransition();
    if (gone) return null;

    const dismiss = () => {
        setGone(true);
        start(async () => {
            const res = await dismissLateRuleNotice(notice.storeId);
            if (!res.ok) {
                setGone(false);
                showError(res.error);
            }
        });
    };

    return (
        <Notice tone="info" role="note" className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex-[1_1_260px] text-pretty text-[13px] text-foreground">
                    <strong className="font-semibold">
                        Pick-up orders at {notice.name} now count as late after{" "}
                        {lateAfterWords(notice.pickupLateAfterMinutes)}.
                    </strong>{" "}
                    <span className="max-sm:hidden">
                        Set it to what suits your counter.
                    </span>
                </span>
                {canChange ? (
                    <Button
                        asChild
                        variant="outline"
                        className="h-[30px] rounded-[8px] border-border-strong px-[11px] text-[12.5px] font-semibold coarse:h-11"
                    >
                        <Link
                            href={`${storefrontHref(notice.storeId, "delivery")}#${LATE_AFTER_ANCHOR}`}
                        >
                            Change it
                        </Link>
                    </Button>
                ) : (
                    <span className="text-[12px] text-muted-foreground">
                        An owner or admin can change it in Locations.
                    </span>
                )}
                <IconButton
                    label={`Dismiss this notice for ${notice.name}`}
                    icon={<X />}
                    variant="ghost"
                    disabled={pending}
                    onClick={dismiss}
                />
            </div>
        </Notice>
    );
}
