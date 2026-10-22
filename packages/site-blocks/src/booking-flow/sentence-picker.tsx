"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";

/**
 * Folio's sentence (DEC-172, VA08a–e, plan U10): "I'd like a Private
 * session with Meera on Thu 22 Oct at 8 am." The sentence is the progress:
 * each step fills one phrase, and each phrase is a button ("Change class,
 * Hatha yoga") that opens its own list, so a choice made earlier is
 * changed without walking back.
 *
 * The list is a real listbox: Enter, Space or Arrow down opens it with the
 * chosen option focused; the arrows, Home and End move; Enter or Space
 * picks; Escape and Tab close it; focus goes back to the phrase. The price
 * that follows from a pick is said in a polite live region. Each phrase
 * and option is 44px tall on a phone. Nothing here moves for longer than
 * the look's 200ms.
 */

export interface PhraseOption {
    id: string;
    label: string;
    /** A second line: "60 min · ₹2,500". */
    sub?: string;
}

export interface Phrase {
    /** What it is called in its button: "class", "teacher", "time". */
    kind: string;
    /** The words before it: "I'd like", "with", "on". */
    before: string;
    /** What is chosen, as the sentence says it; null for none yet. */
    value: string | null;
    /** What the phrase says while nothing is chosen: "a day and time". */
    placeholder: string;
    options: PhraseOption[];
    selected: string | null;
    onPick: (id: string) => void;
    /**
     * Where there is nothing to list yet (the times aren't read), the
     * phrase goes to its step instead.
     */
    onOpenStep?: () => void;
}

export function SentencePicker({
    phrases,
    announce,
}: {
    phrases: Phrase[];
    /** What a pick comes to ("Private session · ₹2,500"), said politely. */
    announce: string;
}) {
    // Said only after a pick, so the page doesn't read it on arrival.
    const [said, setSaid] = useState("");
    const picked = useRef(false);
    useEffect(() => {
        if (!picked.current) return;
        picked.current = false;
        setSaid(announce);
    }, [announce]);

    return (
        <div data-sentence-picker="">
            <p className="font-site-heading text-site-fg text-[calc(1.4375rem*var(--site-heading-scale,1))] font-light leading-[1.62] tracking-[-0.02em] min-[700px]:text-[calc(1.875rem*var(--site-heading-scale,1))] min-[700px]:leading-[1.32]">
                {phrases.map((phrase, i) => (
                    <span key={phrase.kind}>
                        {phrase.before}{" "}
                        <PhraseButton
                            phrase={{
                                ...phrase,
                                onPick: (id) => {
                                    picked.current = true;
                                    phrase.onPick(id);
                                },
                            }}
                        />
                        {i < phrases.length - 1 ? " " : "."}
                    </span>
                ))}
            </p>
            <span aria-live="polite" className="sr-only">
                {said}
            </span>
        </div>
    );
}

function PhraseButton({ phrase }: { phrase: Phrase }) {
    const listId = useId();
    const button = useRef<HTMLButtonElement>(null);
    const items = useRef<(HTMLLIElement | null)[]>([]);
    const [open, setOpen] = useState(false);
    const [at, setAt] = useState(0);
    const { options } = phrase;

    useEffect(() => {
        if (open) items.current[at]?.focus();
    }, [open, at]);

    // A press anywhere else closes the list.
    useEffect(() => {
        if (!open) return;
        const away = (e: PointerEvent) => {
            const box = button.current?.parentElement;
            if (box && !box.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", away);
        return () => document.removeEventListener("pointerdown", away);
    }, [open]);

    const show = () => {
        if (options.length === 0) {
            phrase.onOpenStep?.();
            return;
        }
        const chosen = options.findIndex((o) => o.id === phrase.selected);
        setAt(chosen < 0 ? 0 : chosen);
        setOpen(true);
    };
    const close = () => {
        setOpen(false);
        button.current?.focus();
    };
    const pick = (i: number) => {
        const option = options[i];
        close();
        phrase.onPick(option.id);
    };

    const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
        }
    };
    const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
        const last = options.length - 1;
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setAt((i) => Math.min(last, i + 1));
                return;
            case "ArrowUp":
                e.preventDefault();
                setAt((i) => Math.max(0, i - 1));
                return;
            case "Home":
                e.preventDefault();
                setAt(0);
                return;
            case "End":
                e.preventDefault();
                setAt(last);
                return;
            case "Enter":
            case " ":
                e.preventDefault();
                pick(at);
                return;
            case "Escape":
                // The list's own: the frame stays open.
                e.preventDefault();
                e.stopPropagation();
                close();
                return;
            case "Tab":
                setOpen(false);
                return;
        }
    };

    const shown = phrase.value ?? phrase.placeholder;
    return (
        <span className="relative inline-block">
            <button
                ref={button}
                type="button"
                aria-haspopup={options.length > 0 ? "listbox" : undefined}
                aria-expanded={options.length > 0 ? open : undefined}
                aria-controls={open ? listId : undefined}
                aria-label={
                    phrase.value
                        ? `Change ${phrase.kind}, ${phrase.value}`
                        : `Choose ${phrase.kind}`
                }
                onClick={() => (open ? close() : show())}
                onKeyDown={onButtonKey}
                // VA08's `.sw`: dotted all round in the accent, `.sw-e` muted
                // italic on the control edge while empty, `.sw-on` filled open.
                className={cn(
                    "my-px inline-flex min-h-11 cursor-pointer items-center gap-[0.18em] border border-dotted py-0 pl-[0.3em] pr-[0.22em] text-left leading-[1.15]",
                    phrase.value
                        ? "border-site-accent-text text-site-accent-text"
                        : "border-site-rule text-site-muted italic",
                    open && "bg-site-accent-soft border-solid",
                    LOOK_RING,
                    LOOK_EASE,
                )}
            >
                <span>{shown}</span>
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-[0.6em] shrink-0"
                    fill="none"
                >
                    <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {open ? (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={phrase.kind}
                    onKeyDown={onListKey}
                    data-site-fade=""
                    className="border-site-fg bg-site-surface font-site-body absolute left-0 top-full z-20 mt-1 max-h-[min(60vh,420px)] w-[min(86vw,360px)] overflow-y-auto border p-1 text-base font-normal leading-snug tracking-normal shadow-[0_8px_24px_hsl(var(--site-fg)/0.14)]"
                >
                    {options.map((option, i) => {
                        const on = option.id === phrase.selected;
                        return (
                            <li
                                key={option.id}
                                ref={(el) => {
                                    items.current[i] = el;
                                }}
                                role="option"
                                aria-selected={on}
                                tabIndex={i === at ? 0 : -1}
                                onClick={() => pick(i)}
                                onMouseEnter={() => setAt(i)}
                                className={cn(
                                    "text-site-fg flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 outline-none",
                                    i === at &&
                                        "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-surface)))]",
                                    "focus-visible:ring-site-fg focus-visible:ring-2 focus-visible:ring-inset",
                                )}
                            >
                                <span className={on ? "font-semibold" : ""}>
                                    {option.label}
                                </span>
                                {option.sub ? (
                                    <span className="text-site-body text-[13px]">
                                        {option.sub}
                                    </span>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </span>
    );
}
