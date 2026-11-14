"use client";

import type {
    AskAiConversation,
    AskAiConversationSummary,
    AskAiEvent,
    AskAiLanguage,
    AskAiState,
} from "@saroh/api-contract";
import { ASK_AI_QUESTION_MAX, askAiDraftCard } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import {
    ArrowLeft,
    ArrowUp,
    Ellipsis,
    History,
    Power,
    Settings,
    Sparkles,
    Square,
    SquarePen,
    X,
} from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import {
    changeAskAiLanguage,
    readAskAiConversation,
    readAskAiConversations,
    readAskAiState,
    turnOnAskAi,
} from "@/lib/ask-ai/panel-actions";
import { MARKETING_URL } from "@/lib/help/links";
import {
    ConversationList,
    OffCard,
    PlanLocked,
    RoleLocked,
} from "./panel-states";
import { readAskAiEvents } from "./stream";
import type { Turn, TurnContext } from "./thread";
import { One, TurnView } from "./thread";
import {
    FOLLOW_UP,
    PAUSED,
    PLACEHOLDER,
    PRIVACY_LINE,
    UNAVAILABLE,
    atLimit,
    meterOf,
} from "./words";

/**
 * Ask AI's panel (plan 2026-11-13-001 U10; boards AI 2–9, AIW 11–21): the
 * conversation, the box, the status line, the answer as it arrives, draft
 * cards, Stop, and every way a question ends. The same body on a desk
 * (a panel at the right) and a phone (a full-screen sheet); the host
 * decides which.
 */

/** Ready-made questions (board 2). */
// shortcut: sent as ordinary questions, so they count; answered without AI
// (and labelled "these don't count") once the API has that path.
const CHIPS = [
    "Bookings this week",
    "Who hasn't paid",
    "Top products this month",
    "Add a product",
    "Today's bookings",
    "New enquiries",
];

const SETTINGS_HREF = "/settings/developers/ask-ai";
const PRIVACY_HREF = `${MARKETING_URL}/privacy`;

const LANGUAGES: { value: AskAiLanguage; name: string; line?: string }[] = [
    {
        value: "MATCH",
        name: "Match my question (default)",
        line: "English in, English out. Hinglish in, Hinglish out.",
    },
    { value: "ENGLISH", name: "English" },
    { value: "HINGLISH", name: "Hinglish", line: "Hindi in English letters" },
    { value: "HINDI", name: "Hindi", line: "हिन्दी में" },
];

let keys = 0;
const nextKey = () => `t${++keys}`;

/** A saved conversation as turns: each question with the answer after it. */
export function turnsOf(conversation: AskAiConversation): Turn[] {
    const turns: Turn[] = [];
    for (const m of conversation.messages) {
        if (m.role === "USER") {
            turns.push({
                key: m.id,
                question: m.text,
                text: "",
                cards: [],
                running: false,
                outcome: "FAILED",
            });
            continue;
        }
        const turn = turns.at(-1);
        if (!turn) continue;
        const card = askAiDraftCard.safeParse(m.card);
        Object.assign(turn, {
            text: m.text,
            cards: card.success ? [card.data] : [],
            outcome: m.outcome ?? "ANSWERED",
            messageId: m.id,
        });
    }
    return turns;
}

export interface AskAiPanelProps {
    state: AskAiState | null;
    businessName: string;
    zone: string;
    phone: boolean;
    onClose: () => void;
    boxRef?: Ref<HTMLTextAreaElement>;
}

