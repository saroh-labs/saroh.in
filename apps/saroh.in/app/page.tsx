import Link from "next/link";

import JoinWaitlist from "@/components/home/join-waitlist";
import { ModuleTable } from "@/components/site/module-table";
import { ProductShot } from "@/components/site/product-shot";

const STEPS = [
    {
        n: "01",
        h: "Say what your business does",
        p: "You answer in outcomes — sell products, take appointments, show up online — not module names.",
    },
    {
        n: "02",
        h: "The workspace changes shape",
        p: "Navigation shows only what you switched on. No half-lit features you cannot use yet.",
    },
    {
        n: "03",
        h: "Add the rest later",
        p: "Switch a module on and its workspace is waiting. Switch it off and nothing is deleted.",
    },
];

export default function HomePage() {
    return (
        <>
            {/* ---- hero ---- */}
            <section className="relative overflow-hidden">
                {/* One faint field, once. The register earns its depth from
                    hairlines and type, not from stacked gradients.

                    The colour is written literally rather than via `from-brand/12`:
                    Tailwind's `from-*` sets `--tw-gradient-from` to a value with a
                    POSITION appended, so interpolating it into a hand-written
                    `radial-gradient()` produced an invalid colour stop and the whole
                    layer rendered as nothing — the hero's only depth device silently
                    absent, on pure black. */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute -top-72 left-1/2 h-[540px] w-[880px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--brand)/0.14),transparent)]"
                />
                <div className="relative mx-auto max-w-6xl px-6 pb-0 pt-28">
                    <span className="inline-flex h-[26px] items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground">
                        <span className="block size-[5px] rounded-full bg-brand" />
                        Modular business platform
                    </span>

                    <h1 className="mt-5 max-w-[16ch] font-display text-[clamp(2.5rem,5.6vw,3.875rem)] font-semibold leading-[1.04] tracking-[-0.038em]">
                        Run your whole business from one place.
                    </h1>

                    <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
                        Website, commerce, appointments and CRM in one system.
                        Switch on only the modules you need — and switch one off
                        without losing anything behind it.
                    </p>

                    <div className="mt-7 flex flex-wrap items-center gap-2.5">
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
                    <p className="mt-3.5 text-[12.5px] text-muted-foreground/70">
                        Not ready?{" "}
                        <Link
                            href="#waitlist"
                            className="text-muted-foreground underline decoration-border underline-offset-4 hover:decoration-current"
                        >
                            Join the waitlist
                        </Link>{" "}
                        instead.
                    </p>

                    <ProductShot
                        name="home"
                        alt="Saroh Home ranking what needs attention: overdue leads and open orders"
                        caption="The workspace · seeded demo data"
                        priority
                    />
                </div>
            </section>

            {/* ---- modules ---- */}
            <section
                id="modules"
                className="mt-28 border-t border-border py-28"
            >
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="mt-3.5 max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Eight capabilities. Three of them need another one
                        first.
                    </h2>
                    <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">
                        Not a feature list — a registry with real dependencies.
                        Turn Appointments on and CRM comes with it, because a
                        booking has to belong to somebody.
                    </p>

                    <ModuleTable />

                    <ProductShot
                        name="modules"
                        alt="The Modules settings screen showing enabled and available modules"
                        caption="Settings → Modules"
                    />
                </div>
            </section>

            {/* ---- product ---- */}
            <section id="product" className="border-t border-border py-28">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="mt-3.5 max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        The first thing on screen is the most consequential
                        thing.
                    </h2>
                    <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">
                        Home ranks work — attention, then overdue, then setup —
                        instead of a dashboard of equal tiles. Each overdue
                        enquiry carries its value and how long it has waited.
                    </p>

                    <div className="mt-2 grid gap-4 md:grid-cols-2">
                        <ProductShot
                            name="leads"
                            alt="The Leads list"
                            caption="CRM · Leads"
                        />
                        <ProductShot
                            name="bookings"
                            alt="The bookings schedule"
                            caption="Appointments · Schedule"
                        />
                    </div>
                </div>
            </section>

            {/* ---- how ---- */}
            <section id="how" className="border-t border-border py-28">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="mt-3.5 max-w-[24ch] font-display text-[clamp(1.625rem,3vw,2.25rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Three steps, in the order you would take them.
                    </h2>

                    <ol className="mt-11 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                        {STEPS.map((s) => (
                            <li key={s.n} className="bg-background p-6">
                                <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground/70">
                                    {s.n}
                                </span>
                                <h3 className="mt-3 text-[15.5px] font-semibold tracking-[-0.01em]">
                                    {s.h}
                                </h3>
                                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                                    {s.p}
                                </p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ---- close ---- */}
            <section id="waitlist" className="border-t border-border py-28">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="mx-auto max-w-[46ch] text-center">
                        <h2 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
                            Start with what you need today.
                        </h2>
                        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
                            Free to start. Source-available under the Elastic
                            License 2.0 — you can read the code.
                        </p>
                        {/* Both asks, together. The hero pairs "Start free"
                            with an escape hatch; this one did not, so a visitor
                            who read the whole page and clicked the final CTA had
                            no fallback at the exact moment of decision — and
                            open signup is still gated (PRODUCT.md). */}
                        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                            <Link
                                href="https://accounts.saroh.in/signup"
                                className="inline-flex h-[38px] items-center rounded-md bg-primary px-[18px] text-[13.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                Start free
                            </Link>
                            <Link
                                href="#waitlist-form"
                                className="inline-flex h-[38px] items-center rounded-md border border-border px-[18px] text-[13.5px] font-medium transition-colors hover:bg-accent"
                            >
                                Join the waitlist
                            </Link>
                        </div>
                    </div>

                    {/* The waitlist stays as the fallback ask, below the
                        primary one, for visitors who are not ready to sign up. */}
                    <div className="mx-auto mt-14 max-w-xl">
                        <JoinWaitlist />
                    </div>
                </div>
            </section>
        </>
    );
}
