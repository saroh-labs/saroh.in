"use client";

import { useCallback, useEffect, useState } from "react";

export type CardImage =
    | { state: "loading" }
    | { state: "ready"; blob: Blob; src: string }
    | { state: "failed" };

/** What came back, and for which fetch: an older answer reads as loading. */
interface Settled {
    key: string;
    image: CardImage;
}

/**
 * The chosen card's PNG, fetched as a blob whenever the card or its size
 * changes, so Download and the phone's share sheet have it at hand: an
 * iPhone opens `navigator.share` only straight from the tap, with no fetch
 * in between. `retry` fetches it again after a failure.
 */
export function useCardImage(url: string): {
    image: CardImage;
    retry: () => void;
} {
    const [round, setRound] = useState(0);
    const [settled, setSettled] = useState<Settled | null>(null);
    const key = `${round}:${url}`;

    useEffect(() => {
        const abort = new AbortController();
        let src: string | null = null;
        fetch(url, { signal: abort.signal })
            .then(async (res) => {
                if (!res.ok) throw new Error(String(res.status));
                const blob = await res.blob();
                src = URL.createObjectURL(blob);
                setSettled({ key, image: { state: "ready", blob, src } });
            })
            .catch(() => {
                if (!abort.signal.aborted) {
                    setSettled({ key, image: { state: "failed" } });
                }
            });
        return () => {
            abort.abort();
            if (src) URL.revokeObjectURL(src);
        };
    }, [url, key]);

    const retry = useCallback(() => setRound((r) => r + 1), []);
    return {
        image: settled?.key === key ? settled.image : { state: "loading" },
        retry,
    };
}
