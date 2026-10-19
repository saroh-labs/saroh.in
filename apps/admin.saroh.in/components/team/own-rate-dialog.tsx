"use client";

import { Button } from "@saroh/ui/button";
import { DateInput } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useEffect, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import {
    previewOwnRateAction,
    readOwnRateAction,
    setOwnRateAction,
} from "@/lib/commission-actions";
import { percentToBasisPoints, rateLabel } from "@/lib/commission-words";
import type { OwnRatePreview, OwnRateSummary } from "@/lib/own-rate-words";
import {
    dayLabel,
    earnsFromChips,
    earnsFromProblem,
    ownRateBlocked,
    previewWords,
} from "@/lib/own-rate-words";

/** How long typing settles before the dry run is asked. */
const PREVIEW_DELAY_MS = 350;

type Loaded =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; summary: OwnRateSummary };

type Preview =
    | { state: "idle" }
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; preview: OwnRatePreview };

/** The dry run's answer for one set of inputs (`key`). */
type Answer =
    { key: string; error: string } | { key: string; preview: OwnRatePreview };

/**
 * Set commission… (DEC-169, #1035), for a Platform owner
 * (`commission:rates`): the business's own rate for the manager who looks
 * after it, as an `OperatorDialog`. It reads the business's dates when it
 * opens (mount it then), offers them as one-tap Earns from days (a day
 * before its first paid plan shown off, saying why), an optional last
 * day, and, as the operator types, the API's dry run: how many payments it
 * gives commission to and what they earn. Set rate waits for that line.
 */
