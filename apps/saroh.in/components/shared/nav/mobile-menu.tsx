"use client";

import { cn } from "@/lib/cn";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { ring } from "@/lib/ring";

import { CtaLink } from "../buttons/cta-link";
import type { NavItem, NavSection } from "./nav-section";

/** The sheet, fetched on the first tap of Menu. */
const MobileSheet = dynamic(
    () => import("./mobile-sheet").then((m) => m.MobileSheet),
    { ssr: false },
);
/**
 * The phone nav (below 760px, Nav design): the start button and a Menu
 * button that opens a full-screen sheet with Features, Solutions and (when
 * any page is live) Resources and Tools as accordions — the section the page is in
 * starts open — then Pricing and Sign in (once the launch switch is open)
 * and the start button. Esc or × closes it and returns focus to Menu; while
 * it is open, focus stays inside.
 */
export function MobileMenu({
    section,
    pathname,
    features,
    solutions,
    resources = [],
    tools = [],
    className,
}: {
    section: NavSection;
    pathname: string;
    features: NavItem[];
    solutions: NavItem[];
    resources?: NavItem[];
    tools?: NavItem[];
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);

    // A new page, or a window widened past 760px, closes the sheet.
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(false);
    }
    useEffect(() => {
        if (!open) return;
        const wide = window.matchMedia("(min-width: 760px)");
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
            <CtaLink
                src="nav"
                size="sm"
                short
                className="px-4 max-[399px]:px-3.5"
            />
            <button
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
                <MobileSheet
                    section={section}
                    pathname={pathname}
                    resources={resources}
                    tools={tools}
                    featureItems={features}
                    solutionItems={solutions}
                    onClose={close}
                />
            ) : null}
        </div>
    );
}
