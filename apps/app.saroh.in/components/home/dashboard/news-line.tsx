"use client";

import { IconButton } from "@saroh/ui/icon-button";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { showError } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useState } from "react";

import { NEWS_GLYPH } from "@/components/shared/notices/moment";
import { runAction } from "@/lib/api/run-action";
import { markMomentSeen } from "@/lib/moments/actions";
import type { MomentView } from "@/lib/moments/keys";

/**
 * Home's news, under the work as one line (HPHomeDesk, HPHomeNotes): "New:
 * use Saroh from Claude or ChatGPT · Connect · ×". The same moment and the
 * same rules as `Moment` (seen once for the whole business; following it
 * or putting it away tells the API), only quieter and below Needs you.
 * Home holds it back while any order is more than 3 days late
 * (`holdsNews`).
 */
export function NewsLine({ moment }: { moment: MomentView }) {
    const [gone, setGone] = useState(false);
    if (gone) return null;

    const seen = async () => {
        setGone(true);
        const res = await runAction(() => markMomentSeen(moment.key));
        if (res?.ok) return;
        setGone(false);
        if (res) showError(res.error);
    };
    const Glyph = NEWS_GLYPH[moment.key];
    const title = moment.title.charAt(0).toLowerCase() + moment.title.slice(1);

    return (
        <Notice
            tone="info"
            role="status"
            align="center"
            data-moment={moment.key}
            data-ph-unmask=""
            icon={Glyph ? <Glyph /> : undefined}
            className="duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none"
            action={
                <>
                    {moment.action ? (
                        <TextLink
                            href={moment.action.href}
                            onClick={() =>
                                void runAction(
                                    () => markMomentSeen(moment.key),
                                    { quiet: true },
                                )
                            }
                            className="font-semibold coarse:min-h-11"
                        >
                            {moment.action.label}
                        </TextLink>
                    ) : null}
                    <IconButton
                        label="Dismiss"
                        icon={<X />}
                        variant="ghost"
                        onClick={() => void seen()}
                    />
                </>
            }
        >
            <p className="text-pretty">
                <b className="font-semibold">New:</b> {title}
            </p>
        </Notice>
    );
}
