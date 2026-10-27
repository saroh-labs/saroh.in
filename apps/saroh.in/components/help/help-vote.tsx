"use client";

import { useState, useSyncExternalStore } from "react";

import { HELP_EMAIL } from "@/content/help";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { readConsent, subscribeConsent } from "@/lib/consent";

/**
 * "Did this help?" (design 2a), drawn only where the answer is really
 * recorded: once the visitor has accepted analytics and Google Analytics
 * is loaded (`window.gtag`, a production deployment only), each answer is
 * one `help_vote` event with the article's slug and yes or no, nothing
 * else. Everywhere else (refused, not asked yet, previews, local) only the
 * line to write to a person shows: buttons that record nothing would be a
 * promise the page can't keep.
 */
export function HelpVote({ slug }: { slug: string }) {
    const recordable = useSyncExternalStore(
        subscribeConsent,
        () => readConsent() === "granted" && typeof window.gtag === "function",
        () => false,
    );
    const [vote, setVote] = useState<"yes" | "no" | null>(null);
    const email = (
        <a
            href={`mailto:${HELP_EMAIL}`}
            className="cursor-pointer rounded-sm font-semibold text-brand-700 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
        >
            {HELP_EMAIL}
        </a>
    );

    if (!recordable) {
        return (
            <p className="m-0 border-t border-border pt-6 text-mk-faq text-mk-copy">
                Something missing or wrong? Write to {email} and a person will
                answer.
            </p>
        );
    }

    const answer = (v: "yes" | "no") => {
        setVote(v);
        track("help_vote", { article: slug, helpful: v });
    };
    const button = (v: "yes" | "no", label: string) => (
        <button
            type="button"
            aria-pressed={vote === v}
            onClick={() => answer(v)}
            disabled={vote !== null}
            className={cn(
                "h-9 cursor-pointer rounded-mk-control border border-border-strong bg-card px-4 text-[14.5px] font-semibold text-foreground transition-colors duration-fast ease-out hover:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:bg-mk-line-soft disabled:cursor-default disabled:hover:bg-card",
                vote === v &&
                    "border-foreground bg-foreground text-background disabled:hover:bg-foreground",
            )}
        >
            {label}
        </button>
    );
    return (
        <div className="grid gap-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-mk-faq font-semibold">
                    Did this help?
                </span>
                {button("yes", "Yes")}
                {button("no", "No")}
            </div>
            <p role="status" className="m-0 text-mk-faq text-mk-copy">
                {vote === "yes" ? (
                    "Thanks. Glad it did."
                ) : vote === "no" ? (
                    <>Sorry. Write to {email} and tell us what was missing.</>
                ) : null}
            </p>
        </div>
    );
}
