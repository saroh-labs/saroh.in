"use client";

import { cn } from "@saroh/ui/lib/utils";
import { doneOf, ProgressBar } from "@saroh/ui/progress-bar";
import { TextLink } from "@saroh/ui/text-link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import {
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { FACT_DOT, joinFacts } from "@/lib/format/join";
import type {
    ChecklistRow,
    FinishedView,
    FoldStage,
} from "@/lib/setup-checklist";
import {
    countRows,
    finishedView,
    nextFoldStage,
    orderRows,
    readFoldStage,
    unreadView,
    writeFoldStage,
} from "@/lib/setup-checklist";

import { ChecklistStep, HideForNow, ViewLink } from "./setup-checklist-row";
import { SetupLine } from "./setup-line";

/**
 * The one setup checklist (UX audit, 10 Oct): Home's and Settings › Business's
 * "Finish setup", a location's, and the website's "Before you share your
 * site" are all this component, each with its own rows.
 *
 * - A title, "2 of 4 done" and a bar.
 * - Rows: done ones first, ticked, then what is left. A row left to do has
 *   ONE button, which opens its task in place where it can (a `?edit=` link
 *   opens the row's sheet; a press opens it on this page).
 * - Finishing: the last tick fills the bar and the heading says the true
 *   thing (`doneTitle`). The card stays for that visit and is one quiet line
 *   on the next, rather than vanishing in the render that finished it.
 * - "Hide for now", where a screen offers it (`hide`), with Undo.
 *
 * What a checklist counts and says is its screen's; how it looks, counts
 * and finishes is here. Its rules are pure in `lib/setup-checklist.ts`.
 */
export function SetupChecklist({
    name,
    title,
    doneTitle,
    lead,
    note,
    rows,
    hide,
    fold = "keep",
    foldKey,
    doneView,
    compact = false,
    children,
    className,
}: {
    /** Which checklist this is: `data-setup-checklist`, for a test. */
    name: string;
    /** While steps are left: "Finish setup". */
    title: string;
    /** Once all are done, as a sentence: "You're ready to take money." */
    doneTitle: string;
    /** One line under the title: what the steps are for. */
    lead?: string;
    /** A fact beside the count ("Sells in person only"). */
    note?: string;
    rows: readonly ChecklistRow[];
    /**
     * "Hide for now": the screen keeps whether it is hidden and for whom.
     * Hidden, the checklist is one link that shows it again.
     */
    hide?: {
        hidden: boolean;
        onHide: () => void;
        onShow: () => void;
        /** Where to find it again, said with Undo. */
        said: string;
    };
    /** After the quiet line: keep it for good, or let it go (Home). */
    fold?: "keep" | "once";
    /**
     * What the finished state is remembered by, in this browser. Absent,
     * it is the quiet line unless the last step was done on this visit.
     */
    foldKey?: string;
    /** A link the quiet line keeps: the live shop. */
    doneView?: { label: string; href: string };
    /**
     * One line while steps are left (Home A, DEC-171, `HAPageD`): the
     * count, the bar, the next step and its button, and "Show the 5 done
     * steps" to open the rest (`setup-line.tsx`).
     */
    compact?: boolean;
    /** Under the rows: what is listed beside the steps and never counted. */
    children?: ReactNode;
    className?: string;
}) {
    const headingId = useId();
    const { done, total, finished } = countRows(rows);
    const count = doneOf(done, total);
    const view = useFinishedView(finished, fold, foldKey);

    if (total === 0) return children ? <>{children}</> : null;

    if (hide?.hidden && !finished) {
        return (
            <TextLink
                onClick={hide.onShow}
                data-setup-checklist={name}
                data-state="hidden"
                className="justify-self-start text-left text-[12.5px] coarse:min-h-11"
            >
                Show setup ({count})
            </TextLink>
        );
    }

    if (compact && !finished) {
        return (
            <SetupLine
                name={name}
                title={title}
                count={count}
                done={done}
                total={total}
                rows={rows}
                hide={hide}
                className={className}
            >
                {children}
            </SetupLine>
        );
    }

    if (finished && view === "gone") {
        return children ? <>{children}</> : null;
    }

    if (finished && view === "folded") {
        return (
            <>
                <p
                    data-setup-checklist={name}
                    data-state="folded"
                    className={cn(
                        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium",
                        className,
                    )}
                >
                    <Check
                        aria-hidden
                        className="size-4 shrink-0 text-success-subtle-foreground"
                    />
                    {/* One run of words: as flex items of their own, the
                        note's dot led its line whenever the row wrapped. */}
                    <span className="min-w-0">
                        {doneTitle}
                        {note ? (
                            <span className="font-normal text-muted-foreground">
                                {FACT_DOT}
                                {note}
                            </span>
                        ) : null}
                    </span>
                    {doneView ? <ViewLink view={doneView} /> : null}
                </p>
                {children}
            </>
        );
    }

    return (
        <section
            aria-labelledby={headingId}
            data-setup-checklist={name}
            data-state={finished ? "finished" : "open"}
            className={cn(
                "grid gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5",
                className,
            )}
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2
                    id={headingId}
                    className="font-display text-[15px] font-semibold tracking-[-0.01em]"
                    // The goal, in Saroh's own fixed words ("Finish setup"):
                    // a session recording may read it. The rows under it
                    // are not marked and stay masked.
                    data-ph-unmask=""
                    // Said when the last step lands, without stealing focus.
                    aria-live={finished ? "polite" : undefined}
                >
                    {finished ? doneTitle : title}
                </h2>
                {/* The count and the fact beside it are one run of words,
                    joined by a dot that is held to both: as a flex item
                    of its own the note began "· Sells in person only",
                    and led its line whenever the heading wrapped. */}
                <span className="min-w-0 text-[12.5px] tabular-nums text-muted-foreground">
                    {joinFacts(count, note)}
                </span>
                {hide && !finished ? (
                    <HideForNow hide={hide} className="ml-auto" />
                ) : null}
            </div>
            {lead && !finished ? (
                <p className="-mt-1 text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                    {lead}
                </p>
            ) : null}
            <ProgressBar
                value={done}
                max={total}
                label={count}
                tone={finished ? "success" : "ink"}
            />
            <ul className="grid gap-1">
                {orderRows(rows).map((row) => (
                    <ChecklistStep key={row.key} row={row} />
                ))}
            </ul>
            {children}
        </section>
    );
}

