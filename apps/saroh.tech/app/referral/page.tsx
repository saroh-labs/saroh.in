import { ButtonLink, buttonClass } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { ConfirmTag } from "@/components/shared/confirm-tag";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { site } from "@/site.config";

const page = pageOf("/referral");

export const metadata = pageMetadata(page);

const APP_LINK = `${site.appUrl}/settings/referral`;
const TBC = "[To be confirmed before launch]";

const STEPS = [
    {
        title: "Share your link",
        line: "From Settings, by WhatsApp, email or anywhere you like.",
    },
    { title: "They start a paid plan", line: TBC },
    { title: "You get your reward", line: TBC },
];

// No FAQPage schema until these answers are real.
const RULES = [
    "What do you and your friend each get?",
    "Is there a limit?",
    "Does it work on the free plan?",
    "What if they cancel in the first month?",
    "Can I refer myself or a second business?",
].map((question) => ({ question, answer: TBC }));

const H2 =
    "m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.045em] md:text-[40px]";
const HINT = "text-sm text-quiet";
const OUTLINE = buttonClass("secondary", "bg-surface");

export default function ReferralPage() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-4 md:gap-[72px] md:px-20 md:pt-7"
        >
            <JsonLd data={pageSchema(page)} />
            <section className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_520px] xl:gap-16">
                <div className="flex flex-col items-start gap-5">
                    <h1 className="m-0 font-display text-[46px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[84px] md:leading-[0.96]">
                        {page.h1}
                    </h1>
                    <p className="m-0 text-[17px] leading-[1.6] text-body md:text-xl">
                        Know another freelancer or small business who&apos;s
                        tired of fees on their own money? Share your link.
                    </p>
                    <ConfirmTag>The offer · confirm before launch</ConfirmTag>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                        <ButtonLink
                            href={APP_LINK}
                            data-cta="get-referral-link"
                        >
                            Get your link
                        </ButtonLink>
                        <span className={HINT}>Sign in to see your link</span>
                    </div>
                </div>
                <Card
                    role="img"
                    aria-label="Your referral link card as it looks in Settings"
                    className="!gap-4 !border-ink !p-5 md:!p-7"
                >
                    <span className="text-xs font-semibold uppercase tracking-[.08em] text-quiet">
                        In Settings › Referral
                    </span>
                    <span className="font-display text-[22px] font-bold tracking-[-0.03em]">
                        Your link
                    </span>
                    <div className="flex gap-2">
                        <span className="flex h-11 min-w-0 flex-1 items-center rounded-control border border-control px-3.5 font-mono text-sm">
                            saroh.tech/r/lumen
                        </span>
                        <span className={OUTLINE}>Copy</span>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <span className={`${OUTLINE} flex-1`}>
                            Share on WhatsApp
                        </span>
                        <span className={`${OUTLINE} flex-1`}>
                            Share by email
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 border-t border-black/10 pt-4">
                        {["Signed up", "Now paying", "Rewards"].map((label) => (
                            <div key={label}>
                                <span className={HINT}>{label}</span>
                                <br />
                                <span className="font-mono text-[22px]">0</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </section>

            <section className="flex flex-col gap-4 md:gap-6">
                <h2 className={H2}>How it works</h2>
                <ol className="m-0 grid list-none gap-3 p-0 md:gap-5 xl:grid-cols-3">
                    {STEPS.map((s, i) => (
                        <li key={s.title}>
                            <Card className="h-full !p-5 md:!p-7">
                                <span className={`font-mono ${HINT}`}>
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="font-display text-[22px] font-bold tracking-[-0.03em]">
                                    {s.title}
                                </span>
                                <p className="m-0 text-base leading-[1.6] text-body">
                                    {s.line}
                                </p>
                            </Card>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="grid gap-3 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <div className="flex flex-col items-start gap-3">
                    <h2 className={H2}>The rules</h2>
                    <ConfirmTag>Draft · confirm before launch</ConfirmTag>
                </div>
                <FaqList items={RULES} />
            </section>

            <CtaBand
                title="Let's rise together."
                line="The more of us who stop paying fees on our own money, the better."
                action="Get your link"
                href={APP_LINK}
                from="get-referral-link-band"
            />
        </div>
    );
}
