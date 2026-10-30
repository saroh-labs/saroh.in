"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Textarea } from "@saroh/ui/textarea";
import { useId, useState } from "react";

import { count, plural } from "@/lib/format/plural";
import type {
    PagesRead,
    ReviewerVerdict,
    ReviewState,
} from "@/lib/sites/service";
import { Field } from "@saroh/ui/field";

/**
 * Who a Reviewer answers to, for "Send to Asha" (DEC-200): whoever asked for
 * the review, or "the owner" when nobody has.
 */
export function reviewOwner(review: ReviewState): string {
    return review.request?.by ?? "the owner";
}

/** "the owner" at the start of a sentence. */
export function sentenceStart(words: string): string {
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** You approved, and nobody has asked again since (RVD4). */
export function youApproved(review: ReviewState): boolean {
    return review.yourVerdict?.outcome === "APPROVED" && !review.pending;
}

/** One of your open notes, as the Ask for changes popover lists it. */
export interface OpenNoteLine {
    id: string;
    /** "Home · Opening section". */
    where: string;
    body: string;
}

/** The API's own floor and cap on a reason (`CreateApprovalDto.reason`). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** What is wrong with a reason as typed, or null when it can be sent. */
export function reasonProblem(reason: string): string | null {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) return "Say what needs changing.";
    if (trimmed.length > REASON_MAX) return "Keep it under 500 characters.";
    return null;
}

/**
 * Approve, or Ask for changes with a short reason (UX-043).
 *
 * "Ask for changes" no longer records on the press: it opens a field for
 * what needs changing, because the person whose work it is can't act on a
 * bare "changes requested". `onRecord` resolves true when the verdict was
 * recorded, which closes the field.
 */
