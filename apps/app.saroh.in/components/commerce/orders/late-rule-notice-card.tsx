"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { showError } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { LATE_AFTER_ANCHOR } from "@/components/stores/delivery/fulfilment-section";
import { runAction } from "@/lib/api/run-action";
import { lateAfterWords } from "@/lib/stores/late-after";
import { storefrontHref } from "@/lib/stores/links";
import { dismissLateRuleNotice } from "@/lib/stores/storefront-actions";
import type { LateRuleNotice } from "@/lib/stores/storefronts";
import { IconButton } from "@saroh/ui/icon-button";
import { Notice } from "@saroh/ui/notice";

/**
 * The one notice on Orders (plan B, B17; finding 9): pick-up orders now
 * count as late after 2 hours at these storefronts; a business sets what
 * suits its counter. No business type's figure is suggested (UX-082), and
 * on a phone it keeps to one line of words so it doesn't take the screen.
 * Shown only to someone who can change it (`LateRuleNotice`). "Change it"
 * opens the setting (Locations, with several). Dismissed for every
 * storefront named, for everyone who works there.
 */
export function LateRuleNoticeCard({
    notices,
}: {
    notices: readonly LateRuleNotice[];
}) {
    const [gone, setGone] = useState(false);
    const [pending, start] = useTransition();
    const first = notices.at(0);
    if (gone || !first) return null;
    const one = notices.length === 1;
    // "Hill Road and Bandra": every location it is about, by name.
    const places = new Intl.ListFormat("en-GB", {
        type: "conjunction",
    }).format(notices.map((n) => n.name));

    const dismiss = () => {
        setGone(true);
        start(async () => {
            for (const n of notices) {
                const res = await runAction(() =>
                    dismissLateRuleNotice(n.storeId),
                );
                if (res?.ok) continue;
                setGone(false);
                if (res) showError(res.error);
                return;
            }
        });
    };

    return (
        // The words on the left; what to do about them on the right, level
        // with the words. On a phone the buttons go under the words.
        <Notice
            tone="info"
            role="note"
            className="mb-4"
            align="center"
            action={
                <>
                    <Button
                        size="sm"
                        asChild
                        variant="outline"
                        className="border-border-strong"
                    >
                        <IntentLink
                            href={
                                one
                                    ? `${storefrontHref(first.storeId, "delivery")}#${LATE_AFTER_ANCHOR}`
                                    : "/commerce/locations"
                            }
                        >
                            Change it
                        </IntentLink>
                    </Button>
                    <IconButton
                        label="Dismiss this notice"
                        icon={<X />}
                        variant="ghost"
                        disabled={pending}
                        onClick={dismiss}
                    />
                </>
            }
        >
            <p className="text-pretty text-[13px] text-foreground">
                <strong className="font-semibold">
                    Pick-up orders at {places} now count as late after{" "}
                    {lateAfterWords(first.pickupLateAfterMinutes)}.
                </strong>{" "}
                <span data-ph-unmask="" className="max-sm:hidden">
                    Set it to what suits your counter.
                </span>
            </p>
        </Notice>
    );
}
