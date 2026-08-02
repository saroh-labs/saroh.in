const STEPS = [
    {
        n: "01",
        title: "Pick what you actually do",
        body: "Selling products, taking bookings, or just publishing a site. You switch on those modules and nothing else.",
    },
    {
        n: "02",
        title: "Set it up once",
        // Deliberately does NOT claim "the same customer record is behind an
        // order and a booking". It reads well and it is the product's strongest
        // differentiator, but it is not true yet: commerce `Customer` is
        // store-scoped and the CRM `Contact` is org-scoped, and the two are
        // reconciled only when a human clicks link (CustomerIdentityLink
        // .linkedByUserId). Restore the stronger claim once auto-linking ships
        // — see docs/product-transformation/ SEC-005 / ARCH-002.
        body: "Your catalog, services, contacts and domain live in one system, so you set the business up once instead of stitching four tools together.",
    },
    {
        n: "03",
        title: "Add modules as you grow",
        body: "Turn on Payments when you start charging, Automations when the follow-up gets repetitive. Turning one off keeps the data.",
    },
];

/**
 * Three steps, numbered, in a single row on desktop.
 *
 * Kept deliberately quiet: it sits between two brand-surface sections, and a
 * third loud block in a row would flatten the page's rhythm. The point it is
 * making is sequencing, so the numerals carry the composition rather than
 * colour or imagery.
 */
export function HowItWorks() {
    return (
        <section className="border-t bg-background px-6 py-24 sm:py-28">
            <div className="mx-auto max-w-6xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    How it works
                </p>
                <h2 className="mt-4 max-w-[18ch] font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Grow into the platform, not out of it.
                </h2>

                <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
                    {STEPS.map((step) => (
                        <li key={step.n} className="relative">
                            <span
                                aria-hidden
                                className="block font-display text-5xl font-bold leading-none text-brand/15"
                            >
                                {step.n}
                            </span>
                            <h3 className="mt-4 text-base font-semibold text-foreground">
                                {step.title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {step.body}
                            </p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
