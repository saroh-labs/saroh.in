"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import type { NavSection } from "@saroh/marketing/nav-types";
import { ring } from "@saroh/marketing/ring";
import { usePhoneMenu } from "@saroh/marketing/use-phone-menu";
import dynamic from "next/dynamic";
import { useRef } from "react";

import type { NavMenus } from "@/lib/nav";
import { NAV_WORDS } from "@/lib/nav";

/** The sheet, fetched on the first tap of Menu. */
const PhoneSheet = dynamic(
    () => import("@saroh/marketing/phone-sheet").then((m) => m.PhoneSheet),
    { ssr: false },
);

/**
 * Below 1240px: the start button and a Menu button that opens the shared
 * full-screen sheet. Esc or × closes it and returns focus to Menu; while it is
 * open, focus stays inside.
 */
export function PhoneMenu({
    section,
    pathname,
    startClassName,
    signIn,
    start,
    startInSheet,
    className,
    ...menus
}: NavMenus & {
    section: NavSection;
    pathname: string;
    signIn: string;
    start: string;
    startInSheet: string;
    className?: string;
    /** On the start button: hidden while the page's sticky bar shows. */
    startClassName?: string;
}) {
    const [open, setOpen] = usePhoneMenu(pathname);
    const button = useRef<HTMLButtonElement>(null);
    const close = () => {
        setOpen(false);
        button.current?.focus();
    };

    return (
        <div
            className={cn(
                "flex items-center gap-3 min-[400px]:gap-6",
                className,
            )}
        >
            <ButtonLink
                size="sm"
                href={start}
                data-cta="start-free"
                className={cn("px-4 max-[399px]:px-3.5", startClassName)}
            >
                Start free
            </ButtonLink>
            <button
                ref={button}
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                aria-controls={open ? "nav-sheet" : undefined}
                onClick={() => setOpen(true)}
                className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-border-strong bg-transparent text-foreground hover:bg-mk-hover ${ring()}`}
            >
                <span aria-hidden className="grid gap-1">
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                </span>
            </button>
            {open ? (
                <PhoneSheet
                    section={section}
                    pathname={pathname}
                    featureItems={menus.features}
                    solutionItems={menus.solutions}
                    allTrades={{
                        name: NAV_WORDS.allTrades,
                        href: "/solutions",
                    }}
                    resources={menus.resources}
                    tools={menus.tools}
                    allTools={menus.allTools}
                    templates={menus.templates}
                    allTemplates={menus.allTemplates}
                    aboutLinks={[]}
                    pricing
                    featuresLabel={NAV_WORDS.howItWorks}
                    onClose={close}
                    actions={
                        <>
                            <ButtonLink
                                href={signIn}
                                variant="secondary"
                                data-cta="sign-in"
                                className="w-full"
                            >
                                Sign in
                            </ButtonLink>
                            <ButtonLink
                                href={startInSheet}
                                data-cta="start-free"
                                onClick={close}
                                className="w-full"
                            >
                                Start free
                            </ButtonLink>
                        </>
                    }
                />
            ) : null}
        </div>
    );
}
