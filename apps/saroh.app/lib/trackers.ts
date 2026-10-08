import type { TrackerKind } from "@saroh/block-contract";
import { CONSENT_FREE_TRACKERS, checkTrackerId } from "@saroh/block-contract";

import { isPrivateSitePath } from "./private-paths";
import type { SiteHeadTracker } from "./site-head-shape";

/**
 * The merchant's own trackers on their live site (DEC-108, #896): what each
 * loads, and when. Pure, so the promises are tested without a browser:
 *
 * - Saroh writes every loader, from a fixed list, on fixed hosts. A tracker
 *   id only ever lands inside a JSON string in a template, and is checked
 *   again here before it does.
 * - Nothing that needs consent loads before the visitor accepts.
 * - Nothing loads on a private page (account, checkout, autopay, order,
 *   pay), whatever was accepted.
 * - PostHog loads with its dashboard-driven features off (site apps, web
 *   experiments, surveys) and every input masked; Meta's automatic form
 *   matching is off.
 */

/** What a visitor would call each tool. */
export const TRACKER_NAMES: Readonly<Record<TrackerKind, string>> = {
    ga4: "Google Analytics",
    "google-ads": "Google Ads",
    "meta-pixel": "Meta Pixel",
    posthog: "PostHog",
    clarity: "Microsoft Clarity",
    plausible: "Plausible",
    umami: "Umami",
};

/** What each tool does, for the site's cookie notice. */
export const TRACKER_PURPOSES: Readonly<Record<TrackerKind, string>> = {
    ga4: "Counts visits and how people move through the site. Sets cookies.",
    "google-ads":
        "Tells the business which of its Google ads brought visitors. Sets cookies.",
    "meta-pixel":
        "Tells the business which of its Facebook and Instagram ads brought visitors. Sets cookies.",
    posthog:
        "Counts visits and may record how pages are used, with what you type hidden. Sets cookies.",
    clarity:
        "Records how pages are used, with what you type hidden, to show where people get stuck. Sets cookies.",
    plausible: "Counts visits without cookies and without identifying you.",
    umami: "Counts visits without cookies and without identifying you.",
};

/** Every host a loader is ever fetched from. Nothing else is. */
export const LOADER_HOSTS = [
    "www.googletagmanager.com",
    "connect.facebook.net",
    "us-assets.i.posthog.com",
    "eu-assets.i.posthog.com",
    "www.clarity.ms",
    "plausible.io",
    "cloud.umami.is",
] as const;

export function needsConsent(kind: TrackerKind): boolean {
    return !CONSENT_FREE_TRACKERS.includes(kind);
}

/** Whether trackers may load on this path at all. */
export function trackersAllowedOn(path: string): boolean {
    return !isPrivateSitePath(path);
}

/** A script the page adds: a fixed `src`, or a fixed template's text. */
export interface LoaderScript {
    src?: string;
    text?: string;
    attrs?: Record<string, string>;
}

/** A value as a JavaScript string literal, safe inside a script. */
function js(value: string): string {
    // JSON is a JS literal; `<` escaped so no `</script>` can ever form.
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

const GTAG_CONSENT_GRANTED =
    "{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'}";

/**
 * The scripts that load these trackers, in order. Ids that fail their
 * check again are skipped. Called only after the visitor accepted (for the
 * tools that ask) and only on an allowed path.
 */
export function loaderScripts(
    trackers: readonly SiteHeadTracker[],
): LoaderScript[] {
    const ok = trackers.filter((t) => checkTrackerId(t.kind, t.id).ok);
    const out: LoaderScript[] = [];

    // Google Analytics and Google Ads share one gtag.js. Consent starts
    // denied and is granted before any config: the visitor has accepted
    // by the time this runs.
    const google = ok.filter(
        (t) => t.kind === "ga4" || t.kind === "google-ads",
    );
    if (google.length > 0) {
        out.push({
            text: [
                "window.dataLayer=window.dataLayer||[];",
                "function gtag(){dataLayer.push(arguments);}",
                "gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});",
                `gtag('consent','update',${GTAG_CONSENT_GRANTED});`,
                "gtag('js',new Date());",
                ...google.map((t) => `gtag('config',${js(t.id)});`),
            ].join(""),
        });
        out.push({
            src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google[0]?.id ?? "")}`,
            attrs: { async: "" },
        });
    }

    const meta = ok.find((t) => t.kind === "meta-pixel");
    if (meta) {
        out.push({
            text: [
                "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
                "fbq('consent','grant');",
                // No automatic advanced matching: form fields are never read.
                `fbq('set','autoConfig',false,${js(meta.id)});`,
                `fbq('init',${js(meta.id)});`,
                "fbq('track','PageView');",
            ].join(""),
        });
    }

    const posthog = ok.find((t) => t.kind === "posthog");
    if (posthog && (posthog.region === "us" || posthog.region === "eu")) {
        const host = `https://${posthog.region}.i.posthog.com`;
        out.push({
            text: [
                // PostHog's queueing stub, trimmed to what this page calls.
                "!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',o='init capture register opt_in_capturing opt_out_capturing startSessionRecording stopSessionRecording set_config reset'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);",
                `posthog.init(${js(posthog.id)},{api_host:${js(host)},`,
                // Nothing set in PostHog's dashboard may add code or change
                // the page; inputs are masked in recordings.
                "opt_in_site_apps:false,disable_web_experiments:true,disable_surveys:true,",
                "session_recording:{maskAllInputs:true},",
                "capture_pageview:'history_change',persistence:'localStorage+cookie'});",
            ].join(""),
        });
    }

    const clarity = ok.find((t) => t.kind === "clarity");
    if (clarity) {
        out.push({
            text: [
                "(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})",
                `(window,document,'clarity','script',${js(clarity.id)});`,
                "clarity('consentv2',{ad_Storage:'granted',analytics_Storage:'granted'});",
            ].join(""),
        });
    }

    const plausible = ok.find((t) => t.kind === "plausible");
    if (plausible) {
        out.push({
            text: "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init();",
        });
        out.push({
            src: `https://plausible.io/js/${encodeURIComponent(plausible.id)}.js`,
            attrs: { async: "" },
        });
    }

    const umami = ok.find((t) => t.kind === "umami");
    if (umami) {
        out.push({
            src: "https://cloud.umami.is/script.js",
            attrs: { defer: "", "data-website-id": umami.id },
        });
    }

    return out;
}

/** The cookies these tools set, removed when a visitor withdraws. */
export const TRACKER_COOKIE =
    /^(_ga|_gcl_|_gid$|_fbp$|_fbc$|ph_|_clck$|_clsk$|CLID$|MUID$)/;

/** A visitor's answer for this site. Kept in this browser only. */
export type SiteConsent = "granted" | "refused";

export const SITE_CONSENT_KEY = "saroh-site-consent";

/**
 * What the visitor has said, with Global Privacy Control as a standing
 * "no": a browser that sends it is never asked and never tracked by a tool
 * that needs consent.
 */
export function effectiveConsent(
    stored: SiteConsent | null,
    globalPrivacyControl: boolean,
): SiteConsent | null {
    if (globalPrivacyControl) return "refused";
    return stored;
}