export function AskAiPanel({
    state: initial,
    businessName,
    zone,
    phone,
    onClose,
    boxRef,
}: AskAiPanelProps) {
    const [state, setState] = useState(initial);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [view, setView] = useState<"thread" | "history">("thread");
    const [history, setHistory] = useState<
        AskAiConversationSummary[] | null | "failed"
    >(null);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const stopWanted = useRef(false);
    const live = useRef<{ key: string; turnId?: string } | null>(null);
    const end = useRef<HTMLDivElement>(null);

    const running = turns.some((t) => t.running);
    const lastRefusal = turns.at(-1)?.refusal?.reason;

    const patch = useCallback((key: string, change: Partial<Turn>) => {
        setTurns((all) =>
            all.map((t) => (t.key === key ? { ...t, ...change } : t)),
        );
    }, []);

    useEffect(() => {
        end.current?.scrollIntoView({ block: "end" });
    }, [turns]);

    const loadHistory = useCallback(async () => {
        const list = await runAction(() => readAskAiConversations(), {
            quiet: true,
        });
        setHistory(list ? list.data : "failed");
    }, []);

    // The off and unavailable states list the person's conversations at once.
    const offLike =
        state?.reason === "business-off" || state?.reason === "unavailable";
    useEffect(() => {
        if (!offLike) return;
        let current = true;
        readAskAiConversations().then(
            (list) => {
                if (current) setHistory(list ? list.data : "failed");
            },
            () => {
                if (current) setHistory("failed");
            },
        );
        return () => {
            current = false;
        };
    }, [offLike]);

    const sendStop = (turnId: string) => {
        void fetch(`/api/ask-ai/turns/${encodeURIComponent(turnId)}/stop`, {
            method: "POST",
        }).catch(() => undefined);
    };

    const stop = () => {
        stopWanted.current = true;
        if (live.current?.turnId) sendStop(live.current.turnId);
    };

    const apply = (
        key: string,
        event: AskAiEvent,
        convo: { id: string | null },
    ) => {
        switch (event.type) {
            case "turn":
                if (live.current) live.current.turnId = event.turnId;
                if (event.conversationId) {
                    convo.id = event.conversationId;
                    setConversationId(event.conversationId);
                }
                patch(key, { turnId: event.turnId });
                if (stopWanted.current) sendStop(event.turnId);
                return;
            case "status":
                patch(key, { status: event.words });
                return;
            case "text-delta":
                setTurns((all) =>
                    all.map((t) =>
                        t.key === key ? { ...t, text: t.text + event.text } : t,
                    ),
                );
                return;
            case "card": {
                const card = askAiDraftCard.safeParse(event.data);
                if (!card.success) return;
                setTurns((all) =>
                    all.map((t) =>
                        t.key === key
                            ? { ...t, cards: [...t.cards, card.data] }
                            : t,
                    ),
                );
                return;
            }
            case "refused":
                patch(key, { refusal: event.refusal });
                return;
            case "error":
                patch(key, { error: event.reason });
                return;
            case "done":
                patch(key, { outcome: event.outcome, running: false });
                return;
        }
    };

    const ask = async (question: string) => {
        const q = question.trim().slice(0, ASK_AI_QUESTION_MAX);
        if (!q || running) return;
        const key = nextKey();
        stopWanted.current = false;
        live.current = { key };
        setDraft("");
        setView("thread");
        setTurns((all) => [
            ...all,
            { key, question: q, text: "", cards: [], running: true },
        ]);
        const convo = { id: conversationId };
        let outcome: Turn["outcome"];
        try {
            const res = await fetch("/api/ask-ai/turns", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    question: q,
                    ...(conversationId ? { conversationId } : {}),
                }),
            });
            if (!res.ok || !res.body) {
                patch(key, { running: false, outcome: "FAILED" });
                return;
            }
            for await (const event of readAskAiEvents(res.body)) {
                apply(key, event, convo);
                if (event.type === "done") outcome = event.outcome;
            }
        } catch {
            // The connection dropped: what arrived stays, said as cut off.
            outcome = undefined;
        } finally {
            live.current = null;
            setTurns((all) =>
                all.map((t) =>
                    t.key === key && t.running
                        ? {
                              ...t,
                              running: false,
                              outcome: t.text ? "CUT_OFF" : "FAILED",
                          }
                        : t,
                ),
            );
        }
        // The saved answer's id, for Report; and this period's count again.
        const [saved, fresh] = await Promise.all([
            convo.id && (outcome === "ANSWERED" || outcome === "DRAFT")
                ? readAskAiConversation(convo.id).catch(() => null)
                : null,
            readAskAiState().catch(() => null),
        ]);
        const answer = saved?.messages
            .filter((m) => m.role === "ASSISTANT")
            .at(-1);
        if (answer) patch(key, { messageId: answer.id });
        if (fresh) setState(fresh);
    };

    const openConversation = async (id: string) => {
        const c = await runAction(() => readAskAiConversation(id));
        if (!c) return;
        setConversationId(c.id);
        setTurns(turnsOf(c));
        setView("thread");
    };

    const startNew = () => {
        if (running) return;
        setTurns([]);
        setConversationId(null);
        setDraft("");
        setView("thread");
    };

    const setLanguage = async (language: AskAiLanguage) => {
        if (!state || language === state.language) return;
        const before = state;
        setState({ ...state, language });
        const res = await runAction(() => changeAskAiLanguage(language));
        if (!res?.ok) {
            setState(before);
            if (res) reportFailure(res);
        }
    };

    const turnOn = async () => {
        const res = await runAction(turnOnAskAi, { setBusy });
        if (!res) return;
        if (!res.ok) {
            reportFailure(res);
            return;
        }
        const fresh = await readAskAiState().catch(() => null);
        if (fresh) setState(fresh);
    };

    const retryState = async () => {
        const fresh = await runAction(readAskAiState, { setBusy });
        if (fresh) setState(fresh);
    };

    const ctx: TurnContext = {
        businessName,
        zone,
        phone,
        onEdit: (q) => setDraft(q),
        onAgain: (q) => void ask(q),
    };

    const locked =
        state?.reason === "locked" || state?.reason === "no-permission";
    const tools = !!state && !locked;
    const paused = atLimit(state?.usage ?? null) || lastRefusal === "allowance";
    const switchedOff = lastRefusal === "business-off";
    const meter = meterOf(paused ? null : (state?.usage ?? null), zone);

    // — header —
    const title = view === "history" ? "Your conversations" : "Ask AI";
    const ib = phone ? "size-11" : "size-10";
    const newButton = (
        <IconButton
            label="New conversation"
            icon={<SquarePen />}
            size="md"
            className={ib}
            onClick={startNew}
            disabled={running}
        />
    );
    const historyButton = (
        <IconButton
            label="Your conversations"
            icon={<History />}
            size="md"
            className={ib}
            onClick={() => setView("history")}
        />
    );
    const more = state ? (
        <MoreMenu
            phone={phone}
            language={state.language}
            canSwitch={state.canSwitch}
            open={langOpen}
            setOpen={setLangOpen}
            onLanguage={setLanguage}
            className={ib}
        />
    ) : null;
    const close = (
        <IconButton
            label="Close Ask AI"
            icon={<X />}
            size="md"
            className={ib}
            onClick={onClose}
        />
    );
    const back = (
        <IconButton
            label="Back to the conversation"
            icon={<ArrowLeft />}
            size="md"
            className={ib}
            onClick={() => setView("thread")}
        />
    );
    const Title = phone ? SheetTitle : "h2";

    const header = phone ? (
        <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-border px-1">
            {view === "history" ? back : close}
            <Title className="m-0 flex flex-1 items-center gap-[7px] text-base font-semibold">
                {view === "thread" ? (
                    <Sparkles className="size-[17px]" aria-hidden />
                ) : null}
                {title}
            </Title>
            {tools ? (
                <>
                    {newButton}
                    {view === "thread" ? historyButton : null}
                    {view === "thread" ? more : null}
                </>
            ) : null}
        </div>
    ) : (
        <div className="flex h-14 shrink-0 items-center gap-0.5 border-b border-border pl-4 pr-1.5">
            {view === "history" ? (
                <span className="-ml-2.5">{back}</span>
            ) : (
                <Sparkles className="size-[18px]" aria-hidden />
            )}
            <Title className="m-0 ml-2 flex-1 text-base font-semibold">
                {title}
            </Title>
            {tools ? (
                <>
                    {newButton}
                    {view === "thread" ? historyButton : null}
                    {view === "thread" ? more : null}
                </>
            ) : null}
            {close}
        </div>
    );

    // — body —
    let content: React.ReactNode;
    let composer = true;
    if (!state) {
        composer = false;
        content = (
            <Notice
                tone="error"
                action={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={retryState}
                        disabled={busy}
                    >
                        Try again
                    </Button>
                }
            >
                Ask AI didn&apos;t open. Check your connection, then try again.
            </Notice>
        );
    } else if (state.reason === "locked") {
        composer = false;
        content = <PlanLocked upgradeTo={state.upgradeTo} />;
    } else if (state.reason === "no-permission") {
        composer = false;
        content = <RoleLocked />;
    } else if (view === "history" || offLike) {
        composer = !offLike;
        content = (
            <>
                {state.reason === "business-off" ? (
                    <OffCard
                        businessName={businessName}
                        ownerName={state.ownerName}
                        canSwitch={state.canSwitch}
                        busy={busy}
                        onTurnOn={turnOn}
                    />
                ) : state.reason === "unavailable" ? (
                    <One icon={<Power />}>
                        <p className="m-0">{UNAVAILABLE}</p>
                    </One>
                ) : null}
                {offLike ? (
                    <h3 data-ph-unmask="" className="label m-0">
                        Your conversations
                    </h3>
                ) : null}
                {history === "failed" ? (
                    <Notice
                        tone="error"
                        action={
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setHistory(null);
                                    void loadHistory();
                                }}
                            >
                                Try again
                            </Button>
                        }
                    >
                        Your conversations didn&apos;t load.
                    </Notice>
                ) : history === null ? (
                    <p
                        data-ph-unmask=""
                        role="status"
                        className="m-0 text-[13.5px] text-muted-foreground"
                    >
                        Loading your conversations…
                    </p>
                ) : (
                    <ConversationList
                        conversations={history}
                        zone={zone}
                        phone={phone}
                        grouped={!offLike}
                        line={
                            offLike
                                ? "Still readable, each until 90 days after its last message."
                                : undefined
                        }
                        onOpen={(id) => void openConversation(id)}
                    />
                )}
            </>
        );
    } else if (turns.length === 0) {
        content = (
            <>
                <div className="flex flex-col gap-1.5 pt-7">
                    <span
                        aria-hidden
                        className="mb-1.5 inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                    >
                        <Sparkles className="size-5" />
                    </span>
                    <h3 className="m-0 text-[21px] font-semibold tracking-[-0.02em]">
                        Ask about {businessName}
                    </h3>
                    <p
                        data-ph-unmask=""
                        className="m-0 text-sm leading-[1.5] text-neutral-700 dark:text-foreground"
                    >
                        Bookings, payments, customers and products. Add or
                        change things by asking. English or Hinglish.
                    </p>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                    <h4 data-ph-unmask="" className="label m-0">
                        Common questions
                    </h4>
                    <Chips
                        chips={CHIPS}
                        phone={phone}
                        disabled={paused || running}
                        onPick={(q) => void ask(q)}
                    />
                </div>
            </>
        );
    } else {
        content = turns.map((turn) => (
            <div key={turn.key} className="contents">
                <TurnView turn={turn} ctx={ctx} />
            </div>
        ));
    }

    const first = turns.length === 0;
    return (
        <>
            {header}
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain",
                    phone ? "px-3.5 pb-2.5 pt-4" : "px-[18px] pb-3 pt-[18px]",
                )}
            >
                {content}
                <div ref={end} />
            </div>
            {composer && switchedOff ? (
                <p className="m-0 flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 py-3.5 text-[13px] text-neutral-700 dark:text-foreground">
                    <Power
                        className="size-4 text-muted-foreground"
                        aria-hidden
                    />
                    Ask AI is off. Your conversations stay readable.
                </p>
            ) : composer ? (
                <div
                    className={cn(
                        "flex shrink-0 flex-col gap-2 border-t border-border",
                        phone
                            ? "px-3 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2.5"
                            : "px-4 pb-3 pt-2.5",
                    )}
                >
                    <Composer
                        boxRef={boxRef}
                        value={draft}
                        onChange={setDraft}
                        onSend={() => void ask(draft)}
                        onStop={stop}
                        running={running}
                        paused={paused}
                        phone={phone}
                        placeholder={
                            paused
                                ? PAUSED
                                : turns.length
                                  ? FOLLOW_UP
                                  : PLACEHOLDER
                        }
                    />
                    {first && view === "thread" ? (
                        <p className="m-0 text-[12.5px] leading-[1.5] text-neutral-700 dark:text-foreground">
                            {PRIVACY_LINE}{" "}
                            <a
                                data-ph-unmask=""
                                href={PRIVACY_HREF}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px]"
                            >
                                See how your data is used
                            </a>
                        </p>
                    ) : (
                        <div className="flex items-center gap-2.5 whitespace-nowrap text-xs text-muted-foreground">
                            {meter ? (
                                <>
                                    <span
                                        aria-hidden
                                        className="h-1 w-14 shrink-0 overflow-hidden rounded-sm bg-neutral-200 dark:bg-muted"
                                    >
                                        <i
                                            className="block h-full bg-muted-foreground"
                                            style={{
                                                width: `${Math.round(meter.share * 100)}%`,
                                            }}
                                        />
                                    </span>
                                    <span className="truncate tabular-nums">
                                        {meter.words}
                                    </span>
                                </>
                            ) : null}
                            <a
                                data-ph-unmask=""
                                href={PRIVACY_HREF}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-auto inline-flex items-center text-neutral-700 underline decoration-border-strong underline-offset-[3px] coarse:min-h-11 dark:text-foreground"
                            >
                                How your data is used
                            </a>
                        </div>
                    )}
                </div>
            ) : null}
            {phone && state ? (
                <LanguageSheet
                    open={langOpen}
                    setOpen={setLangOpen}
                    language={state.language}
                    canSwitch={state.canSwitch}
                    onLanguage={setLanguage}
                />
            ) : null}
        </>
    );
}

