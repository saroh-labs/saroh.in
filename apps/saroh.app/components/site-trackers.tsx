"use client";

import { usePathname } from "next/navigation";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { ConsentBanner, SITE_CONSENT_OPEN_EVENT } from "@saroh/site-blocks";

import type { SiteHeadTracker } from "@/lib/site-head-shape";
import type { LoaderScript, SiteConsent } from "@/lib/trackers";
import {
    effectiveConsent,
    loaderScripts,
    needsConsent,
    SITE_CONSENT_KEY,
    TRACKER_COOKIE,
    TRACKER_NAMES,
    trackersAllowedOn,
} from "@/lib/trackers";

/**
 * The merchant's own trackers on their live site, and the cookie banner
 * that asks first (DEC-108, #896). The rules are `lib/trackers.ts`; this is
 * the page's half: reading the visitor's answer, adding the loaders, and
 * leaving private pages alone.
 *
 * Mounted beside the visit beacon, under the same conditions: a live host,
 * never a test release, a preview or a review page.
 *
 * On a private page (account, checkout, autopay, order, pay) nothing loads.
 * A visitor who reaches one by a client-side link after trackers loaded
 * gets a full page load instead, so no tracker script carries over; any
 * recording is stopped first.
 */

type Win = Window & {
    posthog?: {
        stopSessionRecording?: () => void;
        opt_out_capturing?: () => void;
    };
    clarity?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
};

/** Kinds already loaded on this page, across remounts. */
const loaded = new Set<string>();

function readStored(): SiteConsent | null {
    try {
        const v = window.localStorage.getItem(SITE_CONSENT_KEY);
        return v === "granted" || v === "refused" ? v : null;
    } catch {
        return null;
    }
}

/** Fired here when the answer changes; `storage` covers other tabs. */
const CHANGED = "saroh:site-consent";

function writeStored(choice: SiteConsent): void {
    try {
        window.localStorage.setItem(SITE_CONSENT_KEY, choice);
    } catch {
        // Storage blocked: the answer holds for this page only.
        remembered = choice;
    }
    window.dispatchEvent(new Event(CHANGED));
}

let remembered: SiteConsent | null = null;

function subscribe(onChange: () => void): () => void {
    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHANGED, onChange);
        window.removeEventListener("storage", onChange);
    };
}

/** "none" before an answer; "unknown" on the server, which never guesses. */
type Answer = SiteConsent | "none" | "unknown";

function answerNow(): Answer {
    return effectiveConsent(readStored() ?? remembered, gpcOn()) ?? "none";
}

function gpcOn(): boolean {
    return (
        (navigator as Navigator & { globalPrivacyControl?: boolean })
            .globalPrivacyControl === true
    );
}

function inject(scripts: readonly LoaderScript[]): void {
    for (const s of scripts) {
        const el = document.createElement("script");
        el.dataset.siteTracker = "";
        for (const [name, value] of Object.entries(s.attrs ?? {})) {
            el.setAttribute(name, value);
        }
        if (s.src) el.src = s.src;
        if (s.text) el.text = s.text;
        document.head.appendChild(el);
    }
}

function load(trackers: readonly SiteHeadTracker[]): void {
    const fresh = trackers.filter((t) => !loaded.has(t.kind));
    if (fresh.length === 0) return;
    for (const t of fresh) loaded.add(t.kind);
    inject(loaderScripts(fresh));
}

/** Stop anything recording, before a private page or a withdrawal. */
function stopRecording(): void {
    const w = window as Win;
    try {
        w.posthog?.stopSessionRecording?.();
        w.clarity?.("stop");
    } catch {
        // A tool that isn't there has nothing to stop.
    }
}

/** Withdraw: tell each tool, remove its cookies, start the page afresh. */
function withdraw(): void {
    const w = window as Win;
    stopRecording();
    try {
        w.posthog?.opt_out_capturing?.();
        w.fbq?.("consent", "revoke");
        w.clarity?.("consentv2", {
            ad_Storage: "denied",
            analytics_Storage: "denied",
        });
        w.gtag?.("consent", "update", {
            ad_storage: "denied",
            analytics_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
        });
    } catch {
        // Best effort; the reload below leaves nothing running.
    }
    const labels = window.location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < labels.length - 1; i++) {
        domains.push(`; domain=.${labels.slice(i).join(".")}`);
    }
    for (const name of document.cookie
        .split(";")
        .map((c) => c.split("=")[0]?.trim() ?? "")
        .filter((n) => TRACKER_COOKIE.test(n))) {
        for (const domain of domains) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
        }
    }
    window.location.reload();
}

export function SiteTrackers({
    trackers,
    noticeHref,
}: {
    trackers: SiteHeadTracker[];
    noticeHref: string;
}) {
    const pathname = usePathname();
    const allowed = trackersAllowedOn(pathname);
    const asking = trackers.filter((t) => needsConsent(t.kind));
    const free = trackers.filter((t) => !needsConsent(t.kind));

    const answer = useSyncExternalStore<Answer>(
        subscribe,
        answerNow,
        () => "unknown",
    );
    const consent: SiteConsent | null | undefined =
        answer === "unknown" ? undefined : answer === "none" ? null : answer;
    const [reopened, setReopened] = useState(false);
    const wasAllowed = useRef(allowed);

    useEffect(() => {
        const open = () => setReopened(true);
        window.addEventListener(SITE_CONSENT_OPEN_EVENT, open);
        return () => window.removeEventListener(SITE_CONSENT_OPEN_EVENT, open);
    }, []);

    // Into a private page after trackers loaded: a fresh page, without them.
    useEffect(() => {
        if (wasAllowed.current && !allowed && loaded.size > 0) {
            stopRecording();
            window.location.reload();
        }
        wasAllowed.current = allowed;
    }, [allowed]);

    useEffect(() => {
        if (!allowed || consent === undefined) return;
        load(free);
        if (consent === "granted") load(asking);
        // `free`/`asking` come from props that don't change on a page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed, consent]);

    // Google, PostHog, Clarity, Plausible and Umami follow in-site
    // navigation themselves; Meta's pixel is told each page.
    const firstPath = useRef(true);
    useEffect(() => {
        if (firstPath.current) {
            firstPath.current = false;
            return;
        }
        if (allowed && loaded.has("meta-pixel")) {
            (window as Win).fbq?.("track", "PageView");
        }
    }, [pathname, allowed]);

    const accept = useCallback(() => {
        writeStored("granted");
        setReopened(false);
    }, []);

    const reject = useCallback(() => {
        const wasLoaded = asking.some((t) => loaded.has(t.kind));
        writeStored("refused");
        setReopened(false);
        if (wasLoaded) withdraw();
    }, [asking]);

    const gpc =
        consent === "refused" && typeof navigator !== "undefined" && gpcOn();
    const showBanner =
        allowed &&
        asking.length > 0 &&
        consent !== undefined &&
        !gpc &&
        (consent === null || reopened);

    return showBanner ? (
        <ConsentBanner
            tools={asking.map((t) => TRACKER_NAMES[t.kind])}
            noticeHref={noticeHref}
            onAccept={accept}
            onReject={reject}
        />
    ) : null;
}
