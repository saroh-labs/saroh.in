"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { usePathname } from "next/navigation";

import { releaseHref } from "@/lib/releases";

type Tab = "overview" | "who" | "history" | "about";

/** A release's tabs, each its own address (R11). */
export function ReleaseTabs({ releaseKey }: { releaseKey: string }) {
    const pathname = usePathname();
    const value: Tab = pathname.endsWith("/who")
        ? "who"
        : pathname.endsWith("/history")
          ? "history"
          : pathname.endsWith("/about")
            ? "about"
            : "overview";
    return (
        <TabStrip<Tab>
            label="Release"
            value={value}
            className="mb-5"
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    href: releaseHref(releaseKey),
                },
                {
                    value: "who",
                    label: "Who has it",
                    href: releaseHref(releaseKey, "who"),
                },
                {
                    value: "history",
                    label: "History",
                    href: releaseHref(releaseKey, "history"),
                },
                {
                    value: "about",
                    label: "About",
                    href: releaseHref(releaseKey, "about"),
                },
            ]}
        />
    );
}
