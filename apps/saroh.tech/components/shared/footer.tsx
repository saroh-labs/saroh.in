import { ring } from "@saroh/marketing/ring";
import { textLinkClasses } from "@saroh/marketing/text-link";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";
import { signInHref, site } from "@/site.config";

const LINK = textLinkClasses({ tone: "quiet", className: "w-fit" });

/**
 * saroh.in's footer in layout and type, with this site's columns. No address,
 * registration number or email until a page can vouch for one for Global.
 */
export function Footer() {
    return (
        <footer className="px-mk-gutter pb-10 pt-[88px] text-[14px] text-muted-foreground">
            {/* Tighter than saroh.in's, for six columns against its five. */}
            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                <div className="grid content-start gap-5">
                    <Link
                        prefetch={false}
                        href="/"
                        aria-label="Saroh home"
                        className={`w-fit rounded-sm text-foreground no-underline ${ring()}`}
                    >
                        <Wordmark aria-hidden style={{ fontSize: 22 }} />
                    </Link>
                    <div className="grid gap-1.5">
                        <p className="m-0 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                            Let's rise together.
                        </p>
                        <p className="m-0 text-[13.5px] leading-normal">
                            <span lang="hi">सारोह</span>: sa (with) + aaroh
                            (rising)
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-x-6 gap-y-10">
                    {FOOTER_COLUMNS.map((column) => (
                        <div
                            key={column.title}
                            className="grid content-start gap-2.5"
                        >
                            <span className="mb-1 font-semibold text-foreground">
                                {column.title}
                            </span>
                            {column.links.map((link) => (
                                <Link
                                    prefetch={false}
                                    key={link.href}
                                    href={link.href}
                                    className={LINK}
                                >
                                    {link.name}
                                </Link>
                            ))}
                            {column.title === "Saroh" ? (
                                <a
                                    href={signInHref}
                                    data-cta="sign-in"
                                    className={LINK}
                                >
                                    Sign in
                                </a>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6 text-[13.5px]">
                <span>
                    A product of {site.company}. © {new Date().getFullYear()}.
                    All rights reserved. Region: Global.{" "}
                    <a data-region-link href={site.india} className={LINK}>
                        In India? Go to saroh.in
                    </a>
                </span>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {LEGAL_LINKS.map((link) => (
                        <Link
                            prefetch={false}
                            key={link.href}
                            href={link.href}
                            className={LINK}
                        >
                            {link.name}
                        </Link>
                    ))}
                </div>
            </div>
        </footer>
    );
}
