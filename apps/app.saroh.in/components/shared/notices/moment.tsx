"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { showError } from "@saroh/ui/toast";
import { Megaphone, Plug, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { markMomentSeen } from "@/lib/moments/actions";
import type { MomentKey, MomentView } from "@/lib/moments/keys";

/** A new feature's glyph: the one its own screen and nav use. */
const NEWS_GLYPH: Partial<Record<MomentKey, typeof Plug>> = {
    "new-ai-apps": Plug,
    "new-share": Megaphone,
    "new-ask-ai": Sparkles,
};

/**
 * A moment (wave G): one calm line where the product marks that something
 * good happened for the business. Its first order, its first booking.
 *
 * A `Notice` in the success tone, nothing new to look at: a title, one
 * line holding the real fact (who, how much, when), at most one thing
 * worth doing next, and a way to put it away. Announced politely
 * (`role="status"`); it never takes focus and never blocks the work under
 * it. It fades in over 200ms and stays still under reduced motion.
 *
 * Shown once for the whole business. The screen draws it only while the
 * moment is true and nobody has seen it (`lib/moments/read.ts`); putting it
 * away, or following its action, tells the API, and it is gone for everyone
 * on every device. A refusal brings it back and says why.
 *
 * A new feature (`news`, release visibility U14, board VAHome) uses the
 * same slot and rules in the info tone, its title tagged "New".
 *
 * What it must never be: an exclamation, a celebration, a count of days in
 * a row, a badge, anything that asks to be looked at twice.
 */
export function Moment({
    moment,
    className,
}: {
    moment: MomentView;
    className?: string;
}) {
    const [gone, setGone] = useState(false);
    if (gone) return null;

    const dismiss = async () => {
        setGone(true);
        const res = await runAction(() => markMomentSeen(moment.key));
        if (!res) return setGone(false);
        if (!res.ok) {
            setGone(false);
            showError(res.error);
        }
    };

    // Following the action is seeing it. Said to the API on the way out and
    // not waited for: the order opens at once, and a mark that didn't land
    // only means the line is offered once more.
    const followed = () => {
        void runAction(() => markMomentSeen(moment.key), { quiet: true });
    };

    const NewsGlyph = moment.news ? NEWS_GLYPH[moment.key] : undefined;

    return (
        <Notice
            tone={moment.news ? "info" : "success"}
            role="status"
            data-moment={moment.key}
            // A new feature (board VAHome): its glyph in a tile at the desk,
            // level with one-row words and button. On a phone no tile,
            // Dismiss in the corner and the button full width (44px).
            align={moment.news ? "center" : undefined}
            icon={
                NewsGlyph ? (
                    <span className="-my-1 grid size-8 place-items-center rounded-md bg-card">
                        <NewsGlyph />
                    </span>
                ) : undefined
            }
            // The title is Saroh's own words ("Your first order"), so a
            // session recording may read it. The fact under it names a
            // customer and an amount, and stays masked.
            title={
                // Clear of Dismiss, in the corner on a phone.
                <span
                    data-ph-unmask=""
                    className={cn(moment.news && "max-sm:block max-sm:pr-9")}
                >
                    {moment.news ? (
                        <span className="mr-2 inline-block rounded-[5px] bg-card px-1.5 align-[1px] text-[11px] font-semibold tracking-[0.04em]">
                            New
                        </span>
                    ) : null}
                    {moment.title}
                </span>
            }
            className={cn(
                "duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none",
                moment.news &&
                    "relative max-sm:[&>div:first-child>span[aria-hidden]]:hidden max-sm:[&>div:last-child]:pl-0",
                className,
            )}
            action={
                <>
                    {moment.action ? (
                        <Button
                            size="sm"
                            asChild
                            variant="outline"
                            className={cn(
                                "border-border-strong coarse:min-h-11",
                                moment.news && "max-sm:h-11 max-sm:w-full",
                            )}
                        >
                            <Link href={moment.action.href} onClick={followed}>
                                {moment.action.label}
                            </Link>
                        </Button>
                    ) : null}
                    <IconButton
                        label="Dismiss"
                        icon={<X />}
                        variant="ghost"
                        className={cn(
                            moment.news &&
                                "max-sm:absolute max-sm:right-1 max-sm:top-1 max-sm:size-11",
                        )}
                        onClick={() => void dismiss()}
                    />
                </>
            }
        >
            {/* A new feature's line is Saroh's own words too. */}
            <p data-ph-unmask={moment.news ? "" : undefined}>{moment.fact}</p>
        </Notice>
    );
}
