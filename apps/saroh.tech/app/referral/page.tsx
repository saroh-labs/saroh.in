import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { markTitle } from "@saroh/marketing/page-hero";
import { SectionHeading } from "@saroh/marketing/section-heading";

import { ButtonLink } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/referral");

export const metadata = pageMetadata(page);

const STEPS = [
    {
        title: "Find your link",
        line: "Open your site. The Made with Saroh link at the foot of it is yours, for as long as you're on Free. The app has no referral screen yet.",
    },
    {
        title: "Send it to a friend",
        line: "Copy it and send it by WhatsApp, by email or anywhere you like.",
    },
    {
        title: "We note who sent them",
        line: "If they set up a business within 90 days, in the same browser, we record that yours referred it. Nothing else happens.",
    },
];

/** What the code does today (DEC-156, `organizations/referral.ts`). */
const RULES = [
    {
        question: "What do you and your friend each get?",
        // True whether or not paid plans are on sale: the code gives no reward either way (DEC-156).
        answer: "Nothing today: there's no reward and no discount. This page will say if that changes.",
    },
    {
        question: "Can I see who I've referred?",
        answer: "Not yet. Only the Saroh team can see it. Your friend isn't told either.",
    },
    {
        question: "How long does a link last?",
        answer: "The browser keeps the code for 90 days. If your friend opens another business's link later, that one replaces yours.",
    },
    {
        question: "Can I refer myself?",
        answer: "No. Someone who's already in your business isn't recorded as referred by it, and only your business is recorded, not whoever referred you.",
    },
    {
        question: "What does the link keep about my friend?",
        answer: "Nothing. It keeps your code in one cookie, and that's never shared. Our cookies page has the details.",
    },
];

const H2 = "m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]";

export default function ReferralPage() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-12 px-mk-gutter pt-8 min-[760px]:gap-[120px] min-[760px]:pt-10"
        >
            <JsonLd data={[...pageSchema(page), faqSchema(RULES)]} />
            <section className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_520px] xl:gap-16">
                <div className="flex flex-col items-start gap-6">
                    <SectionHeading
                        as="h1"
                        size="kit-h1"
                        title={markTitle(page.h1)}
                        lead="Know someone who runs a small business? Send them the link from your site. If they set up on Saroh, we note that you sent them."
                    />
                    <ButtonLink
                        href={signupHref("referral")}
                        data-cta="referral-start-free"
                    >
                        Start free
                    </ButtonLink>
                </div>
                <Card className="!gap-3 !border-foreground !p-5 md:!p-7">
                    <span className="font-display text-mk-kit-h3 font-bold [text-wrap:balance]">
                        There's no reward today
                    </span>
                    <p className="m-0 text-base leading-[1.6] text-mk-copy">
                        A referral records who sent whom, and that's all it
                        does. Nobody pays or earns anything for it.
                    </p>
                </Card>
            </section>

            <section className="flex flex-col gap-6 min-[760px]:gap-10">
                <h2 className={H2}>How it works</h2>
                <SwipeRow label="How it works">
                    {STEPS.map((s, i) => (
                        <Card key={s.title} className="h-full !p-5 md:!p-7">
                            <span className="font-mono text-sm text-muted-foreground">
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="font-display text-mk-kit-h3 font-bold [text-wrap:balance]">
                                {s.title}
                            </span>
                            <p className="m-0 text-base leading-[1.6] text-mk-copy">
                                {s.line}
                            </p>
                        </Card>
                    ))}
                </SwipeRow>
            </section>

            <section className="grid gap-3 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <h2 className={H2}>The rules</h2>
                <FaqList items={RULES} />
            </section>

            <CtaBand
                title="Let's rise together."
                line="Share Saroh with someone who runs a small business."
                action="Start free"
                href={signupHref("referral")}
                from="referral-start-free-band"
            />
        </div>
    );
}
