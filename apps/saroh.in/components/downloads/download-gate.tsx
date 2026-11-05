"use client";

import type {
    DownloadContact,
    DownloadResult,
} from "@saroh/search-pages/pages";
import { DownloadGateProvider } from "@saroh/search-pages/pages";
import { ChallengeWidget } from "@saroh/site-blocks/challenge";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type {
    DownloadGateOptions,
    DownloadUnlockResult,
} from "@/lib/download-gate";

const ROUTE = "/api/downloads/unlock";

/** The unlock route's answer, as the shared gate reads it. */
export async function downloadGateSubmit(
    slug: string,
    contact: DownloadContact,
    turnstileToken: string | null,
): Promise<DownloadResult> {
    const res = await fetch(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            slug,
            ...contact,
            ...(turnstileToken ? { turnstileToken } : {}),
        }),
    });
    const body = (await res.json()) as DownloadUnlockResult;
    return body.unlocked
        ? { ok: true, emailed: body.emailed }
        : { ok: false, reason: body.failure };
}

/**
 * A download's gate on saroh.in (#1206): the unlock route with this page's
 * slug, the Privacy page, and the Turnstile check when the API has a key
 * (none drawn when it hasn't). Wraps the page's `<DownloadGate>`.
 */
export function SiteDownloadGate({
    slug,
    children,
}: {
    slug: string;
    children: ReactNode;
}) {
    const [siteKey, setSiteKey] = useState<string | null>(null);
    // A token passes once: each submit draws a fresh check (`round`).
    const [round, setRound] = useState(0);
    const token = useRef<string | null>(null);

    useEffect(() => {
        let live = true;
        fetch(ROUTE)
            .then((res) => res.json() as Promise<DownloadGateOptions>)
            .then((o) => {
                if (live) setSiteKey(o.turnstileSiteKey);
            })
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, []);

    return (
        <DownloadGateProvider
            privacy="/privacy"
            onSubmit={async (contact) => {
                const sent = token.current;
                token.current = null;
                try {
                    return await downloadGateSubmit(slug, contact, sent);
                } finally {
                    if (sent) setRound((r) => r + 1);
                }
            }}
            challenge={
                siteKey ? (
                    <ChallengeWidget
                        key={round}
                        siteKey={siteKey}
                        onToken={(t) => {
                            token.current = t;
                        }}
                    />
                ) : null
            }
        >
            {children}
        </DownloadGateProvider>
    );
}
