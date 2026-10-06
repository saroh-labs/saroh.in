"use client";

import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SIGN_IN_URL } from "@/lib/links";

import { CtaLink } from "./cta-link";
import type { NavItem, NavSection } from "./nav-items";
import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";
import { useFocusTrap } from "./use-focus-trap";

/** A row on the sheet: 52px, 18px Geist 600, a hairline above. */
const ROW =
    "flex h-[52px] w-full cursor-pointer items-center border-t border-border text-lg font-semibold text-foreground no-underline hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/**
 * The phone nav (below 760px, Nav design): the start button and a Menu
 * button that opens a full-screen sheet with Features, Solutions and (when
 * any page is live) Resources as accordions — the section the page is in starts open — then Sign in
 * and the start button. Esc or × closes it and returns focus to Menu; while
 * it is open, focus stays inside.
 */
export function MobileMenu({
    section,
    pathname,
    resources = [],
    className,
}: {
    section: NavSection;
    pathname: string;
    resources?: NavItem[];
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
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-border-strong bg-transparent text-foreground hover:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
            >
                <span aria-hidden className="grid gap-1">
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                    <span className="block h-0.5 w-[18px] rounded-sm bg-foreground" />
                </span>
            </button>
            {open ? (
                <Sheet
                    section={section}
                    pathname={pathname}
                    resources={resources}
                    onClose={close}
                />
            ) : null}
        </div>
    );
}

function Sheet({
    section,
    pathname,
    resources,
    onClose,
}: {
    section: NavSection;
    pathname: string;
    resources: NavItem[];
    onClose: () => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    useFocusTrap(root, true, onClose);
    const [features, setFeatures] = useState(section === "features");
    const [solutions, setSolutions] = useState(section === "solutions");
    const [resourcesOpen, setResourcesOpen] = useState(section === "resources");

    return (
        <div
            ref={root}
            id="nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-50 grid content-start gap-2 overflow-y-auto bg-background px-mk-nav pb-8 pt-5"
        >
            <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-wordmark text-[22px] font-semibold tracking-[-0.025em]">
                    Menu
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close menu"
                    className="size-11 cursor-pointer rounded-[10px] border border-border-strong bg-transparent text-xl text-foreground hover:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                >
                    ×
                </button>
            </div>
            <Accordion
                id="features"
                label="Features"
                items={FEATURE_ITEMS}
                pathname={pathname}
                open={features}
                onToggle={() => setFeatures(!features)}
                first
            />
            <Accordion
                id="solutions"
                label="Solutions"
                items={SOLUTION_ITEMS}
                pathname={pathname}
                open={solutions}
                onToggle={() => setSolutions(!solutions)}
            />
            {resources.length > 0 ? (
                <Accordion
                    id="resources"
                    label="Resources"
                    items={resources}
                    pathname={pathname}
                    open={resourcesOpen}
                    onToggle={() => setResourcesOpen(!resourcesOpen)}
                />
            ) : null}
            <a href={SIGN_IN_URL} className={ROW}>
                Sign in
            </a>
            <CtaLink
                src="nav-sheet"
                onNavigate={onClose}
                className="mt-3 w-full"
            />
        </div>
    );
}

function Accordion({
    id,
    label,
    items,
    pathname,
    open,
    onToggle,
    first = false,
}: {
    id: string;
    label: string;
    items: NavItem[];
    pathname: string;
    open: boolean;
    onToggle: () => void;
    first?: boolean;
}) {
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? `nav-sheet-${id}` : undefined}
                onClick={onToggle}
                className={cn(
                    ROW,
                    "justify-between bg-transparent p-0",
                    first && "border-t-0",
                )}
            >
                {label}
                <ChevronDown
                    aria-hidden
                    data-chevron
                    strokeWidth={2.25}
                    className={cn(
                        "size-[18px] text-muted-foreground transition-transform duration-fast ease-out motion-reduce:transition-none",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? (
                <div id={`nav-sheet-${id}`} className="grid gap-0.5 pb-2">
                    {items.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={
                                item.href === pathname ? "page" : undefined
                            }
                            className="grid cursor-pointer gap-0.5 rounded-[10px] border border-mk-line-soft bg-card px-3 py-2.5 text-foreground no-underline hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            <span className="text-[15.5px] font-semibold">
                                {item.name}
                            </span>
                            <span className="text-mk-note text-muted-foreground">
                                {item.line}
                            </span>
                        </Link>
                    ))}
                </div>
            ) : null}
        </>
    );
}
