"use client";

import type {
    AskAiAbout,
    AskAiConversation,
    AskAiConversationSummary,
    AskAiEvent,
    AskAiLanguage,
    AskAiState,
} from "@saroh/api-contract";
import {
    ASK_AI_QUESTION_MAX,
    askAiDraftCard,
    askAiInfoCard,
} from "@saroh/api-contract";
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
import { Input } from "@saroh/ui/input";
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
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Ellipsis,
    History,
    Info,
    Maximize2,
    Pencil,
    Power,
    Search,
    Settings,
    Sparkles,
    Square,
    Undo2,
    X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import type { AskAiPage, AskAiSuggestion } from "@/lib/ask-ai/page-hints";
import { businessPage } from "@/lib/ask-ai/page-hints";
import {
    bookFromAnswer,
    changeAskAiLanguage,
    readAskAiConversation,
    readAskAiConversations,
    readAskAiState,
    turnOnAskAi,
} from "@/lib/ask-ai/panel-actions";
import { MARKETING_URL } from "@/lib/help/links";
import { useAskAiPage } from "./ask-ai-page";
import {
    ConversationList,
    OffCard,
    PlanLocked,
    RoleLocked,
} from "./panel-states";
import { readAskAiEvents } from "./stream";
import type { Turn, TurnContext } from "./thread";
import { One, RefusalMessage, TurnView } from "./thread";
import {
    FOLLOW_UP,
    HISTORY_LINE,
    PAUSED,
    PRIVACY_LINE,
    UNAVAILABLE,
    atLimit,
    meterOf,
    resetDay,
} from "./words";

/**
 * Ask AI's panel (plan 2026-11-13-001 U10; boards AI 2–9, AIW 11–21): the
 * conversation, the box, the status line, the answer as it arrives, draft
 * cards, Stop, and every way a question ends. The same body on a desk
 * (a panel at the right) and a phone (a full-screen sheet); the host
 * decides which.
 */

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

/** The answer cards Saroh knows, each checked; any other is left out. */
export function infoCardsOf(cards: readonly unknown[] | undefined) {
    return (cards ?? []).flatMap((c) => {
        const card = askAiInfoCard.safeParse(c);
        return card.success ? [card.data] : [];
    });
}

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
        // Kept as the event carried it, `{ kind: "draft", data }`.
        const draft = (m.card as { data?: unknown } | undefined)?.data;
        const card = askAiDraftCard.safeParse(draft ?? m.card);
        Object.assign(turn, {
            text: m.text,
            cards: card.success ? [card.data] : [],
            infoCards: infoCardsOf(m.cards),
            next: m.next,
            outcome: m.outcome ?? "ANSWERED",
            messageId: m.id,
        });
    }
    return turns;
}

/**
 * The saved turn for a question just asked, once the API has written its
 * answer: the last time it was asked in the conversation. Null while the
 * answer isn't saved yet.
 */
export function savedTurn(
    conversation: AskAiConversation,
    question: string,
): Turn | null {
    const turns = turnsOf(conversation);
    const turn = turns.findLast((t) => t.question === question) ?? turns.at(-1);
    return turn?.messageId ? turn : null;
}

/** The full page, `/ask` (board AI 9): the list beside the conversation. */
export const ASK_PAGE = "/ask";
export const askPageHref = (conversationId: string | null) =>
    conversationId
        ? `${ASK_PAGE}?c=${encodeURIComponent(conversationId)}`
        : ASK_PAGE;

export interface AskAiPanelProps {
    state: AskAiState | null;
    businessName: string;
    zone: string;
    phone: boolean;
    /** The panel's close; the page has none (the rail navigates away). */
    onClose?: () => void;
    boxRef?: Ref<HTMLTextAreaElement>;
    /** "page": `/ask`, the conversation list beside a wider conversation. */
    layout?: "panel" | "page";
    /** The page's opening conversation (`?c=`) and list, read on the server. */
    conversation?: AskAiConversation | null;
    conversations?: AskAiConversationSummary[] | null;
}

