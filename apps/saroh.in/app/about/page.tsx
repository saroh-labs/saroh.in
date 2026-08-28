import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";

import { MODULES } from "@/lib/modules";
import { VERBS, modulesFor } from "@/lib/verbs";

export const metadata: Metadata = {
    title: "About — Saroh",
    description:
        "Sell, arrange, reach, organise, host. Five verbs, eight modules, one workspace — and a plain account of what is built and what is not.",
};

/**
 * The five product principles, quoted from PRODUCT.md rather than rewritten,
 * so the page a visitor reads and the document the product is built against do
 * not drift into two different claims.
 */
const PRINCIPLES = [
    {
        h: "Outcome vocabulary, not module names",
        p: "You answer “what does your business need to do?” in outcomes. The interface keeps those words.",
    },
    {
        h: "Say what is true",
        p: "Claims in the product and on this site match what ships. A capability that is configured-but-broken says so rather than reporting healthy.",
    },
    {
        h: "Reversible by default",
        p: "Choices can be undone. Turning something off never destroys what it held.",
    },
    {
        h: "The most consequential thing is first",
        p: "Home ranks work — attention, then overdue, then setup — instead of a dashboard of equal tiles.",
    },
    {
        h: "Four scenes, one interface",
        p: "Desk, phone, shop floor and evening are all primary. None is a degraded mode of another.",
    },
];

