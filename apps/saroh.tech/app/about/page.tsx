import { Breadcrumb } from "@/components/shared/breadcrumb";
import { Card } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { JsonLd } from "@/components/shared/json-ld";
import { Marked } from "@/components/shared/marked";
import { H2 } from "@/components/tools/tool-page";
import { placeholders } from "@/content/placeholders";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref, site } from "@/site.config";

const page = pageOf("/about");

export const metadata = pageMetadata(page);

const COPY = "m-0 text-[17px] leading-relaxed text-body";
const CARD_TITLE = "m-0 font-display text-[21px] font-bold tracking-[-0.03em]";

const NEVER = [
    {
        title: "Hold your money",
        line: "Your clients pay you directly, through your own Stripe, PayPal or bank. We never see it or hold it.",
    },
    {
        title: "Take a cut of your payments",
        line: "0% fees on what your clients pay you. Your payment provider's own fees still apply.",
    },
    {
        title: placeholders.pricePromise,
        line: "Our promise about your price goes here once it's confirmed.",
    },
];

const COMPANY = [
    ["Product", site.name],
    ["Company", site.company],
    ["Registered details", placeholders.companyDetails],
    ["Email", placeholders.supportEmail],
];

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-10 px-mk-gutter pt-6 md:gap-16 md:pt-7"
        >
            <JsonLd data={pageSchema(page)} />
            <div className="flex flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <h1 className="m-0 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[56px] md:leading-none">
                    {page.h1}
                </h1>
                <p className="m-0 max-w-[66ch] text-lg leading-normal text-body md:text-[19px]">
                    Saroh (सारोह) means rising together. We're a small team
                    building simple tools for freelancers and small businesses,
                    with no fees on your money.
                </p>
            </div>

            <section className="grid gap-3 lg:grid-cols-2 lg:gap-14">
                <h2 className={H2}>Why the name</h2>
                <div className="flex flex-col gap-3">
                    <p className={COPY}>
                        When your clients say yes and pay on time, your business
                        grows. When your business grows, you stay with us.
                        That's the deal. We don't need a piece of your money for
                        it to work.
                    </p>
                    <p className={COPY}>
                        So you pay a flat price for Saroh, and that's all.
                    </p>
                </div>
            </section>

            <section className="flex flex-col gap-4 md:gap-[22px]">
                <h2 className={H2}>What we will never do</h2>
                <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3 md:gap-6">
                    {NEVER.map((n) => (
                        <li key={n.title}>
                            <Card className="h-full">
                                <h3 className={CARD_TITLE}>
                                    <Marked text={n.title} />
                                </h3>
                                <p className="m-0 text-[15.5px] leading-normal text-body">
                                    {n.line}
                                </p>
                            </Card>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-4 md:gap-[22px]">
                <h2 className={H2}>Who we are</h2>
                <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 md:gap-6">
                    {["First founder", "Second founder"].map((who) => (
                        <li key={who}>
                            <Card className="h-full">
                                <div className="flex items-center gap-5">
                                    <div className="flex size-20 shrink-0 items-center justify-center rounded-full border border-dashed border-strong text-[13px] text-quiet">
                                        Photo
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <h3 className={CARD_TITLE}>{who}</h3>
                                        <p className="m-0 text-[15.5px] leading-normal text-body">
                                            <Marked
                                                text={placeholders.founders}
                                            />
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-4 md:gap-[22px]">
                <h2 className={H2}>Company details</h2>
                <dl className="m-0 max-w-[720px] border-b border-line">
                    {COMPANY.map(([name, value]) => (
                        <div
                            key={name}
                            className="flex flex-col gap-0.5 border-t border-line py-3 md:flex-row md:gap-6"
                        >
                            <dt className="text-[15px] text-quiet md:w-48 md:shrink-0">
                                {name}
                            </dt>
                            <dd className="m-0 text-[17px]">
                                <Marked text={value} />
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>

            <CtaBand
                title="Start with your first quote."
                line="Free plan, no card."
                action="Start free"
                href={signupHref("about")}
                from="start-free-band"
            />
        </div>
    );
}