function Chips({
    chips,
    phone,
    disabled,
    onPick,
}: {
    chips: string[];
    phone: boolean;
    disabled: boolean;
    onPick: (q: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
                <Button
                    key={c}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onPick(c)}
                    className={cn(
                        "rounded-full px-[13px] text-[13.5px] font-medium",
                        phone ? "h-11 px-[15px]" : "h-9",
                    )}
                >
                    {c}
                </Button>
            ))}
        </div>
    );
}

function Composer({
    boxRef,
    value,
    onChange,
    onSend,
    onStop,
    running,
    paused,
    phone,
    placeholder,
}: {
    boxRef?: Ref<HTMLTextAreaElement>;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    running: boolean;
    paused: boolean;
    phone: boolean;
    placeholder: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-[52px] items-end gap-2 rounded-xl border border-input bg-field py-2 pl-3 pr-2 focus-within:ring-2 focus-within:ring-ring",
                paused && "border-border bg-background",
            )}
        >
            <Textarea
                ref={boxRef}
                aria-label="Ask a question"
                rows={1}
                value={value}
                maxLength={ASK_AI_QUESTION_MAX}
                disabled={paused}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                    ) {
                        e.preventDefault();
                        if (!running) onSend();
                    }
                }}
                className="max-h-40 min-h-[34px] flex-1 resize-none rounded-none border-none bg-transparent px-0 py-1.5 leading-[1.45] ring-0 [field-sizing:content] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-transparent"
            />
            {running ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onStop}
                    aria-label="Stop the answer"
                    className={cn(
                        "shrink-0 border-foreground px-3",
                        phone
                            ? "h-11 rounded-[11px] px-3.5"
                            : "h-9 rounded-[9px]",
                    )}
                >
                    <Square className="size-4 fill-current" aria-hidden />
                    Stop
                </Button>
            ) : (
                <IconButton
                    label="Ask"
                    icon={<ArrowUp />}
                    variant="default"
                    tooltip={false}
                    onClick={onSend}
                    disabled={paused || !value.trim()}
                    className={cn(
                        "shrink-0 [&_svg]:size-[18px]",
                        phone
                            ? "size-11 rounded-[11px]"
                            : "size-9 rounded-[9px]",
                    )}
                />
            )}
        </div>
    );
}

