import { describe, expect, it } from "vitest";

import { pinClock } from "@/lib/format/test-clock";
import { domainPlanNote, PAUSED_BADGE, withDomainPlan } from "./domain-plan";
import { domainView } from "./domain-view";
import type { DomainPlanRead, SiteDomain } from "./service";

/**
 * What the plan means for a business's own domain, in the card's words
 * (DEC-139). The api decides the state; this only says it. Made-up domains.
 */
pinClock();

const ZONE = "Asia/Kolkata";
const STOPS = "2026-11-15T06:30:00.000Z"; // 15 Nov, noon in Kolkata

const plan = (
    state: string,
    over: Partial<DomainPlanRead> = {},
): DomainPlanRead => ({
    state,
    stopsAt: STOPS,
    sendsTo: "yourshop.saroh.app",
    ...over,
});

const live: Pick<SiteDomain, "hostname" | "status" | "hosting"> = {
    hostname: "www.yourshop.in",
    status: "VERIFIED",
    hosting: { state: "LIVE", problem: null, checkedAt: null, dnsRecord: null },
};

describe("the note on a domain's card", () => {
    it("says nothing while the plan includes the domain, or the api didn't say", () => {
        expect(domainPlanNote("live", undefined, ZONE)).toBeNull();
        expect(
            domainPlanNote("live", plan("included", { stopsAt: null }), ZONE),
        ).toBeNull();
        // A state this screen doesn't know says nothing rather than guess.
        expect(domainPlanNote("live", plan("later"), ZONE)).toBeNull();
    });

    it("names the day before the plan ends", () => {
        expect(domainPlanNote("live", plan("ending"), ZONE)).toBe(
            "Stops showing your site on 15 Nov, 3 days after your plan ends. After that, visitors are sent to yourshop.saroh.app. It stays connected, and shows your site again as soon as you're on a plan with your own domain.",
        );
    });

    it("keeps naming the day in the 3 days after the plan ended", () => {
        expect(domainPlanNote("live", plan("grace"), ZONE)).toBe(
            "Stops showing your site on 15 Nov: your plan no longer includes your own domain. After that, visitors are sent to yourshop.saroh.app. It stays connected, and shows your site again as soon as you're on a plan with your own domain.",
        );
    });

    it("says paused, and where visitors are sent", () => {
        expect(domainPlanNote("live", plan("paused"), ZONE)).toBe(
            "Paused: visitors are sent to yourshop.saroh.app. Your plan doesn't include your own domain. It stays connected, and shows your site again as soon as you're on a plan with your own domain.",
        );
        // On an instance that can't tell whether a domain serves, too.
        expect(domainPlanNote("verified-off", plan("paused"), ZONE)).toContain(
            "Paused: visitors are sent to yourshop.saroh.app.",
        );
    });

    it("says less when the api names no Saroh address", () => {
        expect(
            domainPlanNote("live", plan("paused", { sendsTo: null }), ZONE),
        ).toContain("visitors are sent to your Saroh web address.");
    });

    it("reads the day in the business's zone, with the year when it isn't this one", () => {
        expect(
            domainPlanNote(
                "live",
                plan("ending", { stopsAt: "2027-01-02T20:00:00.000Z" }),
                ZONE,
            ),
        ).toContain("Stops showing your site on 3 Jan 2027,");
    });

    it("never claims a domain that isn't serving will stop, or is paused", () => {
        for (const scene of ["waiting", "not-pointed", "problem"] as const) {
            // Nothing to stop: it shows no site yet.
            expect(domainPlanNote(scene, plan("ending"), ZONE)).toBeNull();
            for (const state of ["grace", "paused"]) {
                const note = domainPlanNote(scene, plan(state), ZONE);
                expect(note).toBe(
                    "Your plan doesn't include your own domain, so this one won't show your site until you're on a plan with one. You can still finish connecting it.",
                );
            }
        }
    });

    it("names no plan, price or limit: that is Plan and billing's to say", () => {
        for (const state of ["ending", "grace", "paused"]) {
            for (const scene of ["live", "waiting"] as const) {
                expect(
                    domainPlanNote(scene, plan(state), ZONE) ?? "",
                ).not.toMatch(/₹|\bFree\b|\bupgrade\b/i);
            }
        }
    });
});

describe("the card of a paused domain", () => {
    const view = domainView(live);

    it("reads Paused, not Live, and offers no Live link", () => {
        expect(view.badge.label).toBe("Live");
        const paused = withDomainPlan(view, live.hostname, plan("paused"));
        expect(paused.badge).toEqual(PAUSED_BADGE);
        expect(paused.liveUrl).toBeNull();
        // The records stay where they were: the connection is kept.
        expect(paused.showTxt).toBe(true);
        expect(paused.showCname).toBe(true);
        expect(paused.foldRecords).toBe(true);
    });

    it("says what removing it does now: nothing for visitors, and the connection is gone", () => {
        const paused = withDomainPlan(view, live.hostname, plan("paused"));
        expect(paused.removeWarning).toBe(
            "www.yourshop.in is paused, so removing it changes nothing for visitors today. It disconnects the domain: to use it again you would add it and its DNS records from the start. Your web address on Saroh keeps working.",
        );
    });

    it("is unchanged in every other state: the domain still shows the site", () => {
        for (const state of ["included", "ending", "grace", "later"]) {
            expect(withDomainPlan(view, live.hostname, plan(state))).toBe(view);
        }
        expect(withDomainPlan(view, live.hostname, undefined)).toBe(view);
    });

    it("leaves a domain that isn't serving as it was", () => {
        const waiting = domainView({ ...live, status: "PENDING" });
        expect(withDomainPlan(waiting, live.hostname, plan("paused"))).toBe(
            waiting,
        );
    });
});
