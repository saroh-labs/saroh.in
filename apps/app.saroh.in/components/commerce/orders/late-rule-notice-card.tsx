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

/**
 * One storefront's one-time notice on Orders (plan B, B17): pick-up orders
 * now count as late after 2 hours, where a counter may want 20 minutes.
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
        <div
            role="note"
            className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-highlight bg-brand-subtle px-[13px] py-2.5"
        >
            <span className="flex-[1_1_260px] text-pretty text-[13px] text-brand-subtle-foreground">
                <strong className="font-semibold">
                    Pick-up orders at {notice.name} now count as late after{" "}
                    {lateAfterWords(notice.pickupLateAfterMinutes)}.
                </strong>{" "}
                A café counter often uses 20 minutes.
            </span>
            {canChange ? (
                <Button
                    asChild
                    variant="outline"
                    className="h-[30px] rounded-[8px] border-highlight px-[11px] text-[12.5px] font-semibold coarse:h-11"
                >
                    <Link
                        href={`${storefrontHref(notice.storeId)}#${LATE_AFTER_ANCHOR}`}
                    >
                        Change it
                    </Link>
                </Button>
            ) : (
                <span className="text-[12px] text-muted-foreground">
                    An owner or admin can change it in Locations.
                </span>
            )}
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={dismiss}
                aria-label={`Dismiss this notice for ${notice.name}`}
                className="size-[30px] text-brand-subtle-foreground coarse:size-11"
            >
                <X aria-hidden className="size-4" />
            </Button>
        </div>
    );
}
