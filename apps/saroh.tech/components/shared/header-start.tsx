"use client";

import { useSyncExternalStore } from "react";

import { headerStart, onHeaderStart } from "@/lib/tools/header-start";

import { ButtonLink } from "./button";

/** "Start free", until a tool has made something worth carrying over. */
export function HeaderStart({ href }: { href: string }) {
    const after = useSyncExternalStore(onHeaderStart, headerStart, () => null);
    return (
        <ButtonLink
            look="compact"
            href={after ?? href}
            data-cta={after ? "save-send-header" : "start-free"}
            className={after ? "max-md:px-3" : undefined}
        >
            {after ? (
                <span className="whitespace-nowrap max-md:text-sm">
                    <span className="max-[379px]:hidden">
                        Save, send and get paid
                    </span>
                    <span className="min-[380px]:hidden">Save and send</span>
                </span>
            ) : (
                "Start free"
            )}
        </ButtonLink>
    );
}
