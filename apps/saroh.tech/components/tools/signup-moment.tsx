"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { useCallback, useState } from "react";

import { buttonClass, ButtonLink } from "@/components/shared/button";
import { track } from "@/lib/analytics";
import { firstSignupMoment } from "@/lib/tools/draft-store";
import { signupHref } from "@/site.config";

export interface MomentCopy {
    /** "Downloaded. Want to send it and get paid?" on a desk. */
    cardTitle: string;
    /** "Want to send it and get paid?" in the phone's sheet. */
    sheetTitle: string;
    cardLine: string;
    sheetLines: readonly string[];
    sheetNote: string;
    action: string;
    hint: string;
    /** A card that's there before any download, on a tool whose board has one. */
    quiet?: { title: string; line: string; link: string };
}

/**
 * The one sign-up ask: after the job is done, once, never on arrival. A phone
 * gets a bottom sheet and a desk the card under the button; after that, only
 * the quiet card and the header's button.
 */
export function useSignupMoment(tool: string) {
    const [done, setDone] = useState(false);
    const [sheet, setSheet] = useState<string | null>(null);

    const finished = useCallback(
        (what: string) => {
            setDone(true);
            if (!firstSignupMoment()) return;
            track("signup_moment_shown", { tool });
            if (window.matchMedia("(max-width: 1023px)").matches)
                setSheet(what);
        },
        [tool],
    );

    return { done, sheet, closeSheet: () => setSheet(null), finished };
}

const started = (tool: string) => () => track("signup_started", { tool });
const hrefFor = (tool: string) => signupHref("tool", { tool });

export function NextStepCard({
    copy,
    tool,
    done,
}: {
    copy: MomentCopy;
    tool: string;
    done: boolean;
}) {
    if (!done && !copy.quiet) return null;
    const href = hrefFor(tool);
    const onClick = started(tool);
    if (!done && copy.quiet) {
        return (
            <div className="flex flex-col gap-1.5 rounded-mk-card border border-border bg-card p-4 md:px-[22px] md:py-5">
                <b className="text-[15.5px]">{copy.quiet.title}</b>
                <span className="text-[15px] leading-normal text-mk-copy">
                    {copy.quiet.line}
                </span>
                <a
                    href={href}
                    onClick={onClick}
                    className="inline-flex min-h-11 items-center font-semibold md:min-h-0"
                >
                    {copy.quiet.link}
                </a>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2.5 rounded-mk-card border border-foreground bg-card px-[22px] py-5">
            <span className="font-display text-mk-card-lg font-bold [text-wrap:balance]">
                {copy.cardTitle}
            </span>
            <span className="text-[15px] leading-normal text-mk-copy">
                {copy.cardLine}
            </span>
            <div className="flex flex-wrap items-center gap-3.5">
                <ButtonLink href={href} onClick={onClick}>
                    {copy.action}
                </ButtonLink>
                <span className="text-[13px] text-muted-foreground">
                    {copy.hint}
                </span>
            </div>
        </div>
    );
}

export function SignupSheet({
    copy,
    tool,
    done,
    onClose,
}: {
    copy: MomentCopy;
    tool: string;
    /** "INV-0007.pdf downloaded"; null when closed. */
    done: string | null;
    onClose: () => void;
}) {
    return (
        <Dialog open={done !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex flex-col gap-4 bg-background font-sans text-foreground">
                <span className="pr-10 text-sm text-mk-copy">✓ {done}</span>
                <DialogTitle className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                    {copy.sheetTitle}
                </DialogTitle>
                <DialogDescription asChild>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15.5px] leading-normal text-foreground">
                        {copy.sheetLines.map((l) => (
                            <li key={l} className="flex gap-2.5">
                                <span aria-hidden="true">✓</span>
                                <span>{l}</span>
                            </li>
                        ))}
                    </ul>
                </DialogDescription>
                <a
                    href={hrefFor(tool)}
                    onClick={started(tool)}
                    className={buttonClass("primary", "w-full")}
                >
                    {copy.action}
                </a>
                <span className="text-center text-[13.5px] leading-snug text-muted-foreground">
                    {copy.sheetNote}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-11 cursor-pointer border-0 bg-transparent text-[15px] text-mk-copy underline"
                >
                    Not now
                </button>
            </DialogContent>
        </Dialog>
    );
}