export function AskAiPanel({
    state: initial,
    businessName,
    zone,
    phone,
    onClose,
    boxRef,
    layout = "panel",
    conversation,
    conversations,
}: AskAiPanelProps) {
    const page = layout === "page";
    const router = useRouter();
    const [state, setState] = useState(initial);
    const [turns, setTurns] = useState<Turn[]>(() =>
        conversation ? turnsOf(conversation) : [],
    );
    const [conversationId, setConversationId] = useState<string | null>(
        conversation?.id ?? null,
    );
    // The full page opens on its list on a phone, unless a conversation is named.
    const [view, setView] = useState<"thread" | "history">(
        page && !conversation ? "history" : "thread",
    );
    const [history, setHistory] = useState<
        AskAiConversationSummary[] | null | "failed"
    >(page ? (conversations ?? "failed") : null);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    // The page it was opened on (AF 1, 2, 5), and whether its label was
    // cleared to ask about the whole business (AF 7). A new page brings
    // its own label back.
    const here: AskAiPage = useAskAiPage() ?? businessPage();
    const hereKey = here.about?.label ?? null;
    const [cleared, setCleared] = useState(false);
    const [seenKey, setSeenKey] = useState(hereKey);
    if (seenKey !== hereKey) {
        setSeenKey(hereKey);
        setCleared(false);
    }
    // The full page is about no page: its conversations say where they began.
    const about: AskAiAbout | null = page || cleared ? null : here.about;
    const [query, setQuery] = useState("");
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

    // The page's address names the conversation open, so it can be kept.
    // A new address is read again on the server, so Back to it (from a
    // card's link) shows this conversation, not the router's old copy.
    useEffect(() => {
        if (!page) return;
        const href = askPageHref(conversationId);
        if (window.location.pathname + window.location.search !== href) {
            window.history.replaceState(null, "", href);
            router.refresh();
        }
    }, [page, conversationId, router]);

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
                setTurns((all) =>
                    all.map((t) =>
                        t.key === key
                            ? {
                                  ...t,
                                  status: event.words,
                                  tools:
                                      event.tool === "start"
                                          ? t.tools
                                          : [...(t.tools ?? []), event.tool],
                              }
                            : t,
                    ),
                );
                return;
            case "text-delta":
                setTurns((all) =>
                    all.map((t) =>
                        t.key === key ? { ...t, text: t.text + event.text } : t,
                    ),
                );
                return;
            case "card": {
                if (
                    event.kind === "products" ||
                    event.kind === "table" ||
                    event.kind === "slots"
                ) {
                    const info = infoCardsOf([event]);
                    if (!info.length) return;
                    setTurns((all) =>
                        all.map((t) =>
                            t.key === key
                                ? {
                                      ...t,
                                      infoCards: [
                                          ...(t.infoCards ?? []),
                                          ...info,
                                      ],
                                  }
                                : t,
                        ),
                    );
                    return;
                }
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
            case "next":
                patch(key, { next: event.items });
                return;
            case "error":
                patch(key, { error: event.reason });
                return;
            case "done":
                patch(key, {
                    outcome: event.outcome,
                    counted: event.counted,
                    running: false,
                });
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
                    ...(about ? { about } : {}),
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
            // The connection dropped: what arrived stays, said as lost.
            outcome = undefined;
        } finally {
            live.current = null;
            // No `done`: the API may still have answered (it reads a turn
            // to its end), so this never says whether a question was used.
            setTurns((all) =>
                all.map((t) =>
                    t.key === key && t.running
                        ? {
                              ...t,
                              running: false,
                              outcome: t.text ? "CUT_OFF" : "FAILED",
                              lost: true,
                          }
                        : t,
                ),
            );
        }
        // The saved answer: its id, for Report; or, when the connection
        // dropped, the answer itself. And this period's count again.
        const [saved, fresh] = await Promise.all([
            convo.id &&
            (outcome === "ANSWERED" ||
                outcome === "DRAFT" ||
                outcome === undefined)
                ? readAskAiConversation(convo.id).catch(() => null)
                : null,
            readAskAiState().catch(() => null),
        ]);
        const kept = saved ? savedTurn(saved, q) : null;
        if (kept && outcome === undefined && kept.question === q) {
            patch(key, { ...kept, key, running: false, lost: false });
        } else if (kept?.messageId) {
            patch(key, { messageId: kept.messageId });
        }
        if (fresh) setState(fresh);
        // A new conversation, or this one moved to the top; and the page read
        // again, so Back from a card's link shows this turn and its card.
        if (page) {
            void loadHistory();
            router.refresh();
        }
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
        onEdit: (q) => {
            setDraft(q);
            document
                .querySelector<HTMLTextAreaElement>("[data-ask-ai-box]")
                ?.focus();
        },
        onAgain: (q) => void ask(q),
        // Book here (AF 4): the booking is drafted under the answer, to pick who.
        onBook: async (key, serviceId, startsAt) => {
            if (!conversationId) return;
            const res = await runAction(() =>
                bookFromAnswer({ conversationId, serviceId, startsAt }),
            );
            if (!res) return;
            if (!res.ok) {
                reportFailure(res);
                return;
            }
            setTurns((all) =>
                all.map((t) =>
                    t.key === key ? { ...t, cards: [...t.cards, res.data] } : t,
                ),
            );
        },
    };

    const locked =
        state?.reason === "locked" || state?.reason === "no-permission";
    const tools = !!state && !locked;
    const paused = atLimit(state?.usage ?? null) || lastRefusal === "allowance";
    const switchedOff = lastRefusal === "business-off";
    const meter = meterOf(paused ? null : (state?.usage ?? null), zone);

    // — header —
    const title = view === "history" ? "Your conversations" : "Ask AI";
    const ib = "size-11";
    const showHistory = () => {
        setQuery("");
        setView("history");
        setHistory(null);
        void loadHistory();
    };
    const newButton = (
        <IconButton
            label="New conversation"
            icon={<Pencil />}
            size="md"
            className={ib}
            onClick={startNew}
            disabled={running}
        />
    );
    const toPage = () => {
        router.push(askPageHref(conversationId));
        onClose?.();
    };
    // History lives in the panel, desk and phone alike (AF 9).
    const historyButton = (
        <IconButton
            label="Your conversations"
            icon={<History />}
            size="md"
            className={ib}
            onClick={showHistory}
        />
    );
    const expandButton = phone ? null : (
        <IconButton
            label="Open as a full page"
            icon={<Maximize2 />}
            size="md"
            className={ib}
            onClick={toPage}
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
            icon={<ChevronLeft />}
            size="md"
            className={ib}
            onClick={() => setView("thread")}
        />
    );
    const Title = phone ? SheetTitle : "h2";

    const header =
        view === "history" ? (
            // AF 9: back, the list's name, and the full page.
            <div className="flex h-[60px] shrink-0 items-center gap-0.5 border-b border-border pl-1.5 pr-1.5">
                {back}
                <Title className="m-0 ml-1 flex-1 font-display text-base font-semibold">
                    {title}
                </Title>
                {expandButton}
                {phone ? close : null}
            </div>
        ) : phone ? (
            // AF phone: close at the left, then the clock and ⋯.
            <div className="flex h-[60px] shrink-0 items-center gap-0.5 border-b border-border px-1">
                {close}
                <Title className="m-0 flex flex-1 items-center gap-2 font-display text-base font-semibold">
                    <Sparkles className="size-[18px]" aria-hidden />
                    {title}
                </Title>
                {tools ? (
                    <>
                        {historyButton}
                        {more}
                    </>
                ) : null}
            </div>
        ) : (
            <div className="flex h-[60px] shrink-0 items-center gap-0.5 border-b border-border pl-4 pr-1.5">
                <Sparkles className="size-[18px]" aria-hidden />
                <Title className="m-0 ml-2 flex-1 font-display text-base font-semibold">
                    {title}
                </Title>
                {tools ? (
                    <>
                        {newButton}
                        {historyButton}
                        {more}
                        {expandButton}
                    </>
                ) : null}
                {close}
            </div>
        );

    const listed = Array.isArray(history)
        ? history.filter((c) =>
              (c.title ?? "")
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
          )
        : history;
    const search =
        Array.isArray(history) && history.length > 0 ? (
            <div className="relative shrink-0">
                <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    type="search"
                    aria-label="Search your conversations"
                    placeholder="Search your conversations"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-[46px] rounded-xl border-border bg-card pl-10 text-sm"
                />
            </div>
        ) : null;
    const historyList =
        listed === "failed" ? (
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
        ) : listed === null ? (
            <p
                data-ph-unmask=""
                role="status"
                className="m-0 text-[13.5px] text-muted-foreground"
            >
                Loading your conversations…
            </p>
        ) : (
            <ConversationList
                conversations={listed}
                businessName={businessName}
                zone={zone}
                phone={phone}
                grouped={page || !offLike}
                current={conversationId}
                searching={!!query.trim()}
                line={
                    offLike && !page
                        ? "Still readable, each until 90 days after its last message."
                        : undefined
                }
                onOpen={(id) => void openConversation(id)}
            />
        );

    // — body —
    // The label: the page it is about, or, once cleared, the whole
    // business with a way back (AF 7). The full page shows where the open
    // conversation began.
    const openSummary = Array.isArray(history)
        ? history.find((c) => c.id === conversationId)
        : null;
    const label = page ? (
        openSummary?.about ? (
            <AboutLabel words={`About: ${openSummary.about.label}`} />
        ) : null
    ) : about ? (
        <AboutLabel
            words={`${phone ? "" : "About: "}${about.label}`}
            action={{
                label: `Ask about all of ${businessName} instead`,
                icon: <X />,
                onClick: () => setCleared(true),
            }}
        />
    ) : cleared && here.about ? (
        <AboutLabel
            plain
            words={`All of ${businessName}`}
            action={{
                label: `Ask about ${here.about.label} again`,
                icon: <Undo2 />,
                onClick: () => setCleared(false),
            }}
        />
    ) : null;
    const offered = about ? here : businessPage();

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
        content = (
            <PlanLocked
                upgradeTo={state.upgradeTo}
                businessName={businessName}
                onNotNow={onClose}
            />
        );
    } else if (state.reason === "no-permission") {
        composer = false;
        content = <RoleLocked />;
    } else if ((view === "history" && !page) || offLike) {
        composer = !offLike && (page || view !== "history");
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
                {offLike && !page ? (
                    <h3 data-ph-unmask="" className="label m-0">
                        Your conversations
                    </h3>
                ) : null}
                {page ? null : (
                    <>
                        {search}
                        {historyList}
                    </>
                )}
            </>
        );
    } else if (turns.length === 0) {
        content = (
            <>
                {label ? <div>{label}</div> : null}
                {paused && state.usage ? (
                    // AF 12: at the limit on opening, said at once, with Request more.
                    <RefusalMessage
                        refusal={{
                            reason: "allowance",
                            limit: state.usage.limit,
                            resetsAt: state.usage.resetsAt,
                            requestMore: state.requestMore,
                            askName: state.ownerName,
                        }}
                        ctx={ctx}
                    />
                ) : null}
                {about ? (
                    <p className="m-0 text-sm leading-[1.5] text-neutral-700 dark:text-foreground">
                        {offered.intro}
                    </p>
                ) : (
                    <div>
                        <h3 className="m-0 font-display text-[21px] font-semibold tracking-[-0.01em]">
                            Ask about {businessName}
                        </h3>
                        <p
                            data-ph-unmask=""
                            className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-neutral-700 dark:text-foreground"
                        >
                            Answers come with the rows behind them. Changes wait
                            for your OK, and Undo works all day.
                        </p>
                    </div>
                )}
                <Suggestions
                    suggestions={offered.suggestions}
                    disabled={paused || running}
                    onAsk={(q) => void ask(q)}
                    onFill={(words) => {
                        setDraft(words);
                        document
                            .querySelector<HTMLTextAreaElement>(
                                "[data-ask-ai-box]",
                            )
                            ?.focus();
                    }}
                />
                <p
                    data-ph-unmask=""
                    className="m-0 flex items-start gap-1.5 text-xs leading-[1.6] text-muted-foreground"
                >
                    <Info
                        className="mt-[3px] size-[13px] shrink-0"
                        aria-hidden
                    />
                    Hints are counted from{" "}
                    {about ? "this page" : "your business"}. Tapping one asks.
                    Nothing runs until you do.
                </p>
            </>
        );
    } else {
        content = (
            <>
                {label ? <div>{label}</div> : null}
                {turns.map((turn) => (
                    <div key={turn.key} className="contents">
                        <TurnView turn={turn} ctx={ctx} />
                    </div>
                ))}
            </>
        );
    }

    const first = turns.length === 0;
    const usage = state?.usage ?? null;
    const reset = usage ? resetDay(usage.resetsAt, zone) : null;
    const meterLine =
        paused && usage?.limit != null ? (
            // AF 12: none left, said in the warning colour, and when they're back.
            <span className="truncate font-semibold tabular-nums text-warning-subtle-foreground">
                0 of {usage.limit} left{reset ? ` · back ${reset}` : ""}
            </span>
        ) : meter ? (
            <>
                <span
                    aria-hidden
                    className="h-[5px] w-14 shrink-0 overflow-hidden rounded-sm bg-neutral-200 dark:bg-muted"
                >
                    <i
                        className="block h-full bg-muted-foreground"
                        style={{
                            width: `${Math.round(meter.share * 100)}%`,
                        }}
                    />
                </span>
                <span className="truncate tabular-nums">{meter.words}</span>
            </>
        ) : null;
    const privacyLink = (
        <a
            data-ph-unmask=""
            href={PRIVACY_HREF}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center text-foreground underline decoration-border-strong underline-offset-[3px] coarse:min-h-11"
        >
            How your data is used
        </a>
    );
    const pageHeader = (
        // Under 760px the list beside the page is hidden: open it here.
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2 min-[760px]:hidden">
            <IconButton
                label="Your conversations"
                icon={<ChevronLeft />}
                size="md"
                className="size-11"
                onClick={() => setView("history")}
            />
            <h1 className="m-0 flex flex-1 items-center gap-2 font-display text-base font-semibold">
                Ask AI
            </h1>
            {tools ? more : null}
        </div>
    );
    const conversationView = (
        <>
            {page ? (tools ? pageHeader : null) : header}
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain [&>*]:shrink-0 [&>.contents>*]:shrink-0",
                    page ? "px-6 pb-3 pt-6" : "px-4 pb-3 pt-[18px]",
                )}
            >
                {page ? (
                    <div className="mx-auto flex w-full max-w-[662px] flex-col gap-3.5">
                        <h2 className="sr-only">
                            {openSummary?.title ??
                                conversation?.title ??
                                turns.at(0)?.question ??
                                "New conversation"}
                        </h2>
                        {tools ? (
                            <div className="hidden justify-end min-[760px]:flex">
                                {more}
                            </div>
                        ) : null}
                        {content}
                    </div>
                ) : (
                    content
                )}
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
                        "flex shrink-0 flex-col gap-2 pt-2.5",
                        page
                            ? "mx-auto w-[calc(100%-48px)] max-w-[662px] pb-4"
                            : "border-t border-border px-4",
                        !page &&
                            (phone
                                ? "pb-[calc(12px+env(safe-area-inset-bottom))]"
                                : "pb-3"),
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
                        placeholder={
                            paused
                                ? reset
                                    ? `Paused until ${reset}`
                                    : PAUSED
                                : turns.length
                                  ? FOLLOW_UP
                                  : about
                                    ? here.placeholder
                                    : businessPage().placeholder
                        }
                    />
                    {first && (page || view === "thread") && !paused ? (
                        // Kept from the first panel: where a question goes,
                        // said before the first one is asked.
                        <p className="m-0 text-[12.5px] leading-[1.5] text-neutral-700 dark:text-foreground">
                            {PRIVACY_LINE} {privacyLink}
                        </p>
                    ) : (
                        <div className="flex items-center gap-2.5 whitespace-nowrap text-[12.5px] text-neutral-700 dark:text-foreground">
                            {meterLine}
                            {privacyLink}
                        </div>
                    )}
                </div>
            ) : null}
            {!page && view === "history" && tools ? (
                // AF 9: a new conversation from the list's foot.
                <div
                    className={cn(
                        "shrink-0 border-t border-border px-4 pt-3",
                        phone
                            ? "pb-[calc(12px+env(safe-area-inset-bottom))]"
                            : "pb-3",
                    )}
                >
                    <Button
                        type="button"
                        className="h-11 w-full"
                        onClick={startNew}
                        disabled={running}
                    >
                        <Pencil aria-hidden />
                        New conversation
                    </Button>
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
    if (!page) return conversationView;

    return (
        // The tab bar takes the foot of a phone's screen (`--tab-bar-inset`).
        <div className="flex h-[calc(100dvh-61px-var(--tab-bar-inset))] min-h-0">
            {tools ? (
                <nav
                    aria-label="Your conversations"
                    className={cn(
                        "w-full shrink-0 flex-col border-r border-border px-4 pb-4 pt-[18px] min-[760px]:flex min-[760px]:w-[330px]",
                        view === "history" ? "flex" : "hidden",
                    )}
                >
                    <div className="flex items-center gap-2">
                        <h1 className="m-0 flex-1 font-display text-[22px] font-semibold tracking-[-0.02em]">
                            Ask AI
                        </h1>
                        <Button
                            type="button"
                            className="h-10"
                            onClick={startNew}
                            disabled={running}
                        >
                            <Pencil aria-hidden />
                            New
                        </Button>
                    </div>
                    <div className="mt-3">{search}</div>
                    <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
                        {historyList}
                    </div>
                    <p className="m-0 mt-3 text-[12.5px] leading-[1.4] text-muted-foreground">
                        {HISTORY_LINE}
                    </p>
                </nav>
            ) : null}
            <section
                id="ask-ai-page"
                aria-label="Ask AI"
                className={cn(
                    "min-w-0 flex-1 flex-col min-[760px]:flex",
                    view === "history" && tools ? "hidden" : "flex",
                )}
            >
                {conversationView}
            </section>
        </div>
    );
}

/** The page a question is about, as a plum label (AF 2, 7). */
function AboutLabel({
    words,
    plain = false,
    action,
}: {
    words: string;
    /** The whole business: a neutral label (AF 7). */
    plain?: boolean;
    action?: { label: string; icon: React.ReactNode; onClick: () => void };
}) {
    return (
        <span
            className={cn(
                "inline-flex h-7 max-w-full items-center gap-1 rounded-full pl-2.5 text-[12.5px] font-semibold",
                action ? "pr-0.5" : "pr-2.5",
                plain
                    ? "bg-muted text-neutral-700 dark:text-foreground"
                    : "bg-ask-subtle text-ask-subtle-foreground",
            )}
        >
            <span className="truncate">{words}</span>
            {action ? (
                <button
                    type="button"
                    aria-label={action.label}
                    title={action.label}
                    onClick={action.onClick}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:-my-2 coarse:size-11 [&_svg]:size-3.5"
                >
                    {action.icon}
                </button>
            ) : null}
        </span>
    );
}

/**
 * The page's suggestions with their hints (AF 1, 2, 5): a question asks
 * at once (and doesn't use a question); a pencil one, dashed, only puts
 * its words in the box.
 */
function Suggestions({
    suggestions,
    disabled,
    onAsk,
    onFill,
}: {
    suggestions: AskAiSuggestion[];
    disabled: boolean;
    onAsk: (question: string) => void;
    onFill: (words: string) => void;
}) {
    return (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {suggestions.map((s) => (
                <li key={s.label}>
                    <button
                        type="button"
                        disabled={disabled && !s.fill}
                        onClick={() =>
                            s.fill ? onFill(s.question) : onAsk(s.question)
                        }
                        className={cn(
                            "flex min-h-[68px] w-full items-center gap-2.5 rounded-xl border border-border bg-card py-2 pl-3.5 pr-3 text-left text-sm hover:border-border-strong hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground dark:hover:bg-muted",
                            s.fill && "border-dashed border-border-strong",
                        )}
                    >
                        {s.fill ? (
                            <Pencil
                                className="size-3.5 shrink-0 text-neutral-700 dark:text-foreground"
                                aria-hidden
                            />
                        ) : null}
                        <span className="min-w-0 flex-1 leading-[1.45]">
                            {s.label}
                        </span>
                        {s.hint ? (
                            <span className="h-6 max-w-[48%] truncate whitespace-nowrap rounded-full bg-ask-subtle px-[9px] text-xs font-semibold leading-6 text-ask-subtle-foreground">
                                {s.hint}
                            </span>
                        ) : null}
                        <ChevronRight
                            className="size-3.5 shrink-0 text-neutral-700 dark:text-foreground"
                            aria-hidden
                        />
                    </button>
                </li>
            ))}
        </ul>
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
    placeholder,
}: {
    boxRef?: Ref<HTMLTextAreaElement>;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    running: boolean;
    paused: boolean;
    placeholder: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-[78px] items-end gap-2 rounded-[14px] border border-border-strong bg-field py-1.5 pl-3.5 pr-1.5 focus-within:ring-2 focus-within:ring-ring",
                paused && "border-border bg-muted",
            )}
        >
            <Textarea
                ref={boxRef}
                data-ask-ai-box=""
                aria-label="Ask a question or say what to do"
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
                className="max-h-40 min-h-[44px] flex-1 resize-none self-stretch rounded-none border-none bg-transparent px-0 py-2.5 text-[14.5px] leading-[1.4] ring-0 [field-sizing:content] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-transparent"
            />
            {running ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onStop}
                    aria-label="Stop the answer"
                    className="h-11 shrink-0 rounded-[11px] border-[1.5px] border-foreground px-3.5"
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
                    className="size-11 shrink-0 rounded-[11px] [&_svg]:size-[18px]"
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
