"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import {
    ChevronLeft,
    History,
    Info,
    Maximize2,
    Pencil,
    Power,
    Search,
    Sparkles,
    Undo2,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";

import { businessPage } from "@/lib/ask-ai/page-hints";
import { MARKETING_URL } from "@/lib/help/links";
import { AboutLabel } from "./about-label";
import { Composer } from "./composer";
import { LanguageSelect } from "./language-select";
import { MoreMenu } from "./more-menu";
import {
    ConversationList,
    OffCard,
    PlanLocked,
    RoleLocked,
} from "./panel-states";
import { Suggestions } from "./suggestions";
import type { TurnContext } from "./thread";
import { One, RefusalMessage, TurnView } from "./thread";
import { askPageHref, matching } from "./turns";
import type { AskAi } from "./use-ask-ai";
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
 * cards, Stop, and every way a question ends. It only draws: the state and
 * actions come in as `ai` (`use-ask-ai.ts`). The same body in the shell's
 * sheet (`ask-ai-host.tsx`, desk and phone) and on the full page, `/ask`.
 */

const PRIVACY_HREF = `${MARKETING_URL}/privacy`;

export interface AskAiPanelProps {
    ai: AskAi;
    businessName: string;
    zone: string;
    phone: boolean;
    /** The sheet's close, for Not now and Open as a full page. */
    onClose?: () => void;
    boxRef?: Ref<HTMLTextAreaElement>;
    /** "page": `/ask`, the conversation list beside a wider conversation. */
    layout?: "panel" | "page";
}

const focusBox = () =>
    document.querySelector<HTMLTextAreaElement>("[data-ask-ai-box]")?.focus();

export function AskAiPanel({
    ai,
    businessName,
    zone,
    phone,
    onClose,
    boxRef,
    layout = "panel",
}: AskAiPanelProps) {
    const page = layout === "page";
    const router = useRouter();
    const {
        state,
        turns,
        running,
        conversationId,
        view,
        history,
        here,
        about,
        cleared,
        offLike,
        busy,
    } = ai;
    const [query, setQuery] = useState("");
    const end = useRef<HTMLDivElement>(null);

    useEffect(() => {
        end.current?.scrollIntoView({ block: "end" });
    }, [turns]);

    const lastRefusal = turns.at(-1)?.refusal?.reason;
    const ctx: TurnContext = {
        businessName,
        zone,
        phone,
        onEdit: (q) => {
            ai.setDraft(q);
            focusBox();
        },
        onAgain: (q) => void ai.ask(q),
        onBook: ai.book,
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
        ai.showHistory();
    };
    const newButton = (
        <IconButton
            label="New conversation"
            icon={<Pencil />}
            size="md"
            className={ib}
            onClick={ai.startNew}
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
    const more = state?.canSwitch ? <MoreMenu className={ib} /> : null;
    const back = (
        <IconButton
            label="Back to the conversation"
            icon={<ChevronLeft />}
            size="md"
            className={ib}
            onClick={() => ai.setView("thread")}
        />
    );

    // The sheet's own close sits at the top right: the header clears it.
    const header =
        view === "history" ? (
            // AF 9: back, the list's name, and the full page.
            <div className="flex h-[60px] shrink-0 items-center gap-0.5 border-b border-border pr-10">
                {back}
                <h2 className="m-0 ml-1 flex-1 font-display text-base font-semibold">
                    {title}
                </h2>
                {expandButton}
            </div>
        ) : (
            <div className="flex h-[60px] shrink-0 items-center gap-0.5 border-b border-border pr-10">
                <Sparkles className="size-[18px] shrink-0" aria-hidden />
                <h2 className="m-0 ml-2 flex-1 font-display text-base font-semibold">
                    {title}
                </h2>
                {tools ? (
                    <>
                        {phone ? null : newButton}
                        {historyButton}
                        {more}
                        {expandButton}
                    </>
                ) : null}
            </div>
        );

    const listed = Array.isArray(history) ? matching(history, query) : history;
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
                        onClick={ai.retryHistory}
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
                onOpen={(id) => void ai.openConversation(id)}
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
                onClick: () => ai.setCleared(true),
            }}
        />
    ) : cleared && here.about ? (
        <AboutLabel
            plain
            words={`All of ${businessName}`}
            action={{
                label: `Ask about ${here.about.label} again`,
                icon: <Undo2 />,
                onClick: () => ai.setCleared(false),
            }}
        />
    ) : null;
    const offered = about ? here : businessPage();

    let content: ReactNode;
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
                        onClick={ai.retryState}
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
                        onTurnOn={ai.turnOn}
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
                    onAsk={(q) => void ai.ask(q)}
                    onFill={(words) => {
                        ai.setDraft(words);
                        focusBox();
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
                onClick={() => ai.setView("history")}
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
                    page ? "px-6 pb-3 pt-6" : "pb-3 pt-[18px]",
                )}
            >
                {page ? (
                    <div className="mx-auto flex w-full max-w-[662px] flex-col gap-3.5">
                        <h2 className="sr-only">
                            {openSummary?.title ??
                                ai.openingTitle ??
                                turns.at(0)?.question ??
                                "New conversation"}
                        </h2>
                        {tools && more ? (
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
                <p className="m-0 flex shrink-0 items-center gap-2 border-t border-border py-3.5 text-[13px] text-neutral-700 dark:text-foreground">
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
                            : "border-t border-border",
                        !page && phone && "pb-[env(safe-area-inset-bottom)]",
                    )}
                >
                    <Composer
                        boxRef={boxRef}
                        value={ai.draft}
                        onChange={ai.setDraft}
                        onSend={() => void ai.ask(ai.draft)}
                        onStop={ai.stop}
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
                    {state ? (
                        <LanguageSelect
                            language={state.language}
                            onLanguage={(l) => void ai.setLanguage(l)}
                        />
                    ) : null}
                </div>
            ) : null}
            {!page && view === "history" && tools ? (
                // AF 9: a new conversation from the list's foot.
                <div
                    className={cn(
                        "shrink-0 border-t border-border pt-3",
                        phone && "pb-[env(safe-area-inset-bottom)]",
                    )}
                >
                    <Button
                        type="button"
                        className="h-11 w-full"
                        onClick={ai.startNew}
                        disabled={running}
                    >
                        <Pencil aria-hidden />
                        New conversation
                    </Button>
                </div>
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
                            onClick={ai.startNew}
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