export function OwnRateDialog({
    organizationId,
    businessName,
    onOpenChange,
    onSaved,
}: {
    organizationId: string;
    businessName: string;
    onOpenChange: (open: boolean) => void;
    /** Saved: what to say, so the card or row can light. */
    onSaved: (message: string, summary: OwnRateSummary) => void;
}) {
    const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
    const [percent, setPercent] = useState("");
    const [earnsFrom, setEarnsFrom] = useState("");
    const [lastDay, setLastDay] = useState("");
    const [answer, setAnswer] = useState<Answer | null>(null);

    useEffect(() => {
        let live = true;
        void readOwnRateAction(organizationId).then((result) => {
            if (!live) return;
            setLoaded(
                result.ok
                    ? { state: "ready", summary: result.data }
                    : { state: "failed", error: result.error },
            );
        });
        return () => {
            live = false;
        };
    }, [organizationId]);

    const summary = loaded.state === "ready" ? loaded.summary : null;
    const basisPoints = percentToBasisPoints(percent);
    const problem = summary
        ? (ownRateBlocked(summary) ??
          earnsFromProblem(summary, earnsFrom, lastDay))
        : null;
    const key =
        summary && basisPoints !== null && !problem
            ? JSON.stringify({
                  basisPoints,
                  earnsFrom,
                  ...(lastDay ? { lastDay } : {}),
              })
            : null;
    // What the dialog shows: the answer for what is typed now, or that it
    // is being worked out.
    const preview: Preview = !key
        ? { state: "idle" }
        : answer?.key !== key
          ? { state: "loading" }
          : "preview" in answer
            ? { state: "ready", preview: answer.preview }
            : { state: "failed", error: answer.error };

    useEffect(() => {
        if (!key) return;
        let live = true;
        const timer = setTimeout(() => {
            const input = JSON.parse(key) as {
                basisPoints: number;
                earnsFrom: string;
                lastDay?: string;
            };
            void previewOwnRateAction(organizationId, input).then((result) => {
                if (!live) return;
                setAnswer(
                    result.ok
                        ? { key, preview: result.data }
                        : { key, error: result.error },
                );
            });
        }, PREVIEW_DELAY_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [key, organizationId]);

    const manager = summary?.manager?.name ?? "their account manager";

    return (
        <OperatorDialog
            open
            onOpenChange={onOpenChange}
            title={`Set commission for ${businessName}?`}
            effect={`${manager} earns this rate on this business's payments from the day you pick, instead of the general rate. Payments since then that earned nothing because no rate was set get commission now, once. Payments already priced keep their price.`}
            fields={
                <div className="grid gap-3">
                    {loaded.state === "loading" ? (
                        <p
                            className="text-sm text-muted-foreground"
                            role="status"
                        >
                            Loading the business&apos;s dates…
                        </p>
                    ) : loaded.state === "failed" ? (
                        <p className="text-sm text-destructive" role="alert">
                            {loaded.error}
                        </p>
                    ) : ownRateBlocked(loaded.summary) ? (
                        <p className="text-sm text-muted-foreground">
                            {ownRateBlocked(loaded.summary)}
                        </p>
                    ) : (
                        <>
                            <div className="grid gap-1.5">
                                <Label htmlFor="own-rate-percent">
                                    Rate (%)
                                </Label>
                                <Input
                                    id="own-rate-percent"
                                    name="percent"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    required
                                    value={percent}
                                    onChange={(e) => setPercent(e.target.value)}
                                />
                                {percent.trim() && basisPoints === null ? (
                                    <p className="text-[13px] text-destructive">
                                        Give a percentage from 0 to 100, with up
                                        to two decimals.
                                    </p>
                                ) : null}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="own-rate-from">
                                    Earns from
                                </Label>
                                <EarnsFromChips
                                    summary={loaded.summary}
                                    picked={earnsFrom}
                                    onPick={setEarnsFrom}
                                />
                                <DateInput
                                    id="own-rate-from"
                                    name="earnsFrom"
                                    className="w-full"
                                    value={earnsFrom}
                                    onValueChange={setEarnsFrom}
                                    min={
                                        loaded.summary.dates.firstPaidPlan ??
                                        undefined
                                    }
                                    required
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="own-rate-until">
                                    Until (optional)
                                </Label>
                                <DateInput
                                    id="own-rate-until"
                                    name="lastDay"
                                    className="w-full"
                                    value={lastDay}
                                    onValueChange={setLastDay}
                                    min={earnsFrom || undefined}
                                    clearable
                                    placeholder="It runs on"
                                />
                                <p className="text-[13px] text-muted-foreground">
                                    Its last day. Leave it empty to keep it
                                    going.
                                </p>
                            </div>
                            <PreviewLine
                                problem={
                                    percent.trim() && earnsFrom ? problem : null
                                }
                                preview={preview}
                            />
                        </>
                    )}
                </div>
            }
            submitLabel="Set rate"
            onSubmit={async ({ reason, idempotencyKey }) => {
                if (!summary || ownRateBlocked(summary)) {
                    return {
                        ok: false,
                        error:
                            (summary && ownRateBlocked(summary)) ??
                            "The business's dates haven't loaded.",
                    };
                }
                if (basisPoints === null) {
                    return {
                        ok: false,
                        error: "Give a percentage from 0 to 100, with up to two decimals.",
                    };
                }
                if (problem) return { ok: false, error: problem };
                if (preview.state !== "ready") {
                    return {
                        ok: false,
                        error: "Wait for what it would pay, then set it.",
                    };
                }
                const result = await setOwnRateAction(organizationId, {
                    basisPoints,
                    earnsFrom,
                    ...(lastDay ? { lastDay } : {}),
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                const paid = result.data.backPaid.payments;
                onSaved(
                    `${manager} earns ${rateLabel(basisPoints)} on ${businessName} from ${dayLabel(earnsFrom)}${paid > 0 ? `; ${paid} ${paid === 1 ? "payment" : "payments"} got commission` : ""}.`,
                    result.data,
                );
                return { ok: true };
            }}
        />
    );
}

/** The one-tap days: joined, first paid plan, the manager took it on. */
function EarnsFromChips({
    summary,
    picked,
    onPick,
}: {
    summary: OwnRateSummary;
    picked: string;
    onPick: (day: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2" aria-label="Pick a day">
            {earnsFromChips(summary).map((chip) => (
                <div key={chip.label} className="grid gap-0.5">
                    <Button
                        type="button"
                        size="sm"
                        variant={picked === chip.day ? "secondary" : "outline"}
                        aria-pressed={picked === chip.day}
                        disabled={chip.disabled !== null}
                        onClick={() => onPick(chip.day)}
                    >
                        {chip.label} · {dayLabel(chip.day)}
                    </Button>
                    {chip.disabled ? (
                        <span className="text-[12px] text-muted-foreground">
                            {chip.disabled}
                        </span>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

/** The dry run's answer, or why there is none yet. */
function PreviewLine({
    problem,
    preview,
}: {
    problem: string | null;
    preview: Preview;
}) {
    if (problem) {
        return (
            <p className="text-sm text-destructive" role="alert">
                {problem}
            </p>
        );
    }
    if (preview.state === "idle") return null;
    if (preview.state === "loading") {
        return (
            <p className="text-sm text-muted-foreground" role="status">
                Working out what it would pay…
            </p>
        );
    }
    if (preview.state === "failed") {
        return (
            <p className="text-sm text-destructive" role="alert">
                {preview.error}
            </p>
        );
    }
    return (
        <p
            className="rounded-md border bg-muted/40 p-3 text-sm"
            role="status"
            data-dry-run
        >
            {previewWords(preview.preview)}
        </p>
    );
}
