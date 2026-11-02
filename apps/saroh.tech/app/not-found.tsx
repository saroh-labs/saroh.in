import type { Metadata } from "next";

import { ButtonLink } from "@/components/shared/button";
import { RelatedGrid } from "@/components/shared/related-grid";
import { TextLink } from "@/components/shared/text-link";

export const metadata: Metadata = {
    title: { absolute: "Page not found | Saroh" },
    robots: { index: false, follow: true },
};

const TOP_TOOLS = [
    {
        title: "Invoice generator",
        line: "A clean PDF, no sign-up.",
        href: "/tools/invoice-generator",
    },
    {
        title: "Quote maker",
        line: "A clear price before you start.",
        href: "/tools/quote-maker",
    },
    {
        title: "Receipt maker",
        line: "Show a client they've paid.",
        href: "/tools/receipt-maker",
    },
];

export default function NotFound() {
    return (
        <div
            data-page-type="not-found"
            className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-10 md:gap-14 md:px-20 md:pt-16"
        >
            <div className="flex flex-col gap-4">
                <h1 className="m-0 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[56px] md:leading-none">
                    We can't find that page
                </h1>
                <p className="m-0 max-w-[66ch] text-lg leading-normal text-body md:text-[19px]">
                    The link may be old, or the address may have a typo.
                </p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                    <ButtonLink href="/tools" data-cta="not-found-tools">
                        See all free tools
                    </ButtonLink>
                    <TextLink href="/">Go to the home page</TextLink>
                    <TextLink href="/help">Get help</TextLink>
                </div>
            </div>
            <RelatedGrid title="Most used tools" items={TOP_TOOLS} />
        </div>
    );
}
