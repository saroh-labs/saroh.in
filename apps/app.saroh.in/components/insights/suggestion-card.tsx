"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import { showError, showUndo, showWarning } from "@saroh/ui/toast";
import { Lightbulb } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { useHold } from "@/components/shared/use-hold";
import type { SourceRead } from "@/lib/analytics/takings";
import { runAction } from "@/lib/api/run-action";
import type { Suggestion, SuggestionsRead } from "@/lib/insights/reads";
import {
    bringBackSuggestion,
    putOffSuggestion,
} from "@/lib/insights/suggestion-actions";
import type { SuggestionWords } from "@/lib/insights/suggestion-words";
import {
    MONEY_SUGGESTIONS_HIDDEN,
    NOT_NOW_DONE,
    NOTHING_TO_SUGGEST,
    placeLine,
    SUGGESTION_HEADING,
    suggestionWords,
    whenSuggestionsShow,
} from "@/lib/insights/suggestion-words";
import { remindWithLink } from "@/lib/invoices/link-actions";
import { sendOutcome } from "@/lib/invoices/send";
import type { ShareLink } from "@/lib/sites/share-links";

/**
 * Insights' "What to do next" (DEC-171, plan U11, #1091): one suggestion at
 * a time, "1 of 3", its button, Next suggestion, Not now and why it is
 * there. Boards `IBOverviewD`/`P`, `IBNextD`, `IBNotNowD`, `IBNoSuggD`,
 * `IBNoSalesD`, `IBMemberD`, `IBFailedD`.
 *
 * - Not now hides it for this person for 7 days (the API keeps it), with
 *   Undo on the toast, which brings it back where it was.
 * - Send reminder tells a customer, so it waits ten seconds with Undo
 *   (`useHold.send`), as every reminder does.
 * - None left: one quiet line says when suggestions show up.
 * - A role without payments is told money suggestions are not theirs.
 * - The read failed: the card says so by name, with Try again; the rest of
 *   the Overview is drawn as usual.
 */
export function SuggestionCard({
    read,
    share,
}: {
    read: SourceRead<SuggestionsRead> | null;
    /** The live shop (else website) link the first-sale suggestion copies. */
    share: ShareLink | null;
}) {
    if (!read || read.status === "denied") return null;
    if (read.status === "failed") {
        return (
            <div data-testid="insights-suggestion">
                <FailedRead things="suggestions" />
            </div>
        );
    }
    return <Suggestions read={read.data} share={share} />;
}

