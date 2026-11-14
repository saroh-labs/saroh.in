"use client";

import type {
    AskAiDraftCard,
    AskAiEvent,
    AskAiInfoCard,
    AskAiOutcome,
    AskAiRefusal,
} from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { useCopy } from "@saroh/ui/copy-button";
import { IconButton } from "@saroh/ui/icon-button";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import {
    Check,
    Clock,
    Copy,
    Gauge,
    Gem,
    Lock,
    Pencil,
    Power,
    RotateCw,
    Square,
    TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { useCanChangePlan } from "@/components/billing/plan-way";
import { runAction } from "@/lib/api/run-action";
import { askForMoreQuestions } from "@/lib/ask-ai/panel-actions";
import { upgradeHref } from "@/lib/billing/access";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { AnswerCard } from "./answer-cards";
import { DraftCard } from "./draft-card";
import { ReportAnswer } from "./report-sheet";
import { SafeText } from "./safe-text";
import {
    COULDNT_ANSWER,
    CUT_OFF,
    DAILY_LIMIT,
    DIDNT_USE,
    STOPPED_AFTER,
    STOPPED_BEFORE,
    UNAVAILABLE,
    planName,
    resetDay,
} from "./words";

/** One question and what came of it, as the panel draws it. */
export interface Turn {
    key: string;
    question: string;
    turnId?: string;
    /** The status line's words, until the answer's text starts. */
    status?: string;
    text: string;
    cards: AskAiDraftCard[];
    /** What the tools found, under the answer (products, a table). */
    infoCards?: AskAiInfoCard[];
    refusal?: AskAiRefusal;
    error?: Extract<AskAiEvent, { type: "error" }>["reason"];
    outcome?: AskAiOutcome;
    running: boolean;
    /** The answer's id, for Report this answer, once it is saved. */
    messageId?: string;
}

export interface TurnContext {
    businessName: string;
    zone: string;
    phone: boolean;
    onEdit: (question: string) => void;
    onAgain: (question: string) => void;
}

/** A message in the conversation, not an error box (board 6, 19). */
export function One({
    icon,
    alert = false,
    children,
}: {
    icon: ReactNode;
    alert?: boolean;
    children: ReactNode;
}) {
    return (
        <Notice
            tone="neutral"
            role={alert ? "alert" : "status"}
            icon={icon}
            className="border-dashed border-border-strong bg-card px-3.5 py-3 text-sm [&_[aria-hidden]]:text-neutral-700 dark:[&_[aria-hidden]]:text-foreground"
        >
            <div className="flex flex-col gap-2">{children}</div>
        </Notice>
    );
}

const small = "text-[12.5px] text-muted-foreground";

function Line({
    icon,
    alert = false,
    children,
}: {
    icon: ReactNode;
    alert?: boolean;
    children: ReactNode;
}) {
    return (
        <p
            role={alert ? "alert" : "status"}
            className="m-0 flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
        >
            {icon}
            <span>{children}</span>
        </p>
    );
}

export function Question({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-[86%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-muted px-[13px] py-[9px] text-sm leading-[1.45] [overflow-wrap:anywhere]">
            {children}
        </div>
    );
}

export function TurnView({ turn, ctx }: { turn: Turn; ctx: TurnContext }) {
    const waiting =
        turn.running && !turn.text && !turn.refusal && !turn.cards.length;
    const finished = turn.outcome === "ANSWERED" || turn.outcome === "DRAFT";
    const big = ctx.phone ? "h-11" : "";
    const again = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={big}
            onClick={() => ctx.onAgain(turn.question)}
        >
            <RotateCw aria-hidden />
            {turn.outcome === "CUT_OFF" || turn.outcome === "FAILED"
                ? "Try again"
                : "Ask again"}
        </Button>
    );
    const edit = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={big}
            onClick={() => ctx.onEdit(turn.question)}
        >
            <Pencil aria-hidden />
            Edit question
        </Button>
    );

    return (
        <>
            <Question>{turn.question}</Question>
            {waiting ? (
                <p
                    role="status"
                    className="m-0 flex items-center gap-[9px] text-[13.5px] text-neutral-700 dark:text-foreground"
                >
                    <span
                        aria-hidden
                        className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground motion-reduce:animate-none"
                    />
                    <span>{turn.status ?? ""}</span>
                </p>
            ) : null}
            {turn.text ? (
                <div
                    aria-live="polite"
                    aria-busy={turn.running}
                    className="flex flex-col gap-[9px] text-sm leading-[1.5] [overflow-wrap:anywhere]"
                >
                    <SafeText text={turn.text} cursor={turn.running} />
                </div>
            ) : null}
            {turn.infoCards?.map((card, i) => (
                <AnswerCard key={i} card={card} />
            ))}
            {turn.cards.map((card) => (
                <DraftCard key={card.draftId} card={card} phone={ctx.phone} />
            ))}
            {turn.refusal ? (
                <RefusalMessage refusal={turn.refusal} ctx={ctx} />
            ) : turn.running ? null : turn.error === "unavailable" ? (
                <One icon={<TriangleAlert />}>
                    <p className="m-0">{UNAVAILABLE}</p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            ) : turn.outcome === "STOPPED_BEFORE" ||
              turn.outcome === "STOPPED_AFTER" ? (
                <>
                    <Line icon={<Square className="fill-current" />}>
                        {turn.outcome === "STOPPED_BEFORE"
                            ? STOPPED_BEFORE
                            : STOPPED_AFTER}
                    </Line>
                    <div className="-mt-1 flex flex-wrap gap-1.5">
                        {edit}
                        {again}
                    </div>
                </>
            ) : turn.outcome === "CUT_OFF" ? (
                <>
                    <Line icon={<TriangleAlert />} alert>
                        {CUT_OFF}
                    </Line>
                    <div className="-mt-1 flex gap-1.5">{again}</div>
                </>
            ) : finished ? (
                <AnswerActions turn={turn} phone={ctx.phone} />
            ) : (
                <One icon={<TriangleAlert />} alert>
                    <p className="m-0">{COULDNT_ANSWER}</p>
                    <small className={small}>{DIDNT_USE}</small>
                    <div>{again}</div>
                </One>
            )}
        </>
    );
}

