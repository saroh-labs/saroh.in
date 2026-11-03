import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { site } from "@/site.config";

const COLUMNS = [
    {
        title: "Product",
        links: [
            ["Pricing", "/pricing"],
            ["Changelog", "/changelog"],
            ["Referral", "/referral"],
            ["Help", "/help"],
        ],
    },
    {
        title: "Free tools",
        links: [
            ["Invoice generator", "/tools/invoice-generator"],
            ["Quote maker", "/tools/quote-maker"],
            ["Receipt maker", "/tools/receipt-maker"],
            ["All tools", "/tools"],
        ],
    },
    {
        title: "Learn",
        links: [
            ["Templates", "/templates"],
            ["Guides", "/guides"],
            ["Compare", "/compare"],
            ["About", "/about"],
        ],
    },
    {
        title: "Legal",
        links: [
            ["Terms", "/legal/terms"],
            ["Privacy", "/legal/privacy"],
            ["Cookies", "/legal/cookies"],
            ["Billing", "/legal/billing"],
        ],
    },
] as const;

export function Footer() {
    return (
        <footer className="mt-16 border-t border-line">
            <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-12 md:px-20">
                <div className="grid grid-cols-2 gap-8 text-[15px] md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
                    <div className="col-span-2 flex flex-col gap-2 md:col-span-1">
                        <Wordmark aria-hidden style={{ fontSize: 20 }} />
                        <p className="m-0 text-body">
                            सारोह · Let's rise together
                        </p>
                    </div>
                    {COLUMNS.map((column) => (
                        <div key={column.title} className="flex flex-col">
                            <h2 className="m-0 text-[15px] font-bold leading-[1.9]">
                                {column.title}
                            </h2>
                            {column.links.map(([name, href]) => (
                                <Link
                                    prefetch={false}
                                    key={href}
                                    href={href}
                                    className="inline-flex min-h-11 items-center no-underline hover:underline hover:underline-offset-4 md:min-h-7"
                                >
                                    {name}
                                </Link>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-2 border-t border-line pt-5 text-sm text-body md:flex-row md:justify-between">
                    <span>
                        Region: Global ·{" "}
                        <a
                            data-region-link
                            href={site.india}
                            className="inline-flex min-h-11 items-center underline underline-offset-2 md:min-h-0"
                        >
                            In India? Go to saroh.in
                        </a>
                    </span>
                    <span>
                        A product of {site.company} · {site.social}
                    </span>
                </div>
            </div>
        </footer>
    );
}
