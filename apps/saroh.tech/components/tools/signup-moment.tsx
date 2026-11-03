"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { useCallback, useEffect, useState } from "react";

import { buttonClass, ButtonLink } from "@/components/shared/button";
import { track } from "@/lib/analytics";
import { firstSignupMoment } from "@/lib/tools/draft-store";
import type { Handoff } from "@/lib/tools/handoff";
import { importHref } from "@/lib/tools/handoff";
import { setHeaderStart } from "@/lib/tools/header-start";

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
export function useSignupMoment(handoff: Handoff) {
    const [done, setDone] = useState(false);
    const [sheet, setSheet] = useState<string | null>(null);
    const tool = handoff.tool;

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

    const href = done ? importHref(handoff) : null;
    useEffect(() => {
        setHeaderStart(href);
        return () => setHeaderStart(null);
    }, [href]);

    return { done, sheet, closeSheet: () => setSheet(null), finished };
}

const started = (tool: string) => () => track("signup_started", { tool });

export function NextStepCard({
    copy,
    handoff,
    done,
}: {
    copy: MomentCopy;
    handoff: Handoff;
    done: boolean;
}) {
    if (!done && !copy.quiet) return null;
    const href = importHref(handoff);
    const onClick = started(handoff.tool);
    if (!done && copy.quiet) {
        return (
            <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4 md:px-[22px] md:py-5">
                <b className="text-[15.5px]">{copy.quiet.title}</b>
                <span className="text-[15px] leading-normal text-body">
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
        <div className="flex flex-col gap-2.5 rounded-card border border-ink bg-surface px-[22px] py-5">
            <span className="font-display text-[22px] font-bold tracking-[-0.03em]">
                {copy.cardTitle}
            </span>
            <span className="text-[15px] leading-normal text-body">
                {copy.cardLine}
            </span>
            <div className="flex flex-wrap items-center gap-3.5">
                <ButtonLink href={href} onClick={onClick}>
                    {copy.action}
                </ButtonLink>
                <span className="text-[13px] text-quiet">{copy.hint}</span>
            </div>
        </div>
    );
}

export function SignupSheet({
    copy,
    handoff,
    done,
    onClose,
}: {
    copy: MomentCopy;
    handoff: Handoff;
    /** "INV-0007.pdf downloaded"; null when closed. */
    done: string | null;
    onClose: () => void;
}) {
    const onClick = started(handoff.tool);
    return (
        <Dialog open={done !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex flex-col gap-4 bg-paper font-sans text-ink">
                <span className="pr-10 text-sm text-body">✓ {done}</span>
                <DialogTitle className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.04em]">
                    {copy.sheetTitle}
                </DialogTitle>
                <DialogDescription asChild>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15.5px] leading-normal text-ink">
                        {copy.sheetLines.map((l) => (
                            <li key={l} className="flex gap-2.5">
                                <span aria-hidden="true">✓</span>
                                <span>{l}</span>
                            </li>
                        ))}
                    </ul>
                </DialogDescription>
                <div className="flex flex-col gap-2.5 pt-1">
                    <a
                        href={importHref(handoff, "google")}
                        onClick={onClick}
                        className={buttonClass("primary", "w-full")}
                    >
                        Continue with Google
                    </a>
                    <a
                        href={importHref(handoff, "apple")}
                        onClick={onClick}
                        className={buttonClass("secondary", "w-full")}
                    >
                        Continue with Apple
                    </a>
                    <a
                        href={importHref(handoff, "email")}
                        onClick={onClick}
                        className="inline-flex min-h-11 items-center justify-center text-[15px] font-semibold"
                    >
                        Use my email instead
                    </a>
                </div>
                <span className="text-center text-[13.5px] leading-snug text-quiet">
                    {copy.sheetNote}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-11 cursor-pointer border-0 bg-transparent text-[15px] text-body underline"
                >
                    Not now
                </button>
            </DialogContent>
        </Dialog>
    );
}
