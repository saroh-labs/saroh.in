"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { showError } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { markMomentSeen } from "@/lib/moments/actions";
import type { MomentView } from "@/lib/moments/keys";

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

    return (
        <Notice
            tone="success"
            role="status"
            data-moment={moment.key}
            // The title is Saroh's own words ("Your first order"), so a
            // session recording may read it. The fact under it names a
            // customer and an amount, and stays masked.
            title={<span data-ph-unmask="">{moment.title}</span>}
            className={cn(
                "duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none",
                className,
            )}
            action={
                <>
                    {moment.action ? (
                        <Button
                            size="sm"
                            asChild
                            variant="outline"
                            className="border-border-strong"
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
                        onClick={() => void dismiss()}
                    />
                </>
            }
        >
            <p>{moment.fact}</p>
        </Notice>
    );
}
