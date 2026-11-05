"use client";

import { Notice } from "@saroh/ui/notice";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { formatDateTime } from "@/lib/format";

/** The API caches GitHub's answer for 15s: never ask faster than this. */
export const POLL_MS = 20_000;

/** Reads the screen again every 20 seconds while a rebuild runs. */
export function useRebuildPoll(running: boolean): void {
    const router = useRouter();
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => router.refresh(), POLL_MS);
        return () => clearInterval(timer);
    }, [running, router]);
}

/**
 * "<site> is rebuilding." while the API says a rebuild runs, read again
 * every 20 seconds until it's done; then the statuses settle. Nothing
 * polls when nothing is rebuilding.
 */
export function RebuildBanner({
    running,
    startedAt,
    site,
    words,
    deploymentsHref,
}: {
    running: boolean;
    startedAt?: string;
    site: string;
    /** "2 pages are going live." or empty. */
    words: string;
    /** /deployments, for staff who can open it. */
    deploymentsHref?: string;
}) {
    useRebuildPoll(running);
    if (!running) return null;
    return (
        <Notice
            tone="warning"
            role="status"
            align="center"
            title={`${site} is rebuilding.`}
            action={
                deploymentsHref ? (
                    <Link
                        href={deploymentsHref}
                        className="whitespace-nowrap font-medium underline underline-offset-2"
                    >
                        See it in Deployments →
                    </Link>
                ) : undefined
            }
        >
            {words ? `${words} ` : ""}
            {startedAt ? `Started ${formatDateTime(startedAt)}. ` : ""}
            It takes a few minutes; you can leave this screen.
        </Notice>
    );
}
