"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import type { NavSection } from "@saroh/marketing/nav-types";
import { ring } from "@saroh/marketing/ring";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { NavMenus } from "@/lib/nav";

/** The sheet, fetched on the first tap of Menu. */
const PhoneSheet = dynamic(
    () => import("@saroh/marketing/phone-sheet").then((m) => m.PhoneSheet),
    { ssr: false },
);

/**
 * Below 1100px: the start button and a Menu button that opens the shared
 * full-screen sheet. Esc or × closes it and returns focus to Menu; while it is
 * open, focus stays inside.
 */
export function PhoneMenu({
    section,
    pathname,
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
}) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const close = () => {
        setOpen(false);
        button.current?.focus();
    };

    // A new page, or a window widened past the phone nav, closes the sheet.
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(false);
    }
    useEffect(() => {
        if (!open) return;
        const wide = window.matchMedia("(min-width: 1100px)");
        const onChange = () => wide.matches && setOpen(false);
        wide.addEventListener("change", onChange);
        return () => wide.removeEventListener("change", onChange);
    }, [open]);

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
                className="px-4 max-[399px]:px-3.5"
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
                    resources={menus.resources}
                    tools={menus.tools}
                    allTools={menus.allTools}
                    templates={menus.templates}
                    allTemplates={menus.allTemplates}
                    aboutLinks={[]}
                    pricing
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
