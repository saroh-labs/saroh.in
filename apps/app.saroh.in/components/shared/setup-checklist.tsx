"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { doneOf, ProgressBar } from "@saroh/ui/progress-bar";
import { TextLink } from "@saroh/ui/text-link";
import { showUndo } from "@saroh/ui/toast";
import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

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
                    {doneTitle}
                    {note ? (
                        <span className="font-normal text-muted-foreground">
                            · {note}
                        </span>
                    ) : null}
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
                <span className="text-[12.5px] tabular-nums text-muted-foreground">
                    {count}
                </span>
                {note ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        · {note}
                    </span>
                ) : null}
                {hide && !finished ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            hide.onHide();
                            // The card coming back is its own answer.
                            showUndo(hide.said, () => {
                                hide.onShow();
                            });
                        }}
                        className="ml-auto"
                    >
                        Hide for now
                    </Button>
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
                    <Row key={row.key} row={row} />
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

function Row({ row }: { row: ChecklistRow }) {
    // A button says what it does ("Add address"). Which step it is for is
    // its description, so two "Write" buttons are told apart.
    const labelId = useId();
    if (row.done) {
        return (
            <li
                data-step={row.key}
                data-done=""
                className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground"
            >
                <Check
                    aria-hidden
                    className="size-4 shrink-0 text-success-subtle-foreground"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="sr-only">Done: </span>
                    {row.label}
                    {row.note ? ` · ${row.note}` : null}
                </span>
                {row.view ? <ViewLink view={row.view} /> : null}
            </li>
        );
    }
    const { action } = row;
    return (
        <li
            data-step={row.key}
            className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1 text-[13px]"
        >
            <span
                aria-hidden
                className={cn(
                    "size-4 shrink-0 rounded-full border-[1.5px]",
                    row.broken ? "border-destructive" : "border-border-strong",
                )}
            />
            <span className="grid min-w-0 flex-[1_1_200px] gap-px">
                <span
                    id={labelId}
                    className="font-medium [overflow-wrap:anywhere]"
                >
                    <span className="sr-only">
                        {row.broken ? "Needs fixing: " : "To do: "}
                    </span>
                    {row.label}
                </span>
                {row.why ? (
                    <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                        {row.why}
                    </span>
                ) : null}
            </span>
            {action ? (
                action.href ? (
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                    >
                        <Link
                            href={action.href}
                            aria-describedby={labelId}
                            // With a press of its own, the link is the
                            // address for a page whose script has not
                            // arrived: the press does it in place.
                            onClick={
                                action.onPress
                                    ? (e) => {
                                          e.preventDefault();
                                          action.onPress?.();
                                      }
                                    : undefined
                            }
                        >
                            {action.label}
                        </Link>
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={action.onPress}
                        aria-describedby={labelId}
                        className="shrink-0"
                    >
                        {action.label}
                    </Button>
                )
            ) : null}
        </li>
    );
}

/** "Your online shop ↗": the live page, in a new tab. */
function ViewLink({ view }: { view: { label: string; href: string } }) {
    return (
        <a
            href={view.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-6 items-center gap-0.5 rounded-sm text-[12.5px] font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground coarse:min-h-11"
        >
            {view.label}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
        </a>
    );
}
