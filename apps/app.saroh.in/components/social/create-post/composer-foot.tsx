"use client";

import { Notice } from "@saroh/ui/notice";
import { useState } from "react";

import {
    DeskSchedule,
    ScheduleButton,
    SocialOffer,
} from "@/components/shared/share-item/schedule-lock";
import type { ShareParts } from "@/components/shared/share-item/share-actions";
import {
    ShareNowButton,
    ShareNowMenu,
} from "@/components/shared/share-item/share-actions";
import type { ScheduleLock } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

/**
 * Create post's foot (SFCLocked*, SGOwn*): Schedule, locked until Saroh
 * Social, and Share now, which works on every plan. Pinned to the bottom
 * of the screen, under the thumb on a phone.
 */
export function ComposerFoot({
    parts,
    lock,
    narrow,
    note,
}: {
    parts: ShareParts;
    lock: ScheduleLock;
    narrow: boolean;
    /** What the desk's foot says on its left: one quiet line. */
    note?: React.ReactNode;
}) {
    const [offer, setOffer] = useState(false);
    const [copied, setCopied] = useState(false);
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background px-4 py-3 sm:-mx-[26px] sm:px-[26px]">
            {narrow ? (
                <div className="grid gap-2">
                    {copied ? (
                        <Notice tone="success">{SHARE_WORDS.pasteIt}</Notice>
                    ) : null}
                    {offer ? (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <SocialOffer
                                lock={lock}
                                onClose={() => setOffer(false)}
                            />
                        </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                        <ScheduleButton
                            aria-expanded={offer}
                            onClick={() => setOffer((o) => !o)}
                        />
                        <ShareNowButton
                            {...parts}
                            onCopied={() => setCopied(true)}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
                        {note}
                    </div>
                    <DeskSchedule
                        lock={lock}
                        open={offer}
                        onOpenChange={setOffer}
                    />
                    <ShareNowMenu {...parts} />
                </div>
            )}
        </div>
    );
}
