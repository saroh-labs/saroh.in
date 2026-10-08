import { describe, expect, it } from "vitest";

import type { DomainView } from "./domain-view";
import { checkLine, checkToast, domainScene, domainView } from "./domain-view";
import type { DomainHostingRead, SiteDomain } from "./service";

const ZONE = "Asia/Kolkata";
const AT = "2026-10-08T06:30:00.000Z"; // 8 Oct, noon in Kolkata

function domain(
    status: "PENDING" | "VERIFIED",
    hosting?: Partial<DomainHostingRead> | null,
    extra: Partial<SiteDomain> = {},
): SiteDomain {
    return {
        id: "d1",
        hostname: "www.northwind.in",
        status,
        siteId: "s1",
        verifiedAt: status === "VERIFIED" ? AT : null,
        lastCheckedAt: null,
        lastCheckResult: null,
        createdAt: AT,
        dnsRecord: {
            type: "TXT",
            name: "_saroh-verification.www.northwind.in",
            value: "saroh-site-verification=abc",
        },
        ...(hosting === null
            ? {}
            : {
                  hosting: {
                      state: "OFF",
                      problem: null,
                      checkedAt: null,
                      dnsRecord: null,
                      ...hosting,
                  },
              }),
        ...extra,
    };
}

const CNAME = {
    type: "CNAME" as const,
    name: "www.northwind.in",
    value: "sites.saroh.app",
};

/** What the records part of a view lists, for compact assertions. */
function records(v: DomainView) {
    return { txt: v.showTxt, cname: v.showCname, folded: v.foldRecords };
}

describe("domainScene (#861): the api's state → what the screen draws", () => {
    it("a domain not verified waits, whatever hosting says", () => {
        expect(domainScene(domain("PENDING", null))).toBe("waiting");
        expect(
            domainScene(domain("PENDING", { state: "WAITING_VERIFICATION" })),
        ).toBe("waiting");
        expect(domainScene(domain("PENDING", { state: "LIVE" }))).toBe(
            "waiting",
        );
    });

    it("verified with hosting off, or an api before #859, is verified-off", () => {
        expect(domainScene(domain("VERIFIED", { state: "OFF" }))).toBe(
            "verified-off",
        );
        expect(domainScene(domain("VERIFIED", null))).toBe("verified-off");
    });

    it("maps NOT_POINTED, LIVE and PROBLEM", () => {
        expect(domainScene(domain("VERIFIED", { state: "NOT_POINTED" }))).toBe(
            "not-pointed",
        );
        expect(domainScene(domain("VERIFIED", { state: "LIVE" }))).toBe("live");
        expect(domainScene(domain("VERIFIED", { state: "PROBLEM" }))).toBe(
            "problem",
        );
    });

    it("a state it doesn't know never reads as live", () => {
        expect(
            domainScene(domain("VERIFIED", { state: "SOMETHING_NEW" })),
        ).toBe("not-pointed");
        expect(domainScene(domain("VERIFIED", { state: "live" }))).toBe(
            "not-pointed",
        );
    });
});

describe("domainView (#861)", () => {
    it("waiting: both records to copy, as before, and Check now", () => {
        const v = domainView(
            domain("PENDING", {
                state: "WAITING_VERIFICATION",
                dnsRecord: CNAME,
            }),
        );
        expect(v.badge).toEqual({
            label: "Waiting for DNS",
            variant: "outline",
        });
        expect(records(v)).toEqual({ txt: true, cname: true, folded: false });
        expect(v.checkLabel).toBe("Check now");
        expect(v.liveUrl).toBeNull();
        expect(v.cname).toEqual({
            name: "www.northwind.in",
            value: "sites.saroh.app",
        });
        expect(v.removeWarning).toMatch(/^Nothing changes for visitors/);
    });

    it("not pointed: only the CNAME, and visitors don't reach the site yet", () => {
        const v = domainView(
            domain("VERIFIED", { state: "NOT_POINTED", dnsRecord: CNAME }),
        );
        expect(v.badge).toEqual({ label: "Not live yet", variant: "info" });
        expect(v.intro).toContain("Visitors don't reach your site yet.");
        expect(records(v)).toEqual({ txt: false, cname: true, folded: false });
        expect(v.checkLabel).toBe("Check again");
        expect(v.liveUrl).toBeNull();
        expect(v.removeWarning).toMatch(/^Nothing changes for visitors/);
    });

    it("live: Live at the domain, with a link, and the records folded", () => {
        const v = domainView(
            domain("VERIFIED", { state: "LIVE", dnsRecord: CNAME }),
        );
        expect(v.badge).toEqual({ label: "Live", variant: "success" });
        expect(v.liveUrl).toBe("https://www.northwind.in");
        expect(records(v)).toEqual({ txt: true, cname: true, folded: true });
        expect(v.checkLabel).toBeNull();
        expect(v.problem).toBeNull();
        expect(v.removeWarning).toMatch(/will stop reaching your site/);
    });

    it("live whose last look failed offers Check again", () => {
        const v = domainView(
            domain("VERIFIED", {
                state: "LIVE",
                problem: "We couldn't check.",
            }),
        );
        expect(v.checkLabel).toBe("Check again");
        expect(v.problem).toBeNull();
    });

    it("problem: the records again, with what is wrong in words", () => {
        const words =
            "The secure certificate for this domain couldn't be issued. Check the CNAME record points to Saroh, then check again.";
        const v = domainView(
            domain("VERIFIED", {
                state: "PROBLEM",
                problem: words,
                dnsRecord: CNAME,
            }),
        );
        expect(v.badge).toEqual({
            label: "Needs attention",
            variant: "warning",
        });
        expect(v.problem).toBe(words);
        expect(records(v)).toEqual({ txt: true, cname: true, folded: false });
        expect(v.checkLabel).toBe("Check again");
        expect(v.liveUrl).toBeNull();
    });

    it("problem without words still says something is wrong", () => {
        const v = domainView(domain("VERIFIED", { state: "PROBLEM" }));
        expect(v.problem).toMatch(/^Something is wrong/);
    });

    it("hosting off: today's verified screen, never Live", () => {
        const v = domainView(domain("VERIFIED", { state: "OFF" }), "saroh.app");
        expect(v.badge).toEqual({ label: "Verified", variant: "success" });
        expect(v.intro).toBe(
            "You own this domain. To send visitors to your site, add this record at your registrar:",
        );
        expect(records(v)).toEqual({ txt: false, cname: true, folded: false });
        expect(v.checkLabel).toBeNull();
        expect(v.liveUrl).toBeNull();
    });

    it("the CNAME is the api's when it names one, else the deployment's", () => {
        expect(
            domainView(
                domain("VERIFIED", { state: "NOT_POINTED", dnsRecord: CNAME }),
                "saroh.app",
            ).cname,
        ).toEqual({ name: "www.northwind.in", value: "sites.saroh.app" });
        expect(
            domainView(domain("VERIFIED", { state: "OFF" }), "custom.example")
                .cname,
        ).toEqual({ name: "www.northwind.in", value: "custom.example" });
        expect(domainView(domain("PENDING", null)).cname.value).toBe(
            "saroh.app",
        );
    });
});

