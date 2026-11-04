import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { Card } from "@/components/shared/card";
import { ConfirmTag } from "@/components/shared/confirm-tag";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { placeholders } from "@/content/placeholders";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ALTERNATIVES, pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

export const dynamicParams = false;

export const generateStaticParams = () =>
    ALTERNATIVES.map(([slug]) => ({ slug: `${slug}-alternative` }));

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return pageMetadata(pageOf(`/compare/${(await params).slug}`));
}

const H2 =
    "m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.045em] md:text-[40px]";
const CARD_TITLE =
    "font-display text-[22px] font-bold tracking-[-0.03em] md:text-[26px]";
const LIST =
    "m-0 flex list-disc flex-col gap-2 pl-[22px] text-[17px] leading-[1.55]";
const COPY = "m-0 text-[17px] leading-[1.6] text-body";
const CONFIRM = <ConfirmTag />;

/**
 * Saroh's column says only what's agreed. A competitor's cell stays [confirm]
 * until the owner supplies the fact, a link and the date checked.
 */
const ROWS: readonly { name: string; saroh: ReactNode }[] = [
    {
        name: "Monthly price",
        saroh: (
            <>
                Free plan, no card. Paid plans are on{" "}
                <Link prefetch={false} href="/pricing">
                    our pricing page
                </Link>
            </>
        ),
    },
    { name: "Free plan", saroh: "Yes, with client pages" },
    {
        name: "Fees on client payments",
        saroh: "0%. Clients pay your own Stripe, PayPal or bank. We never touch your money",
    },
    { name: "Client page", saroh: "On every plan, including Free" },
    { name: "Quote approval with history", saroh: "Yes" },
    {
        name: "Reminders sent from",
        saroh: "You, from your own email or WhatsApp",
    },
    { name: "Phone app", saroh: CONFIRM },
    { name: "Leave with your data", saroh: CONFIRM },
];

const SAROH_SUITS = [
    "You want quotes your client can accept online, with the history saved",
    "You want one page per client with every quote, invoice and payment",
    "You don't want any fee taken from your payments",
];

const OTHER_SUITS = [
    "You mostly want to make an invoice fast on your phone",
    "You want a native app from the app stores",
    "You want a tool that has been around for many years",
    "You like having payments handled inside the app",
];

const faqs = (name: string) => [
    {
        question: `Is Saroh cheaper than ${name}?`,
        answer: `Not always. ${placeholders.competitorFacts} Saroh has a free plan and takes no fee from your payments. Work out which matters more for you.`,
    },
    {
        question: "Can I import my clients?",
        answer: "Yes. Export your clients as a CSV from your current app, if it offers that, then import them into Saroh.",
    },
    {
        question: "Is there a phone app?",
        answer: placeholders.sarohCompareRows,
    },
    {
        question: "Can I try it before paying?",
        answer: "Yes. The free plan needs no card, and client pages are on it too.",
    },
];

export default async function Page({ params }: Props) {
    const { slug } = await params;
    const found = ALTERNATIVES.find(([s]) => `${s}-alternative` === slug);
    if (!found) notFound();
    const [competitor, name] = found;
    const page = pageOf(`/compare/${slug}`);
    const questions = faqs(name);
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-10 px-mk-gutter pt-4 md:gap-16 md:pt-10"
        >
            <JsonLd data={[faqSchema(questions), ...pageSchema(page)]} />
            <section className="flex max-w-[920px] flex-col gap-[18px]">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <h1 className="m-0 font-display text-[38px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[72px]">
                    {page.h1}
                </h1>
                <p className="m-0 text-[17px] leading-[1.6] text-body md:text-[19px]">
                    An honest side-by-side: what each one costs, how you get
                    paid, and where {name} is still the better pick.
                </p>
                <p className="m-0 text-sm text-quiet">
                    Facts about {name} will come from their public pages, with
                    links and the date checked. Each {CONFIRM} is a fact we
                    haven&apos;t checked yet, so we don&apos;t state it. Tell us
                    if something has changed and we&apos;ll fix it.
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 md:gap-6">
                <Card className="!border-2 !border-ink !p-5 md:!p-7">
                    <h2 className={`${CARD_TITLE} m-0`}>
                        Saroh may suit you if
                    </h2>
                    <ul className={LIST}>
                        {SAROH_SUITS.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </Card>
                <Card className="!p-5 md:!p-7">
                    <h2 className={`${CARD_TITLE} m-0`}>
                        {name} may suit you if
                    </h2>
                    <ul className={LIST}>
                        {OTHER_SUITS.map((line) => (
                            <li key={line}>
                                {line} {CONFIRM}
                            </li>
                        ))}
                    </ul>
                </Card>
            </section>

            <section className="flex flex-col gap-[18px]">
                <h2 className={H2}>Side by side</h2>
                <div className="overflow-hidden rounded-card border border-line bg-surface">
                    <table className="w-full table-fixed border-collapse text-[14.5px] leading-[1.45] md:text-base">
                        <thead>
                            <tr className="border-b border-strong">
                                <th
                                    scope="col"
                                    className="w-[30%] md:w-[260px]"
                                >
                                    <span className="sr-only">What</span>
                                </th>
                                {["Saroh", name].map((h) => (
                                    <th
                                        key={h}
                                        scope="col"
                                        className="p-3 text-left text-[13px] font-semibold uppercase tracking-[0.06em] text-quiet md:px-5 md:py-4"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ROWS.map((row) => (
                                <tr
                                    key={row.name}
                                    className="border-b border-line last:border-b-0"
                                >
                                    <th
                                        scope="row"
                                        className="p-3 text-left align-top font-semibold md:px-5 md:py-4"
                                    >
                                        {row.name}
                                    </th>
                                    <td className="break-words p-3 align-top md:px-5 md:py-4">
                                        {row.saroh}
                                    </td>
                                    <td className="p-3 align-top md:px-5 md:py-4">
                                        {CONFIRM}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <span className="text-sm text-quiet">
                    {name} is a trademark of its owner. Saroh is not connected
                    to them. Sources:{" "}
                    <ConfirmTag>{placeholders.competitorFacts}</ConfirmTag>
                </span>
            </section>

            <section className="grid gap-10 md:grid-cols-2 md:gap-14">
                <div className="flex flex-col gap-3.5">
                    <h2 className={H2}>Why people look around</h2>
                    <p className={COPY}>
                        <ConfirmTag>
                            {placeholders.compareMarketClaims}
                        </ConfirmTag>{" "}
                        Saroh takes 0% of your payments and never touches your
                        money.
                    </p>
                    <Link
                        prefetch={false}
                        href="/pricing"
                        className="inline-flex min-h-11 items-center self-start text-base font-semibold md:min-h-0"
                    >
                        How our pricing works →
                    </Link>
                </div>
                <div className="flex flex-col gap-3.5">
                    <h2 className={H2}>Switching takes three steps</h2>
                    <ol className={`${LIST} !list-decimal`}>
                        <li>
                            Export your clients as a CSV from your current app,
                            if it offers that.
                        </li>
                        <li>
                            Import them into Saroh and add your payment link.
                        </li>
                        <li>
                            Send your next invoice from Saroh. Keep old PDFs
                            where they are.
                        </li>
                    </ol>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <h2 className={H2}>Questions</h2>
                <FaqList items={questions} />
            </section>

            <CtaBand
                title="Try it with your next invoice."
                line="Free plan, no card. Import your clients by CSV."
                action="Start free"
                href={signupHref("compare", { c: competitor })}
                from="start-free-band"
            />
        </div>
    );
}
