import { ButtonLink } from "@/components/shared/button";
import { ConfirmTag } from "@/components/shared/confirm-tag";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { TextLink } from "@/components/shared/text-link";
import type { PlanCard } from "@/lib/plans";
import { PLANS_NOTE, readPlans } from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/pricing");

export const metadata = pageMetadata(page);

const TBC = "[To be confirmed before launch]";

const FAQS = [
    {
        question: "Do you take a cut when my client pays me?",
        answer: "No. The money goes from your client to your own Stripe, PayPal or bank account. We never see it or hold it. Your payment provider's own fees still apply.",
    },
    { question: "What happens after the first month?", answer: TBC },
    { question: "Can I change plans?", answer: TBC },
    {
        question: "What happens to my data if I cancel?",
        answer: "You keep access until the end of what you paid for. You can export all your data any time.",
    },
    { question: "Do you give refunds?", answer: TBC },
];

const EVERY_PLAN = [
    "A client page for every client",
    "Quote approvals with history",
    "One-tap reminders from your email or WhatsApp",
    "0% fees on payments",
    "Export all your data any time",
];

const LINKS = [
    ["Billing and cancelling", "/legal/billing"],
    ["Help", "/help"],
    ["Compare Saroh", "/compare"],
    ["Refer a friend", "/referral"],
] as const;

const PROMISE_TITLE =
    "font-display text-[22px] font-bold tracking-[-0.03em] md:text-[26px]";
const PROMISE_LINE =
    "m-0 text-[15px] leading-normal text-body md:text-[15.5px]";

