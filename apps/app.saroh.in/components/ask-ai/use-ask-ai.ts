"use client";

import type {
    AskAiAbout,
    AskAiConversation,
    AskAiConversationSummary,
    AskAiEvent,
    AskAiLanguage,
    AskAiState,
} from "@saroh/api-contract";
import { ASK_AI_QUESTION_MAX } from "@saroh/api-contract";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import type { Attachment } from "@/lib/ask-ai/images";
import type { AskAiPage } from "@/lib/ask-ai/page-hints";
import { businessPage } from "@/lib/ask-ai/page-hints";
import {
    bookFromAnswer,
    changeAskAiLanguage,
    readAskAiConversation,
    readAskAiConversations,
    readAskAiState,
    turnOnAskAi,
} from "@/lib/ask-ai/panel-actions";
import { startAskAiTurn, stopAskAiTurn } from "@/lib/ask-ai/turn-requests";
import { useAskAiPage } from "./ask-ai-page";
import { readAskAiEvents } from "./stream";
import type { Turn } from "./thread";
import {
    applyEvent,
    askPageHref,
    endLost,
    readsSaved,
    savedTurn,
    turnsOf,
} from "./turns";
import { useAttachments } from "./use-attachments";

/**
 * Ask AI's state and actions (DEC-183): the conversation, the box's draft,
 * asking and the answer as it arrives, Stop, history, the reply language,
 * Turn on. The shell's host holds it, so a conversation outlives its sheet
 * closing; the full page (`/ask`) holds its own. The panel only draws it.
 */

let keys = 0;
const nextKey = () => `t${++keys}`;

export type AskAiHistory = AskAiConversationSummary[] | null | "failed";

export interface UseAskAiOptions {
    state: AskAiState | null;
    /** The full page, `/ask`: its address names the conversation open. */
    page?: boolean;
    /** The page's opening conversation (`?c=`) and list, read on the server. */
    conversation?: AskAiConversation | null;
    conversations?: AskAiConversationSummary[] | null;
    /** False until the panel is first shown: nothing is read before it. */
    active?: boolean;
}

