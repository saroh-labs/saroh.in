"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { useState } from "react";

import { ctaClasses } from "../blocks/cta";
import { frontButton } from "../blocks/look-front";
import { SitePageMessage } from "../site-page-message";
import type { WatchResult, WatchView } from "./back-in-stock-shape";
import { stopWaitingWords, WATCH_WORDS } from "./back-in-stock-shape";

/**
 * "Stop waiting" (DEC-174, automatic notices U24, #1155): the page at
 * `/shop/stop-waiting/<token>` on the business's site, for a visitor who
 * asked to be told when a product is back. It says what they are waiting
 * for and offers "Stop waiting", a button: opening the page never stops
 * anything, since mail scanners open links (U23). Told or stopped already,
 * it says so, with the way back to the shop.
 *
 * The site's own page frame (`SitePageMessage`), so it is drawn from
 * `--site-*` only, in Classic or the site's look.
 */
export function StopWaitingPage({
    view: first,
    token,
    stop,
    look,
}: {
    view: WatchView;
    token: string;
    /** The site's server action: stops the watch the token names. */
    stop: (token: string) => Promise<WatchResult<WatchView>>;
    /** Folio, Quiet or Live (DEC-172); absent is Classic. */
    look?: LookId;
}) {
    const [view, setView] = useState(first);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const words = stopWaitingWords(view);
    const primary = look ? frontButton(look, "fill") : ctaClasses("primary");
    const secondary = look
        ? frontButton(look, "link")
        : ctaClasses("secondary");
    const waiting = view.state === "waiting";

    async function press() {
        if (busy) return;
        setProblem(null);
        setBusy(true);
        try {
            const r = await stop(token);
            if (r.ok) setView(r.data);
            else {
                setProblem(
                    r.reason === "test-release" || r.reason === "busy"
                        ? r.message
                        : WATCH_WORDS.stopFailed,
                );
            }
        } catch {
            setProblem(WATCH_WORDS.offline);
        } finally {
            setBusy(false);
        }
    }

    return (
        <SitePageMessage
            look={look}
            eyebrow={words.eyebrow}
            title={words.title}
            actions={
                <>
                    {waiting ? (
                        <button
                            type="button"
                            onClick={() => void press()}
                            disabled={busy}
                            data-site-primary=""
                            className={primary}
                        >
                            {busy ? WATCH_WORDS.stopping : WATCH_WORDS.stop}
                        </button>
                    ) : null}
                    <Link
                        href="/shop"
                        className={waiting ? secondary : primary}
                    >
                        Go to the shop
                    </Link>
                </>
            }
            note={
                problem ? (
                    <span role="alert" data-stop-waiting-problem="">
                        {problem}
                    </span>
                ) : undefined
            }
        >
            {words.body}
        </SitePageMessage>
    );
}