function Plan({ plan }: { plan: PlanCard }) {
    return (
        <div
            className={`flex flex-col gap-3 rounded-card bg-surface p-5 md:gap-3.5 md:px-5 md:py-6 ${
                plan.featured
                    ? "order-first border-2 border-ink md:order-none"
                    : "border border-line"
            }`}
        >
            <div className="flex min-h-[26px] items-center justify-between gap-2">
                <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.03em]">
                    {plan.name}
                </h3>
                {plan.offer ? (
                    <span className="rounded-full bg-ink px-[9px] py-1 text-xs font-semibold text-paper">
                        {plan.offer}
                    </span>
                ) : null}
            </div>
            <span className="text-[15px] leading-normal text-body md:min-h-[46px] md:text-[15.5px]">
                {plan.tagline}
            </span>
            <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[40px] font-bold tracking-[-0.04em] md:text-[44px]">
                    {plan.price}
                </span>
                <span className="text-[13px] text-quiet">
                    {plan.free ? "forever" : "a month"}
                </span>
            </div>
            <span className="text-[13px] text-quiet">
                {plan.free ? "No card needed" : "Billed monthly, prepaid"}
            </span>
            <ButtonLink
                href={signupHref(page.type, plan.free ? {} : { plan: plan.id })}
                look={plan.featured ? "primary" : "secondary"}
                data-cta={`plan-${plan.id}`}
                className={
                    plan.featured ? "" : "!h-[52px] bg-surface !text-base"
                }
            >
                {plan.free ? "Start free" : `Choose ${plan.name}`}
            </ButtonLink>
            <div className="flex flex-col gap-2 border-t border-black/10 pt-3.5 text-[14.5px] leading-[1.45] md:gap-[9px]">
                {plan.lead ? (
                    <b className="font-semibold">{plan.lead}</b>
                ) : null}
                {plan.lines.map((line) => (
                    <span key={line} className="flex gap-2">
                        <span aria-hidden="true">✓</span>
                        <span>{line}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

export default async function PricingPage() {
    const plans = await readPlans();
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-[1440px] flex-col px-4 md:px-20"
        >
            <JsonLd
                data={[
                    ...pageSchema(page),
                    faqSchema(FAQS.filter((f) => f.answer !== TBC)),
                ]}
            />

            <section className="flex flex-col gap-3.5 pb-5 pt-7 md:items-center md:gap-[18px] md:pb-10 md:pt-14 md:text-center">
                <h1 className="m-0 font-display text-[46px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[80px]">
                    {page.h1}
                </h1>
                <p className="m-0 max-w-[760px] text-[16.5px] leading-normal text-body md:text-xl">
                    Your clients pay you directly, through your own Stripe,
                    PayPal or bank. We take 0% of it. You pay a flat price for
                    Saroh, and that&apos;s all.
                </p>
                <div className="flex flex-col items-start gap-1.5 text-[15px] font-medium md:mt-1.5 md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-3">
                    <span className="md:rounded-full md:border md:border-black/20 md:bg-surface md:px-4 md:py-2.5">
                        <span aria-hidden="true" className="md:hidden">
                            ✓{" "}
                        </span>
                        Prepaid, cancel any time in Settings
                    </span>
                    <ConfirmTag>
                        Price promise · confirm before launch
                    </ConfirmTag>
                </div>
            </section>

            <section
                aria-labelledby="plans"
                className="flex flex-col gap-3 md:gap-3.5"
            >
                <h2 id="plans" className="sr-only">
                    Plans
                </h2>
                {PLANS_NOTE ? (
                    <div className="flex flex-col items-start gap-1.5 md:flex-row md:items-center md:justify-end md:gap-2.5">
                        <ConfirmTag>Placeholder</ConfirmTag>
                        <p className="m-0 text-sm font-medium text-saffron-text">
                            {PLANS_NOTE}
                        </p>
                    </div>
                ) : null}
                {plans ? (
                    <div
                        style={
                            {
                                "--plans": Math.min(plans.length, 5),
                            } as React.CSSProperties
                        }
                        className="grid items-stretch gap-3 md:grid-cols-2 md:gap-4 xl:[grid-template-columns:repeat(var(--plans),minmax(0,1fr))]"
                    >
                        {plans.map((plan) => (
                            <Plan key={plan.id} plan={plan} />
                        ))}
                    </div>
                ) : null}
                <div className="flex flex-col gap-2 rounded-card bg-[#EAE6DE] p-5 text-[14.5px] leading-[1.45] md:flex-row md:flex-wrap md:items-center md:gap-7 md:border md:border-line md:bg-surface md:px-[26px] md:py-[22px]">
                    <b className="text-base">Every plan, Free included:</b>
                    {EVERY_PLAN.map((line) => (
                        <span key={line}>✓ {line}</span>
                    ))}
                </div>
            </section>

            <section className="grid gap-[22px] pt-10 md:grid-cols-3 md:gap-6 md:pb-10 md:pt-24">
                <div className="flex flex-col items-start gap-1.5 md:gap-2.5">
                    <ConfirmTag>Draft · confirm before launch</ConfirmTag>
                    <span className={PROMISE_TITLE}>The price promise</span>
                    <p className={PROMISE_LINE}>
                        What we promise about your price goes here once it is
                        confirmed.
                    </p>
                </div>
                <div className="flex flex-col gap-1.5 md:gap-2.5">
                    <span className={PROMISE_TITLE}>
                        Prepaid. Cancel in Settings.
                    </span>
                    <p className={PROMISE_LINE}>
                        You pay at the start of each month. Cancel in Settings
                        in two taps. You keep access until the end of what you
                        paid for. No calls, no forms.
                    </p>
                </div>
                <div className="flex flex-col gap-1.5 md:gap-2.5">
                    <span className={PROMISE_TITLE}>
                        We remind you before we renew
                    </span>
                    <p className={PROMISE_LINE}>
                        An email before a renewal. No surprise charges.
                    </p>
                </div>
            </section>

            <section className="grid gap-1.5 pt-10 md:py-14 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <div className="flex flex-col items-start gap-3">
                    <h2 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.045em] md:text-[44px] md:leading-[1.02]">
                        Questions about paying
                    </h2>
                    <ConfirmTag>
                        Some answers · confirm before launch
                    </ConfirmTag>
                </div>
                <div>
                    <FaqList items={FAQS} />
                    <nav
                        aria-label="More about paying"
                        className="flex flex-wrap gap-x-5 pt-3"
                    >
                        {LINKS.map(([name, href]) => (
                            <TextLink
                                key={href}
                                href={href}
                                className="!text-[15px]"
                            >
                                {name}
                            </TextLink>
                        ))}
                    </nav>
                </div>
            </section>

            <div className="pt-9 md:pt-6">
                <CtaBand
                    title="Start free."
                    line="Free plan, no card. Cancel any time."
                    action="Start free"
                    href={signupHref(page.type)}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
