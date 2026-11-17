"use client";

import { useRef, useState } from "react";

import { cn } from "../cn";
import { Caret, useAutoplay } from "./autoplay";
import { Chip } from "./chip";

/** One question the band asks, and what Ask AI answers. */
export interface AskQuestion {
    /** The chip: "What sold most?". */
    label: string;
    /** The question as typed: "What sold most this week?". */
    text: string;
    answer: string;
    /** The parts of the business it read: "Orders, Products". */
    from: string;
}

/** Ask AI's closing words (#46, board "N · the question types itself"). */
export interface AskTypesWords {
    /** Names the chips for a screen reader: "Ask one". */
    pick: string;
    /** "Read from", before the parts it read. */
    readFrom: string;
    questions: readonly AskQuestion[];
}

const TICK = 60;
/** 3.3s with the answer showing, at 60ms a tick. */
const HOLD = 55;

/**
 * Ask AI's closing picture (owner, 16 Nov 2026, #46 "N"): a question types
 * itself large, then the answer with a green dot and what it read, then the
 * next question. Only while the band is in view and the tab is showing; a
 * picked chip shows that question answered and stops it for good, and
 * reduced motion never starts it. The server's HTML is the first question
 * answered, with no caret. Screen readers get the question and answer once,
 * with no live region.
 */
export function AskTypes({ words }: { words: AskTypesWords }) {
    const qs = words.questions;
    const root = useRef<HTMLDivElement>(null);
    const [q, setQ] = useState(0);
    const [len, setLen] = useState(qs[0]?.text.length ?? 0);
    const [picked, setPicked] = useState(false);
    const [moving, setMoving] = useState(false);
    const at = useRef({ q: 0, len, hold: HOLD });

    useAutoplay(
        () => {
            setMoving(true);
            const s = at.current;
            const full = qs[s.q]?.text.length ?? 0;
            if (s.len < full) s.len += 1;
            else if (s.hold > 0) s.hold -= 1;
            else {
                s.q = (s.q + 1) % qs.length;
                s.len = 0;
                s.hold = HOLD;
            }
            setQ(s.q);
            setLen(s.len);
        },
        TICK,
        { stopped: picked || qs.length < 2, watch: root },
    );

    if (qs.length === 0) return null;
    const cur = qs[q];
    const done = len >= cur.text.length;

    const pick = (i: number) => {
        const full = qs[i]?.text.length ?? 0;
        at.current = { q: i, len: full, hold: HOLD };
        setQ(i);
        setLen(full);
        setPicked(true);
        setMoving(false);
    };

    return (
        <div
            ref={root}
            data-ask-types=""
            className="grid w-full gap-4 justify-self-stretch min-[760px]:gap-6"
        >
            <p className="sr-only">
                {cur.text} {cur.answer} {words.readFrom} {cur.from}.
            </p>
            <div aria-hidden className="grid gap-4">
                <p
                    data-question=""
                    className="m-0 min-h-[2.2em] font-display text-mk-kit-h1 font-bold text-background"
                >
                    {cur.text.slice(0, len)}
                    {moving ? <Caret /> : null}
                </p>
                <p
                    data-answer=""
                    className={cn(
                        "m-0 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[18px] text-mk-on-ink",
                        !done && "invisible",
                    )}
                >
                    <span className="size-2 shrink-0 rounded-full bg-mk-ok" />
                    {cur.answer}
                    <span className="text-[14px] text-mk-on-ink-muted">
                        {words.readFrom} {cur.from}
                    </span>
                </p>
            </div>
            <div
                role="group"
                aria-label={words.pick}
                className="flex flex-wrap gap-2"
            >
                {qs.map((x, i) => (
                    <Chip
                        key={x.label}
                        variant="ink"
                        on={i === q}
                        onClick={() => pick(i)}
                    >
                        {x.label}
                    </Chip>
                ))}
            </div>
        </div>
    );
}
