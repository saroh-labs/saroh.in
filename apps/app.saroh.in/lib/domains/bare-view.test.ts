/**
 * What the domain screen says about a bare domain (DEC-140), state by
 * state: the words, whether the forwarding step shows, and that it is
 * never more than a notice beside a `www` domain that is live. Made-up
 * domains only.
 */
import { describe, expect, it } from "vitest";

import {
    aliasNote,
    BARE_WORDS,
    bareSelfNote,
    bareView,
    connectedAsWww,
} from "./bare-view";
import { domainView } from "./domain-view";
import type { BareDomainRead, SiteDomain } from "./service";

const ZONE = "Asia/Kolkata";

function www(
    bare: Partial<BareDomainRead> | null,
    over: Partial<SiteDomain> = {},
): SiteDomain {
    return {
        id: "dom_1",
        hostname: "www.yourshop.co.in",
        status: "VERIFIED",
        siteId: "site_1",
        verifiedAt: "2026-10-10T09:00:00Z",
        lastCheckedAt: null,
        lastCheckResult: null,
        createdAt: "2026-10-10T08:00:00Z",
        dnsRecord: { type: "TXT", name: "_saroh-verification.x", value: "v" },
        hosting: {
            state: "LIVE",
            problem: null,
            checkedAt: "2026-10-12T04:30:00Z",
            dnsRecord: null,
        },
        hostnameKind: "www",
        bare:
            bare === null
                ? null
                : {
                      hostname: "yourshop.co.in",
                      forwardTo: "https://www.yourshop.co.in",
                      state: null,
                      checkedAt: "2026-10-12T04:30:00Z",
                      added: false,
                      ...bare,
                  },
        ...over,
    };
}

const view = (domain: SiteDomain) => bareView(domain, domainView(domain), ZONE);

describe("bareView", () => {
    it("has nothing to say for a domain with no bare domain to forward", () => {
        expect(view(www(null, { hostname: "shop.yourshop.co.in" }))).toBeNull();
        expect(view({ ...www(null), bare: undefined })).toBeNull();
    });

    it("shows the forwarding step before the first look, with no line", () => {
        const waiting = www(
            { checkedAt: null },
            { status: "PENDING", hosting: undefined },
        );
        expect(view(waiting)).toMatchObject({
            hostname: "yourshop.co.in",
            www: "www.yourshop.co.in",
            forwardTo: "https://www.yourshop.co.in",
            showStep: true,
            // Third, after the two records the waiting scene lists.
            stepHeading: "3. Forward yourshop.co.in to www.yourshop.co.in",
            line: null,
            tone: "plain",
            canAdd: false,
            offerCheck: false,
        });
    });

    it("numbers the step only when it follows both records", () => {
        const notPointed = www(
            { state: "NOT_FORWARDING" },
            {
                hosting: {
                    state: "NOT_POINTED",
                    problem: null,
                    checkedAt: null,
                    dnsRecord: null,
                },
            },
        );
        expect(view(notPointed)?.stepHeading).toBe(
            "Forward yourshop.co.in to www.yourshop.co.in",
        );
    });

    it("says it forwards, in small text, and folds the step away", () => {
        expect(view(www({ state: "FORWARDS" }))).toMatchObject({
            showStep: false,
            line: "Checked 12 Oct: yourshop.co.in forwards to www.yourshop.co.in.",
            tone: "plain",
            offerCheck: false,
        });
    });

    it("warns that https on the bare domain fails when it forwards over http only", () => {
        expect(view(www({ state: "FORWARDS_HTTP_ONLY" }))).toMatchObject({
            showStep: false,
            line: "Checked 12 Oct: yourshop.co.in forwards to www.yourshop.co.in, but not over https. Someone who types https://yourshop.co.in will see a browser warning. Turn on HTTPS or SSL for forwarding at your provider if it offers it. www.yourshop.co.in is not affected.",
            tone: "warning",
            offerCheck: true,
        });
    });

    it("says a bare domain that doesn't forward leaves www alone, and shows the step again", () => {
        expect(view(www({ state: "NOT_FORWARDING" }))).toMatchObject({
            showStep: true,
            line: "Checked 12 Oct: yourshop.co.in doesn't forward to www.yourshop.co.in yet. Someone who types yourshop.co.in won't reach your site. www.yourshop.co.in is not affected.",
            tone: "warning",
            canAdd: false,
            // A live domain has no check of its own: this offers one.
            offerCheck: true,
        });
    });

    it("offers to add a bare domain that points straight at Saroh", () => {
        expect(view(www({ state: "POINTS_HERE" }))).toMatchObject({
            showStep: false,
            line: "Checked 12 Oct: yourshop.co.in points straight at Saroh, so it needs no forwarding. It won't open your site until you add it as a domain too.",
            tone: "info",
            canAdd: true,
        });
    });

    it("points at the bare domain's own row once it was added", () => {
        expect(view(www({ state: "POINTS_HERE", added: true }))).toMatchObject({
            line: "Checked 12 Oct: yourshop.co.in points straight at Saroh and is added as a domain of its own. Its own row says where it stands.",
            tone: "plain",
            canAdd: false,
            offerCheck: false,
        });
    });

    it("reads a state it doesn't know as not looked at", () => {
        expect(view(www({ state: "SOMETHING_NEW" }))).toMatchObject({
            showStep: true,
            line: null,
            tone: "plain",
        });
    });

    it("offers no check where the api can't run one", () => {
        const off = www({ state: "NOT_FORWARDING" }, { hosting: undefined });
        expect(view(off)?.offerCheck).toBe(false);
    });

    it("never changes what the www domain's own state says", () => {
        const domain = www({ state: "NOT_FORWARDING" });
        expect(domainView(domain)).toMatchObject({
            scene: "live",
            badge: { label: "Live", variant: "success" },
            problem: null,
        });
    });
});

describe("the bare-domain words", () => {
    it("says where the site will live once a bare domain became www", () => {
        expect(connectedAsWww("yourshop.in", "www.yourshop.in")).toBe(
            "Your site will live at www.yourshop.in. yourshop.in will forward to it, which is the last step below.",
        );
    });

    it("names the usual words for forwarding, and no provider", () => {
        expect(BARE_WORDS.stepBody).toBe(
            "Sign in where you manage the domain and look for Forwarding, Redirect or URL redirect. It is often under Domain settings or DNS. Choose a permanent redirect (301) if it asks, and leave masking off.",
        );
    });

    it("says what a provider that can point the bare domain may do instead", () => {
        expect(aliasNote("yourshop.in", "sites.example")).toBe(
            "If your provider offers an ALIAS, ANAME or flattened CNAME record, you can point yourshop.in at sites.example with it instead. Then add yourshop.in here as a domain too.",
        );
    });

    it("tells a bare domain connected as itself the way out", () => {
        expect(bareSelfNote("yourshop.in")).toBe(
            "yourshop.in has no www in front, and many providers don't allow a CNAME record there. Use an ALIAS, ANAME or flattened CNAME record with the same value if yours has one. If it has none, remove this domain and add www.yourshop.in.",
        );
    });
});
