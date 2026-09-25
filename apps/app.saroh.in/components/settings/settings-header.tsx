"use client";

import { PageHeader } from "@saroh/ui/page-header";
import { usePathname } from "next/navigation";

import { SETTINGS_PAGES } from "@/components/shared/nav-items";

/**
 * The band over the settings screen ("Saroh Settings" design): where you are
 * — Workspace, Settings, the tab — and the screen's title, across both the
 * tabs and the page, ruled off from them.
 */
export function SettingsHeader() {
    const pathname = usePathname();
    const page = SETTINGS_PAGES.find(
        (p) => pathname === p.href || pathname.startsWith(`${p.href}/`),
    );
    return (
        <div className="border-b border-border px-4 pb-4 pt-5 sm:px-[26px]">
            <PageHeader
                className="mb-0"
                breadcrumb={[
                    "Workspace",
                    "Settings",
                    ...(page ? [page.label] : []),
                ]}
                title="Settings"
            />
        </div>
    );
}