describe("checkLine (#861)", () => {
    it("waiting: what the TXT check found, as before", () => {
        expect(checkLine(domain("PENDING", null), ZONE)).toBe(
            "Not checked yet. Add the record, then check.",
        );
        expect(
            checkLine(
                domain("PENDING", null, {
                    lastCheckedAt: AT,
                    lastCheckResult: "WRONG_VALUE",
                }),
                ZONE,
            ),
        ).toMatch(
            /^Checked 8 Oct: a record exists, but its value does not match/,
        );
    });

    it("not pointed: when hosting was last asked, and what it said", () => {
        expect(
            checkLine(domain("VERIFIED", { state: "NOT_POINTED" }), ZONE),
        ).toBe("Add the record, then check.");
        expect(
            checkLine(
                domain("VERIFIED", { state: "NOT_POINTED", checkedAt: AT }),
                ZONE,
            ),
        ).toMatch(/^Checked 8 Oct: not live yet\./);
        expect(
            checkLine(
                domain("VERIFIED", {
                    state: "NOT_POINTED",
                    checkedAt: AT,
                    problem: "We couldn't check this domain just now.",
                }),
                ZONE,
            ),
        ).toBe("Checked 8 Oct: We couldn't check this domain just now.");
    });

    it("live says nothing unless the last look failed", () => {
        expect(
            checkLine(
                domain("VERIFIED", { state: "LIVE", checkedAt: AT }),
                ZONE,
            ),
        ).toBeNull();
        expect(
            checkLine(
                domain("VERIFIED", {
                    state: "LIVE",
                    checkedAt: AT,
                    problem: "No answer.",
                }),
                ZONE,
            ),
        ).toBe("Checked 8 Oct: No answer.");
    });

    it("hosting off says nothing new", () => {
        expect(
            checkLine(domain("VERIFIED", { state: "OFF" }), ZONE),
        ).toBeNull();
    });
});

describe("checkToast (#861)", () => {
    const pending = domain("PENDING", null);

    it("a check that didn't pass is not verified yet", () => {
        const t = checkToast(
            pending,
            domain("PENDING", { state: "WAITING_VERIFICATION" }),
            ZONE,
        );
        expect(t.tone).toBe("info");
        expect(t.message).toBe("Not verified yet.");
    });

    it("just verified, not pointed: verified, now the CNAME", () => {
        const t = checkToast(
            pending,
            domain("VERIFIED", { state: "NOT_POINTED" }),
            ZONE,
        );
        expect(t).toEqual({
            tone: "success",
            message: "www.northwind.in is verified.",
            description:
                "Now add the CNAME record so visitors reach your site.",
        });
    });

    it("checked again, still not pointed: not live yet", () => {
        const t = checkToast(
            domain("VERIFIED", { state: "NOT_POINTED" }),
            domain("VERIFIED", { state: "NOT_POINTED", checkedAt: AT }),
            ZONE,
        );
        expect(t.tone).toBe("info");
        expect(t.message).toBe("Not live yet.");
    });

    it("live, problem and hosting off", () => {
        expect(
            checkToast(pending, domain("VERIFIED", { state: "LIVE" }), ZONE),
        ).toEqual({ tone: "success", message: "www.northwind.in is live." });
        expect(
            checkToast(
                pending,
                domain("VERIFIED", { state: "PROBLEM", problem: "Blocked." }),
                ZONE,
            ),
        ).toEqual({
            tone: "warning",
            message: "www.northwind.in needs attention.",
            description: "Blocked.",
        });
        expect(
            checkToast(pending, domain("VERIFIED", { state: "OFF" }), ZONE),
        ).toEqual({
            tone: "success",
            message: "www.northwind.in is verified.",
        });
    });
});
