"use client";

import { cn } from "@/lib/cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { LAUNCH_MODE, SIGN_IN_URL } from "@/lib/links";
import { ring } from "@/lib/ring";

import { CtaLink } from "../buttons/cta-link";
import { useFocusTrap } from "../layout/use-focus-trap";
import type { NavItem, NavSection } from "./nav-section";

/** A row on the sheet: 52px, 18px Geist 600, a hairline above. */
const ROW = `flex h-[52px] w-full cursor-pointer items-center border-t border-border text-lg font-semibold text-foreground no-underline hover:text-foreground ${ring()}`;

/**
 * The phone nav's full-screen sheet (`MobileMenu`), in its own file so it is
 * fetched on the first tap of Menu, not with every page.
 */
export function MobileSheet({
    section,
    pathname,
    resources,
    tools,
    featureItems,
    solutionItems,
    onClose,
}: {
    section: NavSection;
    pathname: string;
    resources: NavItem[];
    tools: NavItem[];
    featureItems: NavItem[];
    solutionItems: NavItem[];
    onClose: () => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    useFocusTrap(root, true, onClose);
    const [features, setFeatures] = useState(section === "features");
    const [solutions, setSolutions] = useState(section === "solutions");
    const [resourcesOpen, setResourcesOpen] = useState(section === "resources");
    const [toolsOpen, setToolsOpen] = useState(section === "tools");

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
                    className={`size-11 cursor-pointer rounded-[10px] border border-border-strong bg-transparent text-xl text-foreground hover:bg-mk-hover ${ring()}`}
                >
                    ×
                </button>
            </div>
            <Accordion
                id="features"
                label="Features"
                items={featureItems}
                pathname={pathname}
                open={features}
                onToggle={() => setFeatures(!features)}
                first
            />
            <Accordion
                id="solutions"
                label="Solutions"
                items={solutionItems}
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
            {tools.length > 0 ? (
                <Accordion
                    id="tools"
                    label="Tools"
                    items={tools}
                    pathname={pathname}
                    open={toolsOpen}
                    onToggle={() => setToolsOpen(!toolsOpen)}
                />
            ) : null}
            {LAUNCH_MODE === "open" ? (
                <Link
                    href="/pricing"
                    onClick={onClose}
                    aria-current={pathname === "/pricing" ? "page" : undefined}
                    className={ROW}
                >
                    Pricing
                </Link>
            ) : null}
            {LAUNCH_MODE === "open" ? (
                <a href={SIGN_IN_URL} className={ROW}>
                    Sign in
                </a>
            ) : null}
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
                            className={`grid cursor-pointer gap-0.5 rounded-[10px] border border-mk-line-soft bg-card px-3 py-2.5 text-foreground no-underline hover:border-border-strong hover:text-foreground ${ring()}`}
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
