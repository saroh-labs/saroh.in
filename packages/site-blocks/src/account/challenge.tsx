"use client";

import { useEffect, useRef } from "react";

/**
 * The bot challenge (Cloudflare Turnstile), shown in the sign-in sheet only
 * when the site's server says a code needs one (round-2 plan A, A2/A3). The
 * widget hands back a token, which goes with the next code request.
 */
const SCRIPT_SRC =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
    render(
        element: HTMLElement,
        options: {
            sitekey: string;
            callback: (token: string) => void;
            "expired-callback": () => void;
            "error-callback": () => void;
        },
    ): string;
    remove(widgetId: string): void;
}

declare global {
    interface Window {
        turnstile?: Turnstile;
    }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    loading ??= new Promise<Turnstile>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () =>
            window.turnstile
                ? resolve(window.turnstile)
                : reject(new Error("no turnstile"));
        script.onerror = () => {
            loading = null;
            reject(new Error("turnstile failed to load"));
        };
        document.head.appendChild(script);
    });
    return loading;
}

export function ChallengeWidget({
    siteKey,
    onToken,
}: {
    siteKey: string;
    onToken: (token: string | null) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const latest = useRef(onToken);
    useEffect(() => {
        latest.current = onToken;
    });

    useEffect(() => {
        let widget: string | null = null;
        let cancelled = false;
        loadTurnstile()
            .then((turnstile) => {
                if (cancelled || !box.current) return;
                widget = turnstile.render(box.current, {
                    sitekey: siteKey,
                    callback: (token) => latest.current(token),
                    "expired-callback": () => latest.current(null),
                    "error-callback": () => latest.current(null),
                });
            })
            .catch(() => latest.current(null));
        return () => {
            cancelled = true;
            if (widget) window.turnstile?.remove(widget);
        };
    }, [siteKey]);

    return <div ref={box} className="mt-3.5 min-h-[65px]" />;
}
