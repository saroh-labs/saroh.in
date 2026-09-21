"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { SIGN_IN_URL, WAITLIST_HREF } from "@/lib/links";
import { JOBS } from "@/lib/site-content";

import { JobIcon } from "./job-icon";

/**
 * Sticky chrome, after "Saroh Marketing Site". Desk: the logo is the home
 * control, "What it does" opens the five jobs, "How it works" sits beside it.
 * Phone: every page in one flat row that scrolls sideways and keeps the
 * current one in view.
 *
 * The current page carries a 2px Saffron rule that wipes in from the left —
 * the design's `om-ul`, done as a scaleX so it runs on the compositor.
 */
const TOP = [{ href: "/how-it-works", label: "How it works" }];
const FLAT = [
    ...JOBS.map((job) => ({ href: job.route, label: job.name })),
    ...TOP,
];

function Marker() {
    return (
        <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-200 ease-out group-aria-[current=page]:scale-x-100 motion-reduce:transition-none"
        />
    );
}

const navLink =
    "group relative inline-flex h-[34px] shrink-0 items-center gap-[5px] whitespace-nowrap px-1 text-[13px] font-medium text-neutral-600 transition-colors hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground dark:text-neutral-400";

export function SiteNav() {
    const { resolvedTheme, setTheme } = useTheme();
    const pathname = usePathname();
    const onJob = JOBS.some((job) => job.route === pathname);
    const row = useRef<HTMLDivElement>(null);

    // Keep the current page in view in the phone row, as the design does,
    // rather than leaving a visitor on /insights looking at Sell and Website.
    useEffect(() => {
        const el = row.current;
        const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!el) return;
        if (!current) {
            el.scrollLeft = 0;
            return;
        }
        const left = current.offsetLeft - el.offsetLeft;
        const over = left + current.offsetWidth - el.clientWidth;
        if (over > 0) el.scrollLeft = over + 12;
        else if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 12);
    }, [pathname]);

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background px-4 py-[13px] sm:px-10">
            <div className="mx-auto flex max-w-[1220px] items-center gap-3.5">
                <Link
                    href="/"
                    aria-label="Saroh, home"
                    className="flex shrink-0 items-center"
                >
                    <Wordmark style={{ fontSize: "1.125rem" }} />
                </Link>

                <nav
                    aria-label="Pages"
                    className="ml-3 hidden items-center gap-4 md:flex"
                >
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger
                            aria-current={onJob ? "page" : undefined}
                            className={cn(
                                navLink,
                                "outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground",
                            )}
                        >
                            What it does
                            <ChevronDown
                                aria-hidden
                                className="size-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
                            />
                            <Marker />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            sideOffset={8}
                            className="w-80 rounded-[12px] p-[7px]"
                        >
                            {JOBS.map((job) => (
                                <DropdownMenuItem
                                    key={job.key}
                                    asChild
                                    className="block rounded-[9px] px-[11px] py-[9px] data-[current=true]:bg-muted"
                                    data-current={pathname === job.route}
                                >
                                    <Link
                                        href={job.route}
                                        aria-current={
                                            pathname === job.route
                                                ? "page"
                                                : undefined
                                        }
                                    >
                                        <span className="flex items-center gap-[9px]">
                                            <JobIcon
                                                name={job.icon}
                                                className="size-4 text-brand"
                                            />
                                            <span className="text-[13px] font-semibold">
                                                {job.name}
                                            </span>
                                        </span>
                                        <span className="mt-[3px] block text-pretty pl-[25px] text-[13px] leading-normal text-neutral-600 dark:text-neutral-400">
                                            {job.short}
                                        </span>
                                    </Link>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {TOP.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={
                                pathname === item.href ? "page" : undefined
                            }
                            className={navLink}
                        >
                            {item.label}
                            <Marker />
                        </Link>
                    ))}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3">
                    <button
                        type="button"
                        onClick={() =>
                            setTheme(
                                resolvedTheme === "dark" ? "light" : "dark",
                            )
                        }
                        aria-label="Toggle theme"
                        className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {/* Both icons render and CSS picks one: the theme
                            class is on <html> before hydration, so this is
                            right on first paint without a mounted flag. */}
                        <Moon aria-hidden className="size-4 dark:hidden" />
                        <Sun aria-hidden className="hidden size-4 dark:block" />
                    </button>
                    <a
                        href={SIGN_IN_URL}
                        className="hidden text-[13px] text-neutral-600 hover:text-foreground dark:text-neutral-400 sm:inline"
                    >
                        Sign in
                    </a>
                    {/* The waitlist is the one ask until signup opens (#261). */}
                    <Link
                        href={WAITLIST_HREF}
                        className="inline-flex h-[38px] items-center rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                        Join the waitlist
                    </Link>
                </div>
            </div>

            <div
                ref={row}
                className="-mx-1 mt-2 flex gap-3.5 overflow-x-auto px-1 pb-[3px] md:hidden"
            >
                {FLAT.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={
                            pathname === item.href ? "page" : undefined
                        }
                        className={cn(navLink, "h-8")}
                    >
                        {item.label}
                        <Marker />
                    </Link>
                ))}
                <a href={SIGN_IN_URL} className={cn(navLink, "h-8 sm:hidden")}>
                    Sign in
                </a>
            </div>
        </header>
    );
}