/** One checklist's answer from the browser, held outside React's state. */
function foldStore() {
    let stage: FoldStage | "unread" = "unread";
    const listeners = new Set<() => void>();
    return {
        get: () => stage,
        set: (next: FoldStage | "unread") => {
            if (next === stage) return;
            stage = next;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

/**
 * Which finished state to draw. Read once when the checklist is (or
 * becomes) finished: the stage this browser is on decides the view for this
 * visit, and the next stage is written for the next one. A checklist that
 * is not finished forgets its stage, so finishing it again is seen again.
 */
function useFinishedView(
    finished: boolean,
    fold: "keep" | "once",
    foldKey: string | undefined,
): FinishedView {
    // What the browser said, once it has been asked. `unread` until then,
    // which is also all the server can say.
    const [seen] = useState(foldStore);
    const stage = useSyncExternalStore(
        seen.subscribe,
        seen.get,
        () => "unread" as const,
    );
    // Steps were left at some point while this was on screen: finishing
    // happened on this visit.
    const [sawOpen, setSawOpen] = useState(!finished);
    if (!finished && !sawOpen) setSawOpen(true);
    const spent = useRef(false);

    useEffect(() => {
        const storage = () => window.localStorage;
        if (!finished) {
            spent.current = false;
            seen.set("unread");
            // Remembered as seen with steps left, so the visit that finds
            // it done shows the bar full, wherever the last step was done.
            if (foldKey) writeFoldStage(storage, foldKey, "open");
            return;
        }
        // Once per finish: reading again (a re-render, or development's
        // second run of an effect) would spend the next visit's stage on
        // this one.
        if (!foldKey || spent.current) return;
        spent.current = true;
        const read = readFoldStage(storage, foldKey);
        seen.set(read);
        writeFoldStage(storage, foldKey, nextFoldStage(read));
    }, [finished, foldKey, seen]);

    if (!finished) return "finished";
    // The last step was done while this was on screen: the card stays.
    if (sawOpen) return "finished";
    if (stage === "unread") return unreadView(fold);
    return finishedView(stage, fold);
}
