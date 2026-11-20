"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";

/** The ways on besides Publish, kept from the editor (DEC-071). */
export interface PublishMore {
    versionsHref: string;
    /** Test links: absent while they are off for the business. */
    testLinks?: { count: number; onOpen: () => void };
    /** Make a test link to share; absent without `site:update`. */
    onShareTestLink?: () => void;
    /** Go live later: from a test link, where Schedule is. */
    onSchedule?: () => void;
}

/** See versions, Test links, Share a test link and Schedule (DEC-071). */
export function MoreRow({ more }: { more: PublishMore }) {
    const link = "h-auto p-0 font-semibold coarse:min-h-11";
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Button asChild variant="link" size="sm" className={link}>
                <Link href={more.versionsHref}>See versions</Link>
            </Button>
            {more.testLinks ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.testLinks.onOpen}
                >
                    Test links ({more.testLinks.count})
                </Button>
            ) : null}
            {more.onShareTestLink ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.onShareTestLink}
                >
                    Share a test link
                </Button>
            ) : null}
            {more.onSchedule ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.onSchedule}
                >
                    Schedule
                </Button>
            ) : null}
        </div>
    );
}