export function VerdictControls({
    onRecord,
    recording,
    compact = false,
}: {
    onRecord: (outcome: ReviewerVerdict, reason?: string) => Promise<boolean>;
    recording: boolean;
    /** The editor's rail: small buttons sharing one row. */
    compact?: boolean;
}) {
    const [asking, setAsking] = useState(false);
    const [reason, setReason] = useState("");
    const [problem, setProblem] = useState<string | null>(null);
    const fieldId = useId();
    const size = compact ? "sm" : "default";

    async function send() {
        const wrong = reasonProblem(reason);
        setProblem(wrong);
        if (wrong) return;
        if (await onRecord("CHANGES_REQUESTED", reason.trim())) {
            setAsking(false);
            setReason("");
        }
    }

    if (asking) {
        return (
            <div className="grid w-full gap-2">
                <Field label="What needs changing?" error={problem}>
                    <Textarea
                        id={fieldId}
                        value={reason}
                        rows={3}
                        maxLength={REASON_MAX}
                        autoFocus
                        onChange={(e) => {
                            setReason(e.target.value);
                            if (problem) setProblem(null);
                        }}
                        placeholder="The opening hours on Home are last season's."
                    />
                </Field>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        size={size}
                        onClick={() => void send()}
                        busy={recording}
                        busyLabel="Sending…"
                    >
                        Ask for changes
                    </Button>
                    <Button
                        type="button"
                        size={size}
                        variant="ghost"
                        disabled={recording}
                        onClick={() => {
                            setAsking(false);
                            setProblem(null);
                        }}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Button
                type="button"
                size={size}
                variant="outline"
                className={cn(compact && "flex-1")}
                disabled={recording}
                onClick={() => void onRecord("APPROVED")}
            >
                Approve
            </Button>
            <Button
                type="button"
                size={size}
                variant="outline"
                className={cn(compact && "flex-1")}
                disabled={recording}
                onClick={() => setAsking(true)}
            >
                Ask for changes
            </Button>
        </>
    );
}

/**
 * A Reviewer's verdict in the editor's top bar (DEC-200, RVD1/RVD3): Ask for
 * changes, then Approve, always in that order. The fill moves, not the
 * buttons: with open notes of your own, Ask for changes is the answer and
 * leads; with none, Approve does. Ask for changes opens a popover with the
 * reason (UX-043, the same rules as `VerdictControls`) and the notes that go
 * with it. After you approve, one button: Change your review.
 *
 * The reason lives here, not in the popover, so closing it, a failed send or
 * a failed re-read never loses what was typed.
 */
export function TopBarVerdict({
    owner,
    openNotes,
    approved,
    pagesRead,
    recording,
    onRecord,
}: {
    /** Who asked for the review, or "the owner". */
    owner: string;
    /** Your own open notes on the draft. */
    openNotes: OpenNoteLine[];
    approved: boolean;
    pagesRead: PagesRead | null | undefined;
    recording: boolean;
    onRecord: (outcome: ReviewerVerdict, reason?: string) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    const [changing, setChanging] = useState(false);
    const [reason, setReason] = useState("");
    const [problem, setProblem] = useState<string | null>(null);
    const fieldId = useId();
    const askLeads = openNotes.length > 0;

    async function send() {
        const wrong = reasonProblem(reason);
        setProblem(wrong);
        if (wrong) return;
        if (await onRecord("CHANGES_REQUESTED", reason.trim())) {
            setOpen(false);
            setReason("");
            setChanging(false);
        }
    }

    async function approve() {
        if (await onRecord("APPROVED")) setChanging(false);
    }

    const read =
        pagesRead && pagesRead.total > 0 ? (
            <span
                data-pages-read=""
                className="whitespace-nowrap text-[0.75rem] tabular-nums text-muted-foreground"
            >
                You&rsquo;ve read {pagesRead.read} of{" "}
                {count(pagesRead.total, "page")}
            </span>
        ) : null;

    if (approved && !changing) {
        return (
            <div className="flex shrink-0 items-center gap-2">
                {read}
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setChanging(true)}
                >
                    Change your review
                </Button>
            </div>
        );
    }

    return (
        <div className="flex shrink-0 items-center gap-2">
            {read}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant={askLeads ? "default" : "outline"}
                        disabled={recording}
                    >
                        Ask for changes
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    sideOffset={6}
                    aria-label="Ask for changes"
                    className="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
                >
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send();
                        }}
                    >
                        <p className="border-b px-4 py-3 text-sm font-semibold">
                            Ask {owner} for changes
                        </p>
                        <div className="grid gap-3 px-4 py-3">
                            <Field label="What needs changing?" error={problem}>
                                <Textarea
                                    id={fieldId}
                                    value={reason}
                                    rows={3}
                                    maxLength={REASON_MAX}
                                    autoFocus
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        if (problem) setProblem(null);
                                    }}
                                />
                            </Field>
                            {openNotes.length > 0 ? (
                                <div>
                                    <p className="text-[0.78125rem] text-muted-foreground">
                                        Your{" "}
                                        {count(openNotes.length, "open note")}{" "}
                                        {plural(openNotes.length, "goes", "go")}{" "}
                                        with it:
                                    </p>
                                    <ul className="mt-1.5 grid gap-1 text-[0.78125rem] leading-snug">
                                        {openNotes.map((n) => (
                                            <li key={n.id} className="truncate">
                                                <span className="font-semibold">
                                                    {n.where}
                                                </span>{" "}
                                                · {n.body}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
                                Approving doesn&rsquo;t publish.{" "}
                                {sentenceStart(owner)} decides when it goes
                                live.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={recording}
                                onClick={() => {
                                    setOpen(false);
                                    setProblem(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                busy={recording}
                                busyLabel="Sending…"
                            >
                                Send to {owner}
                            </Button>
                        </div>
                    </form>
                </PopoverContent>
            </Popover>
            <Button
                type="button"
                size="sm"
                variant={askLeads ? "outline" : "default"}
                disabled={recording}
                onClick={() => void approve()}
            >
                Approve
            </Button>
        </div>
    );
}
