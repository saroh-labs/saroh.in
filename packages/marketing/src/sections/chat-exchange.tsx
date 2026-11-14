import { Sparkles, Wrench } from "lucide-react";

import { cn } from "../cn";
import type { ChatOutcome, ChatWords } from "../content/types";
import { Pill } from "../links/pill";

/**
 * Each outcome's pill: its words say it, not its colour alone. The same
 * words as the trade pages' "Ask your AI assistant" (`@saroh/search-pages`
 * `ai-asks.tsx`), mirrored: that package draws with its own styles and
 * neither depends on the other.
 */
export const OUTCOME_PILL: Record<
    ChatOutcome,
    { tone: "ok" | "soon" | "outline"; text: string }
> = {
    at_once: { tone: "ok", text: "Changed at once" },
    draft: { tone: "soon", text: "Draft to publish" },
    answer: { tone: "outline", text: "Just an answer" },
};

/**
 * A chat in an AI app, drawn in HTML (board VFAiApps): another company's
 * screen can't be captured for our pages, so the ask, the reply, the record
 * it touched and the outcome pill are text inside a `figure`, whose caption
 * names what it depicts.
 */
export function ChatExchange({
    words,
    className,
}: {
    words: ChatWords;
    className?: string;
}) {
    const pill = OUTCOME_PILL[words.outcome];
    return (
        <figure
            data-chat={words.outcome}
            className={cn(
                "m-0 min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-mk-shot",
                className,
            )}
        >
            <figcaption className="sr-only">{words.caption}</figcaption>
            <div
                aria-hidden
                className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-[14px] font-semibold"
            >
                <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Sparkles className="size-3.5" />
                </span>
                Your AI assistant
                <Pill tone="ok" className="ml-auto">
                    Saroh connected
                </Pill>
            </div>
            <div className="grid gap-3 p-4 text-[14px] leading-[1.5] sm:p-5">
                <p className="m-0 max-w-[85%] justify-self-end rounded-[14px] bg-background px-3.5 py-2.5">
                    <span className="sr-only">You: </span>
                    {words.ask}
                </p>
                {words.tools ? (
                    <p className="m-0 inline-flex items-center gap-1.5 justify-self-start rounded-full border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground">
                        <Wrench aria-hidden className="size-3" />
                        <span className="sr-only">It used: </span>
                        {words.tools}
                    </p>
                ) : null}
                <p className="m-0 [text-wrap:pretty]">
                    <span className="sr-only">Assistant: </span>
                    {words.reply}
                </p>
                {/* As drawn: the outcome sits on the record it touched. */}
                {words.result ? (
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[12px] border border-border bg-background px-3.5 py-2.5">
                        <p className="m-0 grid min-w-0 flex-[1_1_200px] gap-0.5">
                            <b className="font-semibold">
                                {words.result.title}
                            </b>
                            <span className="text-[13px] text-muted-foreground">
                                {words.result.line}
                            </span>
                        </p>
                        <Pill tone={pill.tone} className="ml-auto shrink-0">
                            {pill.text}
                        </Pill>
                    </div>
                ) : (
                    <Pill tone={pill.tone} className="justify-self-start">
                        {pill.text}
                    </Pill>
                )}
            </div>
        </figure>
    );
}