export function useAskAi({
    state: initial,
    page = false,
    conversation,
    conversations,
    active = true,
}: UseAskAiOptions) {
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
    const [history, setHistory] = useState<AskAiHistory>(
        page ? (conversations ?? "failed") : null,
    );
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    // The images in the box (owner, 22 Nov): held here with the draft.
    const attach = useAttachments();
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
    const stopWanted = useRef(false);
    const live = useRef<{ key: string; turnId?: string } | null>(null);

    const running = turns.some((t) => t.running);
    const offLike =
        state?.reason === "business-off" || state?.reason === "unavailable";

    const patch = useCallback((key: string, change: Partial<Turn>) => {
        setTurns((all) =>
            all.map((t) => (t.key === key ? { ...t, ...change } : t)),
        );
    }, []);

    // The page's address names the conversation open, so it can be kept.
    // A new address is read again on the server, so Back to it (from a
    // card's link) shows this conversation, not the router's old copy.
    useEffect(() => {
        if (!page) return;
        const href = askPageHref(conversationId);
        if (window.location.pathname + window.location.search !== href) {
            window.history.replaceState(null, "", href);
            // rq-refresh-ok: only on /ask (`page`), not a React Query route; Home's sheet never passes `page`.
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
    useEffect(() => {
        if (!offLike || !active) return;
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
    }, [offLike, active]);

    const stop = () => {
        stopWanted.current = true;
        if (live.current?.turnId) stopAskAiTurn(live.current.turnId);
    };

    const apply = (
        key: string,
        event: AskAiEvent,
        convo: { id: string | null },
    ) => {
        if (event.type === "turn") {
            if (live.current) live.current.turnId = event.turnId;
            if (event.conversationId) {
                convo.id = event.conversationId;
                setConversationId(event.conversationId);
            }
            if (stopWanted.current) stopAskAiTurn(event.turnId);
        }
        setTurns((all) =>
            all.map((t) => (t.key === key ? applyEvent(t, event) : t)),
        );
    };

    /** `withImages`: the box's own send takes the images in it; a suggestion or Ask again never does. */
    const ask = async (
        question: string,
        withImages = false,
        /** Ask again: the question's own images go again, already uploaded. */
        again: Turn["images"] = [],
    ) => {
        const q = question.trim().slice(0, ASK_AI_QUESTION_MAX);
        const resent: Attachment[] = again.map((i) => ({
            key: i.mediaId,
            name: i.filename,
            status: "ready",
            progress: 100,
            preview: i.url,
            mediaId: i.mediaId,
        }));
        const pictured = resent.length
            ? resent
            : withImages && attach.settled
              ? attach.items
              : [];
        if ((!q && !pictured.length) || running) return;
        const key = nextKey();
        stopWanted.current = false;
        live.current = { key };
        setDraft("");
        setView("thread");
        const sent = resent.length
            ? resent
            : pictured.length
              ? attach.take()
              : [];
        setTurns((all) => [
            ...all,
            {
                key,
                question: q,
                text: "",
                cards: [],
                running: true,
                ...(sent.length
                    ? {
                          images: sent.flatMap((a) =>
                              a.mediaId && a.preview
                                  ? [
                                        {
                                            mediaId: a.mediaId,
                                            url: a.preview,
                                            filename: a.name,
                                        },
                                    ]
                                  : [],
                          ),
                      }
                    : {}),
            },
        ]);
        const convo = { id: conversationId };
        let outcome: Turn["outcome"];
        let refused = false;
        try {
            const body = await startAskAiTurn({
                question: q,
                ...(sent.length
                    ? {
                          images: sent.flatMap((a) =>
                              a.mediaId ? [a.mediaId] : [],
                          ),
                      }
                    : {}),
                ...(conversationId ? { conversationId } : {}),
                ...(about ? { about } : {}),
            });
            if (!body) {
                patch(key, { running: false, outcome: "FAILED" });
                // Not asked: nothing was used, so the images stay in the box.
                if (sent.length && !resent.length) attach.restore(sent);
                return;
            }
            for await (const event of readAskAiEvents(body)) {
                apply(key, event, convo);
                if (event.type === "done") outcome = event.outcome;
                if (event.type === "refused") refused = true;
            }
        } catch {
            // The connection dropped: what arrived stays, said as lost.
            outcome = undefined;
        } finally {
            live.current = null;
            setTurns((all) => all.map((t) => (t.key === key ? endLost(t) : t)));
        }
        // The saved answer: its id, for Report; or, when the connection
        // dropped, the answer itself. And this period's count again.
        const [saved, fresh] = await Promise.all([
            convo.id && readsSaved(outcome)
                ? readAskAiConversation(convo.id).catch(() => null)
                : null,
            readAskAiState().catch(() => null),
        ]);
        const kept = saved ? savedTurn(saved, q) : null;
        // Not asked (no Ask AI left, a busy business): the images stay in the box.
        if (sent.length && refused && !resent.length) attach.restore(sent);
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
            // rq-refresh-ok: only on /ask (`page`), not a React Query route; Home's sheet never passes `page`.
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

    const showHistory = () => {
        setView("history");
        setHistory(null);
        void loadHistory();
    };

    const retryHistory = () => {
        setHistory(null);
        void loadHistory();
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

    // Book here (AF 4): the booking is drafted under the answer, to pick who.
    const book = async (key: string, serviceId: string, startsAt: string) => {
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
    };

    return {
        state,
        turns,
        running,
        conversationId,
        openingTitle: conversation?.title ?? null,
        view,
        setView,
        history,
        draft,
        setDraft,
        attach,
        busy,
        here,
        about,
        cleared,
        setCleared,
        offLike,
        ask,
        stop,
        openConversation,
        startNew,
        showHistory,
        retryHistory,
        setLanguage,
        turnOn,
        retryState,
        book,
    };
}

export type AskAi = ReturnType<typeof useAskAi>;
