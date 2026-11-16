"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useRef, useState } from "react";

import { cn } from "../cn";
import { ring } from "../ring";
import { Caret, useAutoplay } from "./autoplay";
import type { SiteLook } from "./site-drawing";

/** One demo business the closing band's address types: its name, slug and look. */
export interface ClosingName {
    name: string;
    /** "rye-and-co", the part before `.saroh.app`. */
    slug: string;
    look: SiteLook;
}

const Names = createContext<readonly ClosingName[]>([]);

/**
 * Each site's demo businesses, set once in its layout (from its world), so
 * every `ClosingCTA` types them without a page passing anything.
 */
export function ClosingNamesProvider({
    names,
    children,
}: {
    names: readonly ClosingName[];
    children: ReactNode;
}) {
    return <Names.Provider value={names}>{children}</Names.Provider>;
}

const TICK = 90;
/** 1.6s at 90ms a tick. */
const HOLD = 18;

/**
 * The K band's visual (owner, 16 Nov 2026, #46): the address set huge,
 * typing each demo business's slug, holding, deleting, typing the next, and
 * a chip per business in its own colours that jumps the address to it. The
 * server's HTML (and reduced motion) shows the first address whole and
 * still, with no caret. The typing is hidden from screen readers; they read
 * the current address once, with no live region.
 */
export function ClosingAddress({ note = "On Saroh:" }: { note?: ReactNode }) {
    const names = useContext(Names);
    const [k, setK] = useState(0);
    const [len, setLen] = useState(names.length ? names[0].slug.length : 0);
    const [moving, setMoving] = useState(false);
    const at = useRef({ k: 0, len, del: false, hold: 0 });

    useAutoplay(
        () => {
            // The caret shows once the typing runs, never in the server's HTML.
            setMoving(true);
            const s = at.current;
            if (s.hold > 0) {
                s.hold -= 1;
                return;
            }
            const full = names[s.k]?.slug.length ?? 0;
            if (!s.del) {
                if (s.len < full) s.len += 1;
                else {
                    s.del = true;
                    s.hold = HOLD;
                }
            } else if (s.len > 0) s.len -= 1;
            else {
                s.del = false;
                s.k = (s.k + 1) % names.length;
            }
            setK(s.k);
            setLen(s.len);
        },
        TICK,
        { stopped: names.length < 2 },
    );

    if (names.length === 0) return null;
    const current = names[k];

    const pick = (i: number) => {
        const full = names[i]?.slug.length ?? 0;
        at.current = { k: i, len: full, del: false, hold: HOLD };
        setK(i);
        setLen(full);
    };

    return (
        <div className="grid gap-5 min-[760px]:gap-7">
            <p className="m-0 font-display text-mk-kit-address font-bold">
                <span className="sr-only">
                    {current.slug}.saroh.app, one of the businesses on Saroh
                </span>
                <span aria-hidden data-address="">
                    <span className="block whitespace-nowrap min-[1280px]:inline">
                        <span className="text-background">
                            {current.slug.slice(0, len)}
                        </span>
                        {moving ? <Caret /> : null}
                    </span>
                    <span className="block text-mk-on-ink-line min-[1280px]:inline">
                        .saroh.app
                    </span>
                </span>
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="mr-1 text-sm text-mk-on-ink-muted">
                    {note}
                </span>
                {names.map((n, i) => (
                    // A quiet pill, not a button look: the real actions are below.
                    <button
                        key={n.slug}
                        type="button"
                        aria-pressed={i === k}
                        onClick={() => pick(i)}
                        className={cn(
                            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent px-3 text-sm font-medium",
                            i === k
                                ? "text-background"
                                : "text-mk-on-ink-muted hover:text-mk-on-ink",
                            ring({ offset: 3, color: "paper" }),
                        )}
                    >
                        <span
                            aria-hidden
                            style={{
                                background: `hsl(${n.look.bg})`,
                                borderColor: `hsl(${n.look.fg} / 0.25)`,
                            }}
                            className={cn(
                                "size-3.5 rounded-full border",
                                i === k &&
                                    "outline outline-2 outline-offset-2 outline-brand-500",
                            )}
                        />
                        <span
                            className={cn(
                                "underline-offset-4",
                                i === k &&
                                    "underline decoration-brand-500 decoration-2",
                            )}
                        >
                            {n.name}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
