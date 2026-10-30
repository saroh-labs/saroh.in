"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { usePathname } from "next/navigation";

type Tab = "overview" | "content" | "history";

/** A search page's tabs, each its own address. */
export function SearchPageTabs({ slug }: { slug: string }) {
    const pathname = usePathname();
    const base = `/search-pages/${slug}`;
    const value: Tab = pathname.endsWith("/content")
        ? "content"
        : pathname.endsWith("/history")
          ? "history"
          : "overview";
    return (
        <TabStrip<Tab>
            label="Search page"
            value={value}
            className="mb-5"
            tabs={[
                { value: "overview", label: "Overview", href: base },
                { value: "content", label: "Content", href: `${base}/content` },
                { value: "history", label: "History", href: `${base}/history` },
            ]}
        />
    );
}
