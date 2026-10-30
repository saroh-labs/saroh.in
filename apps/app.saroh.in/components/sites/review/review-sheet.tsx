"use client";

import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { Field } from "@saroh/ui/field";
import { FormSheetBody } from "@saroh/ui/form-sheet";
import { Textarea } from "@saroh/ui/textarea";
import { useId, useState } from "react";

import { count, plural } from "@/lib/format/plural";
import type {
    PagesRead,
    ReviewerVerdict,
    ReviewState,
} from "@/lib/sites/service";
import { ReviewerStatus } from "./reviewer-status";
import type { OpenNoteLine } from "./verdict-controls";
import { REASON_MAX, reasonProblem, sentenceStart } from "./verdict-controls";

type Choice = "approve" | "ask";

/**
 * "Your review" on a phone (DEC-200, RVD3Phone and RVD4Phone): the sheet the
 * top bar's Review opens, in place of the desk's two buttons. Where the review
 * stands, how much you've read, then Approve or Ask for changes as two rows,
 * the reason under Ask (the same rules as `TopBarVerdict`), and one Send.
 * After you approve, Change your review brings the choice back.
 */
export function ReviewSheet({
    review,
    loadFailed,
    onRetry,
    onSeeSettled,
    owner,
    openNotes,
    approved,
    pagesRead,
    recording,
    onRecord,
    onDone,
}: {
    review: ReviewState;
    loadFailed: boolean;
    onRetry: () => void;
    onSeeSettled: () => void;
    owner: string;
    /** Your own open notes on the draft. */
    openNotes: OpenNoteLine[];
    approved: boolean;
    pagesRead: PagesRead | null | undefined;
    recording: boolean;
    onRecord: (outcome: ReviewerVerdict, reason?: string) => Promise<boolean>;
    /** Recorded: the sheet closes. */
    onDone: () => void;
}) {
    const notes = openNotes.length;
    // With open notes of your own, Ask for changes is the likely answer.
    const [choice, setChoice] = useState<Choice>(notes > 0 ? "ask" : "approve");
    const [changing, setChanging] = useState(false);
    const [reason, setReason] = useState("");
    const [problem, setProblem] = useState<string | null>(null);
    const fieldId = useId();

    async function send() {
        if (choice === "approve") {
            if (await onRecord("APPROVED")) {
                setChanging(false);
                onDone();
            }
            return;
        }
        const wrong = reasonProblem(reason);
        setProblem(wrong);
        if (wrong) return;
        if (await onRecord("CHANGES_REQUESTED", reason.trim())) {
            setReason("");
            setChanging(false);
            onDone();
        }
    }

    const read = [
        pagesRead && pagesRead.total > 0
            ? `You’ve read ${pagesRead.read} of ${count(pagesRead.total, "page")}`
            : null,
        count(notes, "open note"),
    ]
        .filter(Boolean)
        .join(" · ");

    // The body of the editor's own sheet (`EditorSheet`, which draws the
    // frame): the shared sheet body, laid out as RVD3Phone's column.
    return (
        <FormSheetBody className="mx-0 flex flex-col gap-0 p-0">
            <div className="grid gap-2 px-4 pt-1">
                <ReviewerStatus
                    review={review}
                    loadFailed={loadFailed}
                    onRetry={onRetry}
                    onSeeSettled={onSeeSettled}
                />
                <p
                    data-pages-read=""
                    className="text-[0.78125rem] tabular-nums text-muted-foreground"
                >
                    {read}
                </p>
            </div>
            {approved && !changing ? (
                <div className="mt-auto px-4 pb-4 pt-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full"
                        onClick={() => setChanging(true)}
                    >
                        Change your review
                    </Button>
                </div>
            ) : (
                <form
                    className="flex flex-1 flex-col"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                    }}
                >
                    <div className="grid gap-3 px-4 pt-3">
                        <RadioCards<Choice>
                            label="Your review"
                            value={choice}
                            onChange={(next) => {
                                setChoice(next);
                                setProblem(null);
                            }}
                            disabled={recording}
                            rowClassName="min-h-11"
                            options={[
                                {
                                    value: "approve",
                                    label: "Approve",
                                    note: "It’s ready to go live.",
                                },
                                {
                                    value: "ask",
                                    label: "Ask for changes",
                                    note:
                                        notes > 0
                                            ? `Your ${count(notes, "open note")} ${plural(notes, "goes", "go")} with it.`
                                            : "Say what needs changing.",
                                },
                            ]}
                        />
                        {choice === "ask" ? (
                            <Field label="What needs changing?" error={problem}>
                                <Textarea
                                    id={fieldId}
                                    value={reason}
                                    rows={3}
                                    maxLength={REASON_MAX}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        if (problem) setProblem(null);
                                    }}
                                />
                            </Field>
                        ) : null}
                    </div>
                    <div className="mt-auto px-4 pb-4 pt-3">
                        <Button
                            type="submit"
                            className="h-11 w-full"
                            busy={recording}
                            busyLabel="Sending…"
                        >
                            Send to {owner}
                        </Button>
                        <p className="mt-2 text-center text-[0.78125rem] text-muted-foreground">
                            Approving doesn&rsquo;t publish.{" "}
                            {sentenceStart(owner)} decides when it goes live.
                        </p>
                    </div>
                </form>
            )}
        </FormSheetBody>
    );
}
