import Link from "next/link";

import { SIGN_IN_URL, WAITLIST_HREF } from "@/lib/links";
import { JOBS } from "@/lib/site-content";

const heading =
    "mb-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
const link =
    "text-[13px] text-highlight-600 hover:text-foreground hover:underline hover:underline-offset-[3px] dark:text-highlight-400";

/**
 * Four columns after the design: the jobs, the site, getting in, and what is
 * not written yet — said in the footer rather than linked to an empty page.
 */
export function SiteFooter() {
    return (
        <footer className="mx-auto max-w-[1220px] border-t border-border px-4 pb-10 pt-[30px] sm:px-10">
            <div className="mb-[26px] grid grid-cols-1 gap-[26px] sm:grid-cols-2 lg:grid-cols-4">
                <nav aria-label="The five jobs">
                    <div className={heading}>The five jobs</div>
                    <ul className="flex flex-col items-start gap-2">
                        {JOBS.map((job) => (
                            <li key={job.key}>
                                <Link href={job.route} className={link}>
                                    {job.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                <nav aria-label="Saroh">
                    <div className={heading}>Saroh</div>
                    <ul className="flex flex-col items-start gap-2">
                        <li>
                            <Link href="/" className={link}>
                                Home
                            </Link>
                        </li>
                        <li>
                            <Link href="/how-it-works" className={link}>
                                How it works
                            </Link>
                        </li>
                        <li>
                            <Link href="/coming-soon" className={link}>
                                Coming soon
                            </Link>
                        </li>
                    </ul>
                </nav>
                <nav aria-label="Get started">
                    <div className={heading}>Get started</div>
                    <ul className="flex flex-col items-start gap-2">
                        <li>
                            <Link href={WAITLIST_HREF} className={link}>
                                Join the waitlist
                            </Link>
                        </li>
                        <li>
                            <a href={SIGN_IN_URL} className={link}>
                                Sign in
                            </a>
                        </li>
                    </ul>
                </nav>
                <div>
                    <div className={heading}>Not written yet</div>
                    <p className="text-pretty text-[13px] leading-[1.6] text-muted-foreground">
                        Pricing, documentation and a changelog are not ready. We
                        would rather leave the links out than send you to an
                        empty page.
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 border-t border-border pt-[18px]">
                <span className="text-[12px] text-muted-foreground">
                    Saroh · <span className="font-mono">saroh.in</span>
                </span>
                <span className="ml-auto text-[12px] text-muted-foreground">
                    Businesses live at their own{" "}
                    <span className="font-mono text-[11px]">saroh.app</span>{" "}
                    address
                </span>
            </div>
        </footer>
    );
}
