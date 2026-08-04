import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

/**
 * The marketing site's footer, and the first one it has had.
 *
 * The page was five sections and nothing else — no nav, no footer — so there was
 * nowhere for a link to live. That is the marketing half of the audit finding
 * that scored Help and Documentation 1/10: `docs.saroh.in` and `help.saroh.in`
 * are both built and deployed, and neither was linked from anywhere a person
 * might look.
 *
 * Two audiences, named as themselves rather than as "Resources": someone
 * deciding whether Saroh can run their shop, and someone deciding whether they
 * can run Saroh. Lumping them into one column is how a shop owner ends up
 * reading about Prisma migrations.
 *
 * Sits on `brand-surface` to close the page on the same deep field the hero
 * opens it with — see `hero.tsx` for why that token and not `brand`.
 */
const PRODUCT_LINKS = [
    { href: "#modules", label: "What it does" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#waitlist", label: "Join the waitlist" },
];

const HELP_LINKS = [
    { href: "https://help.saroh.in", label: "Help centre" },
    { href: "https://help.saroh.in/getting-started", label: "Getting started" },
    { href: "https://app.saroh.in", label: "Sign in" },
];

const DEV_LINKS = [
    { href: "https://docs.saroh.in", label: "Developer docs" },
    {
        href: "https://docs.saroh.in/getting-started",
        label: "Run it yourself",
    },
    { href: "https://docs.saroh.in/architecture", label: "Architecture" },
];

function Column({
    heading,
    links,
}: {
    heading: string;
    links: { href: string; label: string }[];
}) {
    return (
        <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
                {heading}
            </h2>
            <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                    <li key={link.href}>
                        <Link
                            href={link.href}
                            className="rounded text-sm text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
                        >
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function SiteFooter() {
    return (
        <footer className="bg-brand-surface">
            <div className="mx-auto max-w-6xl px-6 py-16">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-1">
                        <Link
                            href="/"
                            aria-label="Saroh"
                            className="inline-block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
                        >
                            <Wordmark className="text-white" />
                        </Link>
                        <p className="mt-4 max-w-[28ch] text-sm text-white/60">
                            Run your whole business from one place. Switch on
                            only what you need.
                        </p>
                    </div>

                    <Column heading="Product" links={PRODUCT_LINKS} />
                    <Column heading="Using Saroh" links={HELP_LINKS} />
                    <Column heading="Developers" links={DEV_LINKS} />
                </div>

                <div className="mt-14 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
                    <p>© {new Date().getFullYear()} Saroh</p>
                    {/* No licence is claimed: the repository has no LICENSE
                        file and no `license` field, so stating one here would
                        grant terms nobody has agreed. */}
                    <p>Built in India.</p>
                </div>
            </div>
        </footer>
    );
}
