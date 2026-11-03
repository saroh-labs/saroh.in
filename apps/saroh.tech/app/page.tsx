import Link from "next/link";

import { ClientPageScreen, OverdueScreen } from "@/components/home/screens";
import { ButtonLink } from "@/components/shared/button";
import { Card, LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { TextLink } from "@/components/shared/text-link";
import { CHANGELOG, changelogPath } from "@/content/changelog";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/");

export const metadata = pageMetadata(page);

const WRAP = "mx-auto w-full max-w-[1440px] px-4 md:px-20";
const H2 =
    "m-0 font-display text-[32px] font-bold leading-[1.05] tracking-[-0.045em] md:text-5xl md:leading-[1.02]";
const LEAD =
    "m-0 text-[16.5px] leading-normal text-body md:text-[19px] md:leading-[1.55]";

const EDGES = [
    [
        "We never touch your money",
        "0% fees, no holds, no frozen accounts. Clients pay you directly.",
    ],
    [
        "Client pages on every plan",
        "Free included. One link, no login for your client.",
    ],
    [
        "Approvals with history",
        'Every version and every "yes", with the time it happened.',
    ],
    [
        "Reminders from you",
        "Sent from your own email or WhatsApp, so they get read.",
    ],
] as const;

const STEPS = [
    ["Send a quote", "Pick saved services, set a deposit, send the link."],
    ["Get a yes", "Your client accepts on their client page. You see when."],
    [
        "Invoice in one tap",
        "The accepted quote becomes an invoice. Nothing typed twice.",
    ],
    [
        "Get paid",
        "They pay through your own link. You record it, the receipt is made.",
    ],
] as const;

const TOOLS = [
    {
        title: "Invoice generator",
        line: "A clean PDF in two minutes.",
        href: "/tools/invoice-generator",
    },
    {
        title: "Quote and estimate maker",
        line: "A clear price before you start.",
        href: "/tools/quote-maker",
    },
    {
        title: "Receipt maker",
        line: "Show a client they've paid.",
        href: "/tools/receipt-maker",
        desk: true,
    },
    {
        title: "Payment reminder writer",
        line: "Friendly, firm or final.",
        href: "/tools/payment-reminder",
    },
    {
        title: "Late fee calculator",
        line: "Work out what to add.",
        href: "/tools/late-fee-calculator",
        desk: true,
    },
    {
        title: "VAT and sales tax calculator",
        line: "Add tax or take it out.",
        href: "/tools/vat-calculator",
        desk: true,
    },
];

const FAQS = [
    {
        question: "Do you take a cut when my client pays?",
        answer: "No. Payments go straight to your own Stripe, PayPal or bank. We only record that it happened. Your payment provider's own fees still apply.",
    },
    {
        question: "Does my client need an account?",
        answer: "No. Your client opens one link and sees everything. No login needed.",
    },
    {
        question: "Which countries and currencies work?",
        answer: "Quotes and invoices work in any currency. Clients pay through your own Stripe, PayPal or bank, so where you can get paid depends on them.",
    },
    {
        question: "Can I bring my clients from another app?",
        answer: "Yes. Import your clients by CSV.",
    },
    {
        question: "Can I leave with all my data?",
        answer: "Yes. Export all your data any time.",
    },
];

// An entry still marked example would make this page hold a placeholder.
const LATEST = CHANGELOG.filter((e) => !e.example).slice(0, 3);

export default function HomePage() {
    return (
        <div data-page-type={page.type} className="flex flex-col">
            <JsonLd data={pageSchema(page)} />

            <section
                className={`${WRAP} grid items-center gap-9 pb-0 pt-7 xl:grid-cols-[minmax(0,1fr)_600px] xl:gap-14 xl:pb-20 xl:pt-16`}
            >
                <div className="flex flex-col gap-[18px] md:gap-6">
                    <span className="text-[13px] font-semibold text-quiet md:text-sm md:tracking-[.02em]">
                        For freelancers and small service businesses
                    </span>
                    <h1 className="m-0 font-display text-[44px] font-bold leading-none tracking-[-0.05em] md:text-[76px] md:leading-[0.98]">
                        {page.h1}
                    </h1>
                    <p className={LEAD}>
                        Send a quote, get a yes, invoice in one tap. Your client
                        pays you through your own Stripe, PayPal or bank. We
                        never touch your money.
                    </p>
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-5">
                        <ButtonLink
                            href={signupHref(page.type)}
                            data-cta="start-free-page"
                        >
                            Start free
                        </ButtonLink>
                        <TextLink
                            href="/tools/invoice-generator"
                            className="justify-center"
                        >
                            Try the free invoice generator →
                        </TextLink>
                    </div>
                    <div className="flex justify-center gap-2 text-[13px] text-body md:justify-start md:gap-5 md:text-[14.5px]">
                        <span>0% fees on payments</span>
                        <span aria-hidden="true">·</span>
                        <span>Cancel any time</span>
                    </div>
                </div>
                <ClientPageScreen />
            </section>

            <section className="mt-9 bg-ink text-paper xl:mt-0">
                <div
                    className={`${WRAP} grid divide-y divide-paper/15 py-3 md:grid-cols-2 md:gap-8 md:divide-y-0 md:py-14 xl:grid-cols-4`}
                >
                    {EDGES.map(([title, line]) => (
                        <div
                            key={title}
                            className="flex flex-col gap-1 py-4 md:gap-2 md:py-0"
                        >
                            <span className="font-display text-[19px] font-bold tracking-[-0.03em] md:text-[21px]">
                                {title}
                            </span>
                            <span className="text-[15px] leading-normal text-[#D8D5CC]">
                                {line}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section
                className={`${WRAP} flex flex-col gap-3.5 pb-4 pt-12 md:gap-9 md:pb-10 md:pt-24`}
            >
                <div className="flex max-w-[760px] flex-col gap-3.5">
                    <h2 className={H2}>From quote to paid, in four steps.</h2>
                    <p className={`${LEAD} hidden md:block`}>
                        No new habits. It&apos;s the way you already work, with
                        less chasing.
                    </p>
                </div>
                <ol className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
                    {STEPS.map(([title, line], i) => (
                        <li key={title}>
                            <Card className="h-full !gap-1.5 !p-[18px] md:!gap-2.5 md:!p-6">
                                <span className="font-mono text-[13px] text-quiet">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="font-display text-[19px] font-bold tracking-[-0.03em] md:text-[21px]">
                                    {title}
                                </span>
                                <p className="m-0 text-[15px] leading-normal text-body md:text-[15.5px]">
                                    {line}
                                </p>
                            </Card>
                        </li>
                    ))}
                </ol>
            </section>

            <section
                className={`${WRAP} grid items-center gap-3.5 pb-4 pt-9 xl:grid-cols-2 xl:gap-14 xl:py-14`}
            >
                <div className="flex flex-col items-start gap-3.5 md:gap-4">
                    <h2 className={H2}>Reminders that come from you.</h2>
                    <p className={LEAD}>
                        Saroh tells you who&apos;s late and writes the message.
                        One tap opens your email or WhatsApp with it filled in.
                        Your client sees your name, not a robot&apos;s.
                    </p>
                    <TextLink href="/tools/payment-reminder">
                        Try the free reminder writer →
                    </TextLink>
                </div>
                <OverdueScreen />
            </section>

            <section
                className={`${WRAP} flex flex-col gap-3 pb-4 pt-9 md:gap-7 md:py-14`}
            >
                <div className="flex items-end justify-between gap-6">
                    <div className="flex flex-col gap-3">
                        <h2 className={H2}>Free tools. No sign-up.</h2>
                        <p className={LEAD}>
                            Use them as long as you like. No watermark on
                            anything you download.
                        </p>
                    </div>
                    <TextLink
                        href="/tools"
                        className="hidden shrink-0 md:inline-flex"
                    >
                        All tools →
                    </TextLink>
                </div>
                <div className="grid gap-3 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
                    {TOOLS.map(({ desk, ...tool }) => (
                        <LinkCard
                            key={tool.href}
                            {...tool}
                            className={desk ? "hidden md:flex" : ""}
                        />
                    ))}
                </div>
                <TextLink href="/tools" className="md:hidden">
                    All tools →
                </TextLink>
            </section>

            <section className={`${WRAP} pt-9 md:py-14`}>
                <Card className="items-start !gap-2.5 !p-[22px] md:!gap-3.5 md:!p-9">
                    <h2 className={`${H2} !text-[28px] md:!text-[40px]`}>
                        Free to start. A flat price when you grow.
                    </h2>
                    <p className="m-0 text-[15px] leading-normal text-body md:text-[17px]">
                        Prepaid, cancel any time in Settings.
                    </p>
                    <TextLink href="/pricing">See all plans →</TextLink>
                </Card>
            </section>

            <section
                className={`${WRAP} grid gap-1.5 pt-9 md:py-14 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14`}
            >
                <h2 className={H2}>Questions</h2>
                <FaqList items={FAQS} />
            </section>

            {LATEST.length > 0 ? (
                <section
                    className={`${WRAP} flex flex-col gap-3 pt-9 md:gap-5 md:pb-14 md:pt-0`}
                >
                    <div className="flex items-end justify-between gap-6">
                        <h2 className={H2}>What&apos;s new</h2>
                        <TextLink href="/changelog" className="shrink-0">
                            Changelog →
                        </TextLink>
                    </div>
                    <div className="grid gap-3 md:gap-5 xl:grid-cols-3">
                        {LATEST.map((e) => (
                            <Link
                                key={e.slug}
                                prefetch={false}
                                href={
                                    pageAt(changelogPath(e))
                                        ? changelogPath(e)
                                        : "/changelog"
                                }
                                className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-[18px] no-underline transition-colors duration-150 hover:border-strong md:p-6"
                            >
                                <span className="font-mono text-[13px] text-quiet">
                                    {e.date}
                                </span>
                                <b className="text-[17px]">{e.title}</b>
                                <span className="text-[15px] leading-normal text-body">
                                    {e.summary}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            <div className={`${WRAP} pt-9 md:pt-10`}>
                <CtaBand
                    title="Let's rise together."
                    line="Send your first quote in five minutes. Free plan, no card."
                    action="Start free"
                    href={signupHref(page.type)}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
