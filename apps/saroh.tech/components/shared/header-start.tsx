"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { useSyncExternalStore } from "react";

import { headerStart, onHeaderStart } from "@/lib/tools/header-start";

/** "Start free", until a tool has made something worth carrying over. */
export function HeaderStart({
    href,
    className,
}: {
    href: string;
    className?: string;
}) {
    const after = useSyncExternalStore(onHeaderStart, headerStart, () => null);
    return (
        <ButtonLink
            size="sm"
            href={after ?? href}
            data-cta={after ? "save-send-header" : "start-free"}
            className={className}
        >
            {after ? "Save it in Saroh" : "Start free"}
        </ButtonLink>
    );
}