export default function AboutPage() {
    return (
        <>
            {/* ---- the name, read as five verbs ---- */}
            <section className="relative overflow-hidden border-b border-border">
                {/* The same single faint field the home hero uses — written
                    literally, not via `from-brand/12`, for the reason recorded
                    in app/page.tsx: Tailwind appends a POSITION to
                    `--tw-gradient-from`, which is an invalid stop inside a
                    hand-written radial-gradient(). */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute -top-72 left-1/2 h-[540px] w-[880px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--brand)/0.14),transparent)]"
                />
                <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-28">
                    <span className="inline-flex h-[26px] items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground">
                        <span className="block size-[5px] rounded-full bg-brand" />
                        About
                    </span>

                    {/* The acronym IS the headline. Each initial is set in the
                        brand colour and the rest of the word in foreground, so
                        the reading is visible without a single word of
                        explanation — and `aria-label` gives a screen reader the
                        sentence rather than five styled fragments. */}
                    <h1
                        aria-label="Sell. Arrange. Reach. Organise. Host."
                        className="mt-5 max-w-[13ch] font-display text-[clamp(2.5rem,5.6vw,3.875rem)] font-semibold leading-[1.04] tracking-[-0.038em]"
                    >
                        {/* The `{" "}` is load-bearing, not formatting. JSX
                            drops whitespace between elements in an array, so
                            five adjacent spans render as one unbreakable word:
                            it held together on a desktop line and then
                            overflowed on a phone, where the section's
                            `overflow-hidden` clipped it to "Sell. Arrange.
                            Reach." — the acronym silently missing two of its
                            letters on the viewport PRODUCT.md names as
                            primary. A real space is the break opportunity, and
                            it supplies the gap `mr-3` used to. */}
                        {VERBS.map((v) => (
                            <Fragment key={v.letter}>
                                <span aria-hidden>
                                    <span className="text-brand">
                                        {v.letter}
                                    </span>
                                    {v.verb.slice(1)}.
                                </span>{" "}
                            </Fragment>
                        ))}
                    </h1>

                    <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
                        Five verbs, eight modules, one workspace. A small
                        business does some of these on any given day and rarely
                        all of them at once — which is why you switch on the
                        parts you need and leave the rest dark.
                    </p>
                </div>
            </section>

            {/* ---- verb → modules ---- */}
            <section className="border-b border-border py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Each verb is a real part of the product.
                    </h2>
                    <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">
                        Every one of the eight modules sits under exactly one
                        verb below. Nothing is listed twice, and nothing is left
                        out.
                    </p>

                    <ol className="mt-11 grid gap-px overflow-hidden rounded-xl border border-border bg-border">
                        {VERBS.map((v) => (
                            <li
                                key={v.letter}
                                className="grid gap-4 bg-background p-6 sm:grid-cols-[7rem_1fr_auto] sm:items-baseline sm:gap-8"
                            >
                                <div className="flex items-baseline gap-3">
                                    <span
                                        aria-hidden
                                        className="font-display text-[28px] font-semibold leading-none tracking-[-0.03em] text-brand"
                                    >
                                        {v.letter}
                                    </span>
                                    <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                                        {v.verb}
                                    </span>
                                </div>

                                <p className="text-[14px] leading-relaxed text-muted-foreground">
                                    {v.line}
                                </p>

                                {/* The modules are links, not decoration: a
                                    visitor who recognises their own problem in
                                    a verb gets one click to the page that
                                    describes it. */}
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                    {modulesFor(v).map((m) => (
                                        <Link
                                            key={m.key}
                                            href={`/modules/${m.slug}`}
                                            className="inline-flex h-[26px] items-center rounded-md border border-border px-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                        >
                                            {m.label}
                                        </Link>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ol>

                    <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {MODULES.length} modules · {VERBS.length} verbs · each
                        module counted once
                    </p>
                </div>
            </section>

            {/* ---- what is true today ---- */}
            <section className="border-b border-border py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        What is built, and what is not.
                    </h2>
                    <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">
                        An about page is the easiest place in a product to
                        overclaim. This one does not.
                    </p>

                    <div className="mt-11 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                        <div className="bg-background p-6">
                            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
                                Built
                            </h3>
                            <ul className="mt-4 grid gap-2.5 text-[14px] leading-relaxed text-muted-foreground">
                                <li>
                                    A capability registry with real dependencies
                                    — turn Appointments on and CRM comes with
                                    it.
                                </li>
                                <li>
                                    Catalog, inventory, carts and orders, with
                                    stock that moves when an order does.
                                </li>
                                <li>
                                    Contacts, leads and a pipeline; services,
                                    availability and bookings.
                                </li>
                                <li>
                                    One identity across every surface, and a
                                    workspace shared by a team.
                                </li>
                            </ul>
                        </div>

                        <div className="bg-background p-6">
                            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                                Not yet
                            </h3>
                            <ul className="mt-4 grid gap-2.5 text-[14px] leading-relaxed text-muted-foreground">
                                {/* PRODUCT.md forbids reintroducing the
                                    unified-customer claim until auto-linking
                                    ships (removed in 38b8b87). Naming it as an
                                    open gap is the one way to mention it
                                    without claiming it. */}
                                <li>
                                    One customer record behind an order{" "}
                                    <em>and</em> a booking. Linking the two is
                                    still manual, so we do not claim it.
                                </li>
                                <li>
                                    Open signup — Saroh is waitlist-only while
                                    the onboarding work lands.
                                </li>
                                <li>
                                    Usage figures of any kind. There is no
                                    product analytics, so there are no numbers
                                    to quote and none are invented here.
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* ---- principles ---- */}
            <section className="border-b border-border py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Five rules the product is held to.
                    </h2>

                    <ol className="mt-11 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                        {PRINCIPLES.map((p, i) => (
                            <li
                                key={p.h}
                                /* Five cards in a 2- or 3-column grid leaves a
                                   hole, and the hole is not empty: the grid's
                                   `bg-border` shows through the `gap-px` as a
                                   solid grey block the size of a card, reading
                                   as a broken sixth principle. The last card
                                   spans the remainder at both breakpoints —
                                   2 cols: 2+2+1(span 2); 3 cols: 3+1+1(span 2). */
                                className={`bg-background p-6 ${
                                    i === PRINCIPLES.length - 1
                                        ? "sm:col-span-2"
                                        : ""
                                }`}
                            >
                                <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground/70">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <h3 className="mt-3 text-[15.5px] font-semibold tracking-[-0.01em]">
                                    {p.h}
                                </h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                                    {p.p}
                                </p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ---- close ---- */}
            <section className="py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="mx-auto max-w-[46ch] text-center">
                        <h2 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
                            Start with one verb.
                        </h2>
                        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
                            Whichever one your business does today. The other
                            four are waiting, switched off, costing you nothing.
                        </p>
                        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                            <Link
                                href="https://accounts.saroh.in/signup"
                                className="inline-flex h-[38px] items-center rounded-md bg-primary px-[18px] text-[13.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                Start free
                            </Link>
                            <Link
                                href="/modules"
                                className="inline-flex h-[38px] items-center rounded-md border border-border px-[18px] text-[13.5px] font-medium transition-colors hover:bg-accent"
                            >
                                See the modules
                            </Link>
                        </div>
                        {/* Open signup is gated (PRODUCT.md), so the escape
                            hatch travels with every primary ask on this site. */}
                        <p className="mt-3.5 text-[12.5px] text-muted-foreground/70">
                            Not ready?{" "}
                            <Link
                                href="/#waitlist"
                                className="text-muted-foreground underline decoration-border underline-offset-4 hover:decoration-current"
                            >
                                Join the waitlist
                            </Link>{" "}
                            instead.
                        </p>
                    </div>
                </div>
            </section>
        </>
    );
}
