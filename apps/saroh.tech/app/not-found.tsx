import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: { absolute: "Page not found | Saroh" },
    robots: { index: false, follow: true },
};

const TOP_TOOLS = [
    ["Invoice generator", "/tools/invoice-generator"],
    ["Quote maker", "/tools/quote-maker"],
    ["Receipt maker", "/tools/receipt-maker"],
];

export default function NotFound() {
    return (
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-16 md:px-20">
            <h1 className="font-display text-4xl font-bold tracking-[-0.045em] md:text-[56px] md:leading-none">
                We can't find that page
            </h1>
            <p className="text-lg text-body">Try one of the free tools.</p>
            <ul className="flex flex-col gap-2 text-base font-semibold">
                {TOP_TOOLS.map(([name, href]) => (
                    <li key={href}>
                        <Link
                            prefetch={false}
                            href={href}
                            className="inline-flex min-h-11 items-center"
                        >
                            {name}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
