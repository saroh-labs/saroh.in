"use client";

import {
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { focusRing, inputFill, quietFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { TestReleaseRefusal } from "../test-release/words";
import type { AccountMessage, AccountThread, Block } from "./model";
import { messageMeta } from "./model";
import { Unavailable } from "./parts";

/**
 * Messages, in the customer's account (round-2 A13; Saroh Customer Site
 * design, the Messages tab): their one thread with the business — their own
 * messages on the right in the accent, the business's on the left in a
 * quiet fill — and a line to write the next one. The team answers from the
 * workspace; the answer shows here.
 *
 * Every message is drawn as text, never HTML. Sending goes through the
 * site's server action (`api.send`), which answers with the message as the
 * API stored it, or a sentence to show (too many at once, signed out, …).
 * Drawn from the site's own tokens (H1), never Saroh's.
 */

export type SendResult =
    | { ok: true; message: AccountMessage }
    | { ok: false; message: string }
    | TestReleaseRefusal;

export interface MessagesApi {
    send: (text: string) => Promise<SendResult>;
}

export interface AccountMessagesProps {
    businessName: string;
    thread: Block<AccountThread>;
    api: MessagesApi;
    /** The longest message the API takes. */
    maxLength?: number;
}

const MAX = 2_000;

/** The visitor's own zone, once in the browser; null while on the server. */
function useVisitorZone(): string | null {
    return useSyncExternalStore(
        () => () => undefined,
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        () => null,
    );
}

export function AccountMessages({
    businessName,
    thread,
    api,
    maxLength = MAX,
}: AccountMessagesProps) {
    const id = useId();
    const zone = useVisitorZone();
    const [sent, setSent] = useState<AccountMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const end = useRef<HTMLDivElement>(null);

    const messages = thread.ok ? [...thread.value.messages, ...sent] : sent;
    const text = draft.trim();

    // The newest message in view: on open, and after each one sent.
    useEffect(() => {
        const el = end.current;
        // jsdom draws no layout, so it has no scrollIntoView.
        if (el && "scrollIntoView" in el) el.scrollIntoView({ block: "end" });
    }, [messages.length]);

    async function send() {
        if (!text || sending) return;
        setSending(true);
        setProblem(null);
        const result = await api.send(text).catch((): SendResult => ({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        }));
        setSending(false);
        if (!result.ok) {
            // The words stay in the box, so nothing is lost.
            setProblem(result.message);
            return;
        }
        setSent((list) => [...list, result.message]);
        setDraft("");
    }

    const meta = (m: AccountMessage) =>
        zone
            ? messageMeta(m, businessName, new Date(), zone)
            : m.from === "me"
              ? "You"
              : businessName;

    return (
        <div className="grid gap-3.5">
            <section
                aria-labelledby={`${id}-title`}
                className="bg-site-surface border-site-border grid gap-2 rounded-[calc(var(--site-radius)+14px)] border p-3.5"
            >
                <h2 id={`${id}-title`} className="sr-only">
                    Your messages with {businessName}
                </h2>
                {!thread.ok ? <Unavailable what="Your messages" /> : null}
                {thread.ok && thread.value.earlier ? (
                    <p className="text-site-muted text-center text-[12px]">
                        Older messages aren&apos;t shown here. Ask{" "}
                        {businessName} if you need one.
                    </p>
                ) : null}
                {thread.ok && messages.length === 0 ? (
                    <p className="text-site-body text-sm leading-normal">
                        Write to {businessName} here: a question, a change to a
                        booking, anything. Their answer shows in this thread.
                    </p>
                ) : null}
                {messages.length > 0 ? (
                    <ol
                        aria-label={`Messages with ${businessName}`}
                        className="m-0 grid list-none gap-2 p-0"
                    >
                        {messages.map((m) => (
                            <li
                                key={m.ref}
                                className={cn(
                                    "grid",
                                    m.from === "me"
                                        ? "justify-items-end"
                                        : "justify-items-start",
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[80%] whitespace-pre-line break-words px-[13px] py-2.5 text-[14.5px] leading-[1.45]",
                                        m.from === "me"
                                            ? "bg-site-accent text-site-accent-fg rounded-[14px_14px_4px_14px]"
                                            : cn(
                                                  quietFill,
                                                  "text-site-fg rounded-[14px_14px_14px_4px]",
                                              ),
                                    )}
                                >
                                    {m.text}
                                </div>
                                <div className="text-site-muted mt-[3px] text-[11px]">
                                    {meta(m)}
                                </div>
                            </li>
                        ))}
                    </ol>
                ) : null}
                <div ref={end} />
                <form
                    className="mt-1.5 flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                    }}
                >
                    <input
                        type="text"
                        aria-label="Message"
                        aria-describedby={
                            problem ? `${id}-problem` : `${id}-note`
                        }
                        aria-invalid={problem ? true : undefined}
                        placeholder="Write a message…"
                        maxLength={maxLength}
                        value={draft}
                        disabled={!thread.ok}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            if (problem) setProblem(null);
                        }}
                        className={cn(
                            "border-site-border text-site-fg placeholder:text-site-muted h-11 min-w-0 flex-1 rounded-[calc(var(--site-radius)+6px)] border px-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-60",
                            inputFill,
                            focusRing,
                        )}
                    />
                    <button
                        type="submit"
                        disabled={!text || sending || !thread.ok}
                        className={cn(
                            "bg-site-accent text-site-accent-fg h-11 cursor-pointer rounded-[calc(var(--site-radius)+6px)] px-4 font-bold transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-default disabled:opacity-60",
                            focusRing,
                        )}
                    >
                        {sending ? "Sending…" : "Send"}
                    </button>
                </form>
                {problem ? (
                    <p
                        id={`${id}-problem`}
                        role="alert"
                        className="text-site-fg text-[12.5px]"
                    >
                        {problem}
                    </p>
                ) : null}
                <p id={`${id}-note`} className="text-site-muted text-[12px]">
                    The team replies here. Come back to Messages to see their
                    answer.
                </p>
            </section>
        </div>
    );
}
