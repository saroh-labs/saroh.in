import { PageTitle } from "@saroh/marketing/page-title";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/shared/breadcrumb";
import { Card } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
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

const H2 = "m-0 font-display text-mk-h2-sm font-bold [text-wrap:balance]";
const CARD_TITLE = "font-display text-mk-card-lg font-bold [text-wrap:balance]";
const LIST =
    "m-0 flex list-disc flex-col gap-2 pl-[22px] text-[17px] leading-[1.55]";

/** Only Saroh's side, from the claims ledger. Nothing here is about the other tool. */
const DOES = [
    "Set up your business in your country, in one of nine currencies",
    "Write numbered invoices with your own tax line and number, and record what's paid",
    "Share an invoice by link, or open WhatsApp with the words typed. You press send",
    "One page per customer, with their history and spend",
    "Publish your site on a saroh.app address, with your live services, hours and booking page",
    "Import products and customers by CSV, and export your data",
];

const DOESNT = [
    "No quotes or estimates to send, and no client acceptance",
    "No online payment yet. You take the money and record it",
    "It doesn't work out tax for you",
    "Paid plans aren't on sale yet, so only the free plan can be used",
];

const faqs = () => [
    {
        question: "Can I import my customers?",
        answer: "Yes, by CSV. If your current app can export your customers as a CSV, you can import that file into Saroh.",
    },
    {
        question: "Can I try it before paying?",
        answer: "Yes. The free plan needs no card, and it's the only plan on sale today.",
    },
    {
        question: "How do my customers pay me?",
        answer: "You take the money yourself, then record it in Saroh. Paying online isn't available yet.",
    },
];

export default async function Page({ params }: Props) {
    const { slug } = await params;
    const found = ALTERNATIVES.find(([s]) => `${s}-alternative` === slug);
    if (!found) notFound();
    const [competitor, name] = found;
    const page = pageOf(`/compare/${slug}`);
    const questions = faqs();
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-10 px-mk-gutter pt-4 md:gap-16 md:pt-10"
        >
            <JsonLd data={[faqSchema(questions), ...pageSchema(page)]} />
            <section className="flex max-w-[920px] flex-col gap-[18px]">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <PageTitle size="article">{page.h1}</PageTitle>
                <p className="m-0 text-[17px] leading-[1.6] text-mk-copy md:text-[19px]">
                    What Saroh does today and what it doesn&apos;t, so you can
                    set it beside {name} yourself.
                </p>
                <p className="m-0 text-sm text-muted-foreground">
                    We state nothing about {name} here: we haven&apos;t checked
                    its public pages yet. {name} is a trademark of its owner.
                    Saroh is not connected to them.
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 md:gap-6">
                <Card className="!border-2 !border-foreground !p-5 md:!p-7">
                    <h2 className={`${CARD_TITLE} m-0`}>
                        What Saroh does today
                    </h2>
                    <ul className={LIST}>
                        {DOES.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </Card>
                <Card className="!p-5 md:!p-7">
                    <h2 className={`${CARD_TITLE} m-0`}>
                        What it doesn&apos;t do
                    </h2>
                    <ul className={LIST}>
                        {DOESNT.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </Card>
            </section>

            <section className="flex flex-col gap-3.5">
                <h2 className={H2}>Moving your customers</h2>
                <ol className={`${LIST} !list-decimal`}>
                    <li>
                        Export your customers as a CSV from your current app, if
                        it offers that.
                    </li>
                    <li>Import them into Saroh.</li>
                    <li>
                        Write your next invoice in Saroh. Keep old PDFs where
                        they are.
                    </li>
                </ol>
            </section>

            <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <h2 className={H2}>Questions</h2>
                <FaqList items={questions} />
            </section>

            <CtaBand
                title="Try it with your next invoice."
                line="Free plan, no card. Import your customers by CSV."
                action="Start free"
                href={signupHref("compare", { c: competitor })}
                from="start-free-band"
            />
        </div>
    );
}
