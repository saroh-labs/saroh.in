"use client";

import { ChallengeWidget } from "@saroh/site-blocks/challenge";
import { useEffect, useState } from "react";

import { phoneOptions } from "@/lib/phone-sign-in";

/**
 * The bot check (Turnstile) an emailed code or link needs once its address
 * is past the hourly cap: the API answered `CHALLENGE`, so the screen shows
 * this and sends again with the token the moment there is one. The public
 * key is the one phone sign-in draws its check with.
 */
export function CodeChallenge({
    onToken,
}: {
    onToken: (token: string) => void;
}) {
    const [siteKey, setSiteKey] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        void phoneOptions().then((o) => live && setSiteKey(o.turnstileSiteKey));
        return () => {
            live = false;
        };
    }, []);
    return siteKey ? (
        <ChallengeWidget
            siteKey={siteKey}
            onToken={(token) => {
                if (token) onToken(token);
            }}
        />
    ) : null;
}