function Suggestions({
    read,
    share,
}: {
    read: SuggestionsRead;
    share: ShareLink | null;
}) {
    const [list, setList] = useState<Suggestion[]>(read.suggestions);
    const [index, setIndex] = useState(0);
    const [busy, setBusy] = useState(false);
    const [reminded, setReminded] = useState<ReadonlySet<string>>(new Set());
    const heading = useRef<HTMLElement>(null);
    // After Not now the button pressed may be gone: focus the card's name.
    const refocus = useRef(false);
    const { send, pending } = useHold();

    // The page was read again: what it says now stands.
    const [drawn, setDrawn] = useState(read.suggestions);
    if (drawn !== read.suggestions) {
        setDrawn(read.suggestions);
        setList(read.suggestions);
        setIndex(0);
    }

    useEffect(() => {
        if (!refocus.current) return;
        refocus.current = false;
        heading.current?.focus();
    }, [list]);

    const moneyLine = read.money ? null : (
        <p
            data-ph-unmask=""
            className="text-xs leading-[1.5] text-muted-foreground"
        >
            {MONEY_SUGGESTIONS_HIDDEN}
        </p>
    );

    if (list.length === 0) {
        return (
            <div
                className="flex flex-col gap-2"
                data-testid="insights-suggestion"
            >
                <section
                    aria-labelledby="suggestion-none"
                    data-ph-unmask=""
                    className="flex items-start gap-2.5 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-[13.5px] leading-[1.5] text-muted-foreground"
                >
                    <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <p>
                        <b
                            id="suggestion-none"
                            ref={heading}
                            tabIndex={-1}
                            className="font-semibold text-foreground outline-none"
                        >
                            {NOTHING_TO_SUGGEST}
                        </b>{" "}
                        {whenSuggestionsShow(read.money)}
                    </p>
                </section>
                {moneyLine}
            </div>
        );
    }

    const at = Math.min(index, list.length - 1);
    const suggestion = list[at];
    const words = suggestionWords(suggestion, { period: read.period, share });

    async function notNow() {
        const key = suggestion.key;
        const was = at;
        const res = await runAction(() => putOffSuggestion(key), { setBusy });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setList((all) => all.filter((s) => s.key !== key));
        setIndex((i) => (i >= list.length - 1 ? 0 : i));
        refocus.current = true;
        showUndo(NOT_NOW_DONE, async () => {
            const back = await bringBackSuggestion(key);
            if (back.ok) {
                setList((all) => {
                    if (all.some((s) => s.key === key)) return all;
                    const next = [...all];
                    next.splice(Math.min(was, next.length), 0, suggestion);
                    return next;
                });
                setIndex(was);
            }
            return back;
        });
    }

    function remind(action: { invoiceId: string; person: string }) {
        const key = suggestion.key;
        let said = "";
        send(`remind:${key}`, {
            run: async () => {
                const res = await remindWithLink(action.invoiceId);
                if (!res.ok) return { ok: false, error: res.error };
                const outcome = sendOutcome(res.data, action.person, true);
                if (!outcome.ok) {
                    // Not emailed: they turned email off. Said once, here.
                    showWarning(outcome.message);
                    return { ok: false, error: outcome.message, said: true };
                }
                said = outcome.message;
                return { ok: true };
            },
            sent: () => said,
            onSent: () => setReminded((keys) => new Set(keys).add(key)),
        });
    }

    return (
        <div className="flex flex-col gap-2" data-testid="insights-suggestion">
            <section
                aria-labelledby="suggestion-heading"
                className="grid gap-2 rounded-[14px] bg-brand-surface px-5 py-[18px] text-brand-surface-foreground max-sm:p-4"
            >
                <div className="flex items-center gap-2">
                    <span
                        aria-hidden
                        className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-brand-surface-foreground/10 text-highlight"
                    >
                        <Lightbulb className="size-[18px]" />
                    </span>
                    <h2
                        id="suggestion-heading"
                        ref={heading as RefObject<HTMLHeadingElement>}
                        tabIndex={-1}
                        data-ph-unmask=""
                        className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-surface-foreground/85 outline-none"
                    >
                        {SUGGESTION_HEADING}
                    </h2>
                    {list.length > 1 ? (
                        <span
                            data-ph-unmask=""
                            data-testid="suggestion-place"
                            className="ml-auto text-xs tabular-nums text-brand-surface-foreground/70"
                        >
                            {placeLine(at, list.length)}
                        </span>
                    ) : null}
                </div>
                <div aria-live="polite" className="grid gap-2">
                    <p
                        {...(words.masked
                            ? { "data-ph-mask": "" }
                            : { "data-ph-unmask": "" })}
                        data-testid="suggestion-title"
                        className="mt-0.5 text-pretty font-display text-[20px] font-semibold leading-[1.3] tracking-[-0.02em]"
                    >
                        {words.title}
                    </p>
                    <p
                        {...(words.masked
                            ? { "data-ph-mask": "" }
                            : { "data-ph-unmask": "" })}
                        className="max-w-[680px] text-[13.5px] leading-[1.5] text-brand-surface-foreground/85"
                    >
                        {words.why}
                    </p>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <SuggestionAction
                        words={words}
                        sending={pending.includes(`remind:${suggestion.key}`)}
                        reminded={reminded.has(suggestion.key)}
                        onRemind={remind}
                    />
                    {list.length > 1 ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={OUTLINE}
                            onClick={() => setIndex((at + 1) % list.length)}
                        >
                            Next suggestion
                        </Button>
                    ) : null}
                    {suggestion.dismissible ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            className={QUIET}
                            onClick={() => void notNow()}
                        >
                            Not now
                        </Button>
                    ) : null}
                </div>
                {words.rule ? (
                    <p
                        data-ph-unmask=""
                        className="mt-1 text-xs text-brand-surface-foreground/65"
                    >
                        {words.rule}
                    </p>
                ) : null}
            </section>
            {moneyLine}
        </div>
    );
}

/** The light button on the dark card: its one main action. */
const MAIN =
    "border border-brand-surface-foreground bg-brand-surface-foreground text-brand-surface hover:bg-brand-surface-foreground/90 active:bg-brand-surface-foreground/80";

/** The outlined button on the dark card. */
const OUTLINE =
    "border-brand-surface-foreground/40 bg-transparent text-brand-surface-foreground hover:border-brand-surface-foreground hover:bg-brand-surface-foreground/10 hover:text-brand-surface-foreground active:bg-brand-surface-foreground/15";

/** Not now: a quiet link on the dark card. */
const QUIET =
    "px-2 text-brand-surface-foreground/80 underline decoration-brand-surface-foreground/40 underline-offset-4 hover:bg-brand-surface-foreground/10 hover:text-brand-surface-foreground hover:decoration-brand-surface-foreground";

function SuggestionAction({
    words,
    sending,
    reminded,
    onRemind,
}: {
    words: SuggestionWords;
    sending: boolean;
    reminded: boolean;
    onRemind: (action: { invoiceId: string; person: string }) => void;
}) {
    const action = words.action;
    switch (action.kind) {
        case "copy":
            return (
                <CopyButton
                    value={action.url}
                    label={action.label}
                    icon={false}
                    variant="default"
                    size="sm"
                    className={MAIN}
                />
            );
        case "remind":
            return (
                <Button
                    type="button"
                    size="sm"
                    disabled={sending || reminded}
                    className={MAIN}
                    onClick={() => onRemind(action)}
                >
                    {reminded ? "Reminder sent" : action.label}
                </Button>
            );
        case "link":
            return (
                <Button asChild size="sm" className={MAIN}>
                    <Link href={action.href}>{action.label}</Link>
                </Button>
            );
    }
}