const SETTINGS_LINE = "Owner and Admin: switch, usage, who can use it";
const LANGUAGE_FOOT =
    "Just for you. Answers and the “Reading…” line follow it.";

/** ⋯: Reply language and, for Owner and Admin, Ask AI settings (board 17). */
function MoreMenu({
    phone,
    language,
    canSwitch,
    setOpen,
    onLanguage,
    className,
}: {
    phone: boolean;
    language: AskAiLanguage;
    canSwitch: boolean;
    open: boolean;
    setOpen: (open: boolean) => void;
    onLanguage: (l: AskAiLanguage) => void;
    className: string;
}) {
    const label = "More, language and settings";
    if (phone) {
        return (
            <IconButton
                label={label}
                icon={<Ellipsis />}
                size="md"
                className={className}
                onClick={() => setOpen(true)}
            />
        );
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label={label}
                    icon={<Ellipsis />}
                    size="md"
                    className={className}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px] p-1.5">
                <DropdownMenuLabel className="label px-2.5 pb-1 pt-2">
                    Reply language
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={language}
                    onValueChange={(v) => onLanguage(v as AskAiLanguage)}
                >
                    {LANGUAGES.map((l) => (
                        <DropdownMenuRadioItem
                            key={l.value}
                            value={l.value}
                            className="items-start py-[9px] text-sm"
                        >
                            <span>
                                {l.name}
                                {l.line ? (
                                    <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                        {l.line}
                                    </small>
                                ) : null}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <p className="m-0 px-2.5 pb-1.5 pt-1 text-xs leading-[1.45] text-muted-foreground">
                    {LANGUAGE_FOOT} Saroh&apos;s buttons and screens stay as
                    they are.
                </p>
                {canSwitch ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            asChild
                            className="items-start gap-2.5 py-[9px]"
                        >
                            <Link href={SETTINGS_HREF}>
                                <Settings
                                    className="mt-px size-[17px] text-muted-foreground"
                                    aria-hidden
                                />
                                <span>
                                    Ask AI settings
                                    <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                        {SETTINGS_LINE}
                                    </small>
                                </span>
                            </Link>
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** The phone's Reply language, as a sheet from the foot (board 17, phone). */
function LanguageSheet({
    open,
    setOpen,
    language,
    canSwitch,
    onLanguage,
}: {
    open: boolean;
    setOpen: (open: boolean) => void;
    language: AskAiLanguage;
    canSwitch: boolean;
    onLanguage: (l: AskAiLanguage) => void;
}) {
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
                side="bottom"
                closeButton={false}
                className="flex flex-col gap-0 rounded-t-2xl px-2.5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-1.5"
            >
                <span
                    aria-hidden
                    className="mx-auto mb-2 mt-1 block h-1 w-9 rounded-sm bg-border-strong"
                />
                <SheetTitle className="m-0 px-2.5 pb-2 pt-1 text-base font-semibold">
                    Reply language
                </SheetTitle>
                <RadioGroup
                    aria-label="Reply language"
                    value={language}
                    onValueChange={(v) => {
                        onLanguage(v as AskAiLanguage);
                        setOpen(false);
                    }}
                    className="gap-0"
                >
                    {LANGUAGES.map((l) => (
                        <Label
                            data-ph-unmask=""
                            key={l.value}
                            className={cn(
                                "flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm font-normal leading-normal",
                                l.value === language && "bg-muted",
                            )}
                        >
                            <RadioGroupItem value={l.value} />
                            <span>
                                {l.name}
                                {l.line ? (
                                    <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                        {l.line}
                                    </small>
                                ) : null}
                            </span>
                        </Label>
                    ))}
                </RadioGroup>
                <SheetDescription className="m-0 px-2.5 pb-1.5 pt-1 text-xs leading-[1.45] text-muted-foreground">
                    {LANGUAGE_FOOT}
                </SheetDescription>
                {canSwitch ? (
                    <>
                        <div className="mx-1 my-1.5 h-px bg-muted" />
                        <Link
                            href={SETTINGS_HREF}
                            className="flex min-h-[52px] items-center gap-2.5 rounded-lg px-2.5 text-sm"
                            onClick={() => setOpen(false)}
                        >
                            <Settings
                                className="size-[17px] text-muted-foreground"
                                aria-hidden
                            />
                            Ask AI settings
                        </Link>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
