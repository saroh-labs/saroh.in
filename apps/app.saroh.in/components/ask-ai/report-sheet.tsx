"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { Textarea } from "@saroh/ui/textarea";
import { Check, Flag } from "lucide-react";
import { useId, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import { sendAskAiReport } from "@/lib/ask-ai/panel-actions";
import { REPORTED } from "./words";

/**
 * Report this answer (board 21): under every finished answer. One reason,
 * an optional note, and a plain line saying exactly what is sent; only
 * this question and answer go to Saroh. The shared small dialog, which is
 * a sheet from the foot on a phone (DEC-202). Reporting doesn't use a
 * question.
 */

const REASONS = [
    { value: "WRONG_NUMBER", label: "Wrong number" },
    { value: "DIDNT_UNDERSTAND", label: "Didn't understand" },
    { value: "SOMETHING_ELSE", label: "Something else" },
] as const;
type Reason = (typeof REASONS)[number]["value"];

export const REPORT_CONSENT =
    "Sends this question and answer to Saroh to check. Nothing else from your conversations is shared.";

export function ReportAnswer({
    messageId,
    phone = false,
}: {
    messageId: string;
    phone?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [sent, setSent] = useState(false);

    if (sent) {
        return (
            <p
                role="status"
                className="m-0 flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-foreground"
            >
                <Check className="size-3.5 text-muted-foreground" aria-hidden />
                {REPORTED}
            </p>
        );
    }

    const trigger = (
        <Button
            type="button"
            variant="link"
            size="inline"
            className={cn(
                "ml-1 min-h-9 gap-1.5 px-2 text-[12.5px] font-medium text-neutral-700 underline decoration-border-strong underline-offset-[3px] dark:text-foreground",
                phone && "min-h-11",
            )}
        >
            <Flag className="size-3.5 text-muted-foreground" aria-hidden />
            Report this answer
        </Button>
    );
    const form = (
        <ReportForm
            messageId={messageId}
            phone={phone}
            onCancel={() => setOpen(false)}
            onSent={() => {
                setOpen(false);
                setSent(true);
            }}
        />
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent size="sm">{form}</DialogContent>
        </Dialog>
    );
}

function ReportForm({
    messageId,
    phone,
    onCancel,
    onSent,
}: {
    messageId: string;
    phone: boolean;
    onCancel: () => void;
    onSent: () => void;
}) {
    const id = useId();
    const [reason, setReason] = useState<Reason>("WRONG_NUMBER");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const big = phone ? "h-11" : "";

    const send = async () => {
        const res = await runAction(
            () =>
                sendAskAiReport({
                    messageId,
                    reason,
                    ...(note.trim() ? { note: note.trim() } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            reportFailure(res);
            return;
        }
        onSent();
    };

    return (
        <div className="flex flex-col gap-2">
            <DialogHeader>
                <DialogTitle>Report this answer</DialogTitle>
            </DialogHeader>
            <span data-ph-unmask="" id={`${id}-q`} className="label">
                What&apos;s wrong?
            </span>
            <RadioGroup
                aria-labelledby={`${id}-q`}
                value={reason}
                onValueChange={(v) => setReason(v as Reason)}
                className="gap-0"
            >
                {REASONS.map((r) => (
                    <Label
                        key={r.value}
                        className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm font-normal leading-normal",
                            reason === r.value && "bg-muted",
                            phone && "min-h-[52px]",
                        )}
                    >
                        <RadioGroupItem value={r.value} />
                        {r.label}
                    </Label>
                ))}
            </RadioGroup>
            <Label
                htmlFor={`${id}-note`}
                className="mb-1 mt-0.5 block text-[13px] font-medium leading-normal"
            >
                Add a note (optional)
            </Label>
            <Textarea
                id={`${id}-note`}
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What should it have said?"
                className="min-h-16 resize-none"
            />
            <DialogDescription>{REPORT_CONSENT}</DialogDescription>
            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    className={big}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    className={big}
                    onClick={send}
                    disabled={busy}
                    aria-busy={busy}
                >
                    Send report
                </Button>
            </DialogFooter>
        </div>
    );
}
