"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { DevelopersTabItem } from "@/lib/settings/developers";
import { DEVELOPERS_HREF, developersTabOf } from "@/lib/settings/developers";

/** What each tab holds, in the phone's list. */
const LINES: Record<DevelopersTabItem["tab"], string> = {
    "ask-ai": "Questions about your business, answered in Saroh",
    ai: "Claude, ChatGPT and other assistants",
    keys: "For your own website and software",
    webhooks: "Tell your systems when something happens",
    usage: "This minute's calls and your limits",
};

function Label({ tab }: { tab: DevelopersTabItem }) {
    return (
        <>
            {tab.label}
            {tab.term ? (
                <small className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                    {tab.term}
                </small>
            ) : null}
        </>
    );
}

/**
 * The area's own tabs ("API and AI apps" boards): at the desk a strip of
 * links under the header. On a phone the area opens as a list of them, and
 * each tab has a way back to it, so the page under is one tab at a time.
 */
export function DevelopersNav({
    tabs,
}: {
    tabs: readonly DevelopersTabItem[];
}) {
    const pathname = usePathname();
    const at = developersTabOf(pathname);
    // The desk's default is AI assistants, or the first tab when it is off.
    const current =
        at !== "index"
            ? at
            : tabs.some((t) => t.tab === "ai")
              ? "ai"
              : (tabs[0]?.tab ?? "ai");
    const open = tabs.find((t) => t.tab === current);
    return (
        <>
            <TabStrip
                label="API and AI apps"
                className="max-[759px]:hidden"
                value={current}
                tabs={tabs.map((t) => ({
                    value: t.tab,
                    label: <Label tab={t} />,
                    href: t.href,
                }))}
            />
            {at === "index" ? (
                <nav
                    aria-label="API and AI apps"
                    className="min-[760px]:hidden"
                    data-ph-unmask=""
                >
                    <ul className="overflow-hidden rounded-[11px] border border-border bg-card">
                        {tabs.map((t) => (
                            <li
                                key={t.tab}
                                className="border-b border-border last:border-b-0"
                            >
                                <Link
                                    href={
                                        t.tab === "ai"
                                            ? `${DEVELOPERS_HREF}/ai`
                                            : t.href
                                    }
                                    className="flex min-h-[60px] items-center gap-3 px-[14px] py-3 active:bg-foreground/[0.07]"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[14px] font-semibold">
                                            <Label tab={t} />
                                        </span>
                                        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                            {LINES[t.tab]}
                                        </span>
                                    </span>
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            ) : (
                <div
                    className="flex items-center gap-1 min-[760px]:hidden"
                    data-ph-unmask=""
                >
                    <Link
                        href={DEVELOPERS_HREF}
                        aria-label="Back to API and AI apps"
                        className="-ml-2 inline-flex size-11 items-center justify-center rounded-lg active:bg-foreground/[0.07]"
                    >
                        <ChevronLeft aria-hidden className="size-5" />
                    </Link>
                    <h2 className="text-[17px] font-semibold">
                        {open ? <Label tab={open} /> : null}
                    </h2>
                </div>
            )}
        </>
    );
}
