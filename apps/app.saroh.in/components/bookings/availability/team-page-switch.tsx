"use client";

import Link from "next/link";

import { useWebsiteArea } from "@/components/sites/website-area";
import type { StaffView } from "@/lib/staff/types";

/**
 * "On the website's Our team page" (round 3, EBTeamPicker): read only. An
 * owner or admin picks who appears, in the Our team page's People list;
 * nobody switches it for themselves. Shown only while the person is on the
 * page; "Change in Website" only for those who may change it. Only with
 * the Website area on, as the page type is.
 */
export function TeamPageSwitch({
    person,
    canManage,
}: {
    person: StaffView;
    canManage: boolean;
}) {
    const area = useWebsiteArea();
    if (!area || person.showOnTeamPage !== true) return null;
    return (
        <div
            className="mt-4 flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
            data-team-page-line=""
        >
            <span className="min-w-0 flex-1">
                On the website&apos;s Our team page
            </span>
            {canManage ? (
                <Link
                    href="/sites/our-team"
                    className="shrink-0 whitespace-nowrap font-semibold underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                >
                    Change in Website
                </Link>
            ) : null}
        </div>
    );
}