/** Copy and Report, under a finished answer only (board 12, 21). */
function AnswerActions({ turn, phone }: { turn: Turn; phone: boolean }) {
    const { copy, copied } = useCopy();
    return (
        <div className="-ml-2.5 -mt-1 flex flex-wrap items-center">
            {turn.text ? (
                <IconButton
                    label={copied ? "Copied" : "Copy answer"}
                    icon={copied ? <Check /> : <Copy />}
                    size="md"
                    className={cn(
                        "text-muted-foreground",
                        phone ? "size-11" : "size-9",
                    )}
                    onClick={() => void copy(turn.text)}
                />
            ) : null}
            {turn.messageId ? (
                <ReportAnswer messageId={turn.messageId} phone={phone} />
            ) : null}
        </div>
    );
}

/** Why a question wasn't asked, in the conversation, never a pop-up. */
export function RefusalMessage({
    refusal,
    ctx,
}: {
    refusal: AskAiRefusal;
    ctx: Pick<TurnContext, "businessName" | "zone" | "phone">;
}) {
    const r = refusal as AskAiRefusal & {
        askName?: string | null;
        upgradeTo?: string;
        resetsAt?: string;
        requestMore?: boolean;
        scope?: "business" | "saroh";
        who?: "you" | "business";
    };
    switch (r.reason) {
        case "allowance":
            return <AtLimit refusal={r} ctx={ctx} />;
        case "daily-limit":
            return r.scope === "saroh" ? (
                <One icon={<TriangleAlert />}>
                    <p className="m-0">{UNAVAILABLE}</p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            ) : (
                <One icon={<Clock />}>
                    <p className="m-0">{DAILY_LIMIT}</p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            );
        case "business-off":
            return (
                <One icon={<Power />}>
                    <p className="m-0">
                        <b>Ask AI is off for {ctx.businessName}.</b>
                    </p>
                    <small className={small}>
                        {DIDNT_USE}
                        {r.askName
                            ? ` Ask ${r.askName} if you need it back on.`
                            : ""}
                    </small>
                </One>
            );
        case "no-permission":
            return (
                <One icon={<Lock />}>
                    <p data-ph-unmask="" className="m-0">
                        Ask AI isn&apos;t part of your role. Ask your business
                        owner.
                    </p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            );
        case "locked":
            return <LockedLine upgradeTo={r.upgradeTo ?? ""} />;
        case "busy":
            return (
                <One icon={<Clock />}>
                    <p className="m-0">
                        {r.who === "business"
                            ? `Ask AI is busy at ${ctx.businessName} right now. Try again in a minute.`
                            : "Your last question is still being answered. Ask again once it's done."}
                    </p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            );
        case "rate-limit":
            return (
                <One icon={<Clock />}>
                    <p data-ph-unmask="" className="m-0">
                        That&apos;s a lot of questions in a minute. Wait a
                        moment, then ask again.
                    </p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            );
        default:
            return (
                <One icon={<TriangleAlert />}>
                    <p className="m-0">{UNAVAILABLE}</p>
                    <small className={small}>{DIDNT_USE}</small>
                </One>
            );
    }
}

function LockedLine({ upgradeTo }: { upgradeTo: string }) {
    const canChangePlan = useCanChangePlan();
    return (
        <One icon={<Gem />}>
            <p className="m-0">Ask AI comes with {planName(upgradeTo)}.</p>
            {canChangePlan ? (
                plansShown() ? (
                    <div>
                        <Button asChild size="sm">
                            <Link href={upgradeHref()}>See plans</Link>
                        </Button>
                    </div>
                ) : null
            ) : (
                <small className={small}>{WHO_CAN_CHANGE_PLAN}</small>
            )}
        </One>
    );
}

/** At the period's limit (board 19b): the reset day, and Request more or who can. */
function AtLimit({
    refusal,
    ctx,
}: {
    refusal: {
        askName?: string | null;
        resetsAt?: string;
        requestMore?: boolean;
    };
    ctx: Pick<TurnContext, "zone" | "phone">;
}) {
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const reset = refusal.resetsAt
        ? resetDay(refusal.resetsAt, ctx.zone)
        : null;
    const ask = async () => {
        const res = await runAction(askForMoreQuestions, { setBusy });
        if (!res) return;
        if (!res.ok) {
            reportFailure(res);
            return;
        }
        setSent(true);
    };
    return (
        <One icon={<Gauge />}>
            <p className="m-0">
                <b>You&apos;ve used all of this period&apos;s questions.</b>
                {reset ? ` They reset on ${reset}.` : ""}
            </p>
            {refusal.requestMore ? (
                sent ? (
                    <p className="m-0 flex items-center gap-2">
                        <Check className="size-3.5" aria-hidden />
                        Request sent. Saroh will look at it.
                    </p>
                ) : (
                    <div>
                        <Button
                            type="button"
                            size="sm"
                            className={ctx.phone ? "h-11" : ""}
                            onClick={ask}
                            disabled={busy}
                            aria-busy={busy}
                        >
                            Request more
                        </Button>
                    </div>
                )
            ) : (
                <p className="m-0">
                    {refusal.askName
                        ? `${refusal.askName} can request more.`
                        : "Ask your business owner for more."}
                </p>
            )}
        </One>
    );
}
