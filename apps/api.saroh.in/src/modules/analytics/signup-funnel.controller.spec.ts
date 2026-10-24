// A sign-up page view (DEC-187, amended 24 Oct): one anonymous count, with
// only shape-checked source keys, never a code; always 204. PostHog is a
// fake transport. No database, no network.
jest.mock("posthog-node", () => ({ PostHog: class {} }));
jest.mock("@saroh/database", () => ({
    prisma: {},
    outsideOrgContext: jest.fn(),
    runInOrgContext: jest.fn(),
}));

import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";

import type { TelemetryTransport } from "../../common/observability/posthog";
import { setTelemetry } from "../../common/observability/posthog";
import {
    SIGNUP_VIEWS_PER_MINUTE,
    SignupFunnelController,
} from "./signup-funnel.controller";

const PHONE =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

function build() {
    const transport = {
        capture: jest.fn(),
        captureException: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
    } satisfies TelemetryTransport;
    setTelemetry({ transport, environment: "production" });
    return { transport, controller: new SignupFunnelController() };
}

type Capture = {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
};
const sent = (transport: { capture: jest.Mock }) =>
    transport.capture.mock.calls.map(([c]) => c as Capture);

describe("POST public/funnel/signup-viewed", () => {
    afterEach(() => setTelemetry(null));

    it("answers 204", () => {
        expect(
            Reflect.getMetadata(
                HTTP_CODE_METADATA,
                SignupFunnelController.prototype.signupViewed,
            ),
        ).toBe(HttpStatus.NO_CONTENT);
    });

    it("sends one signup_page_viewed with the source, plan and channel, under a fresh id", () => {
        const { transport, controller } = build();
        const body = {
            src: "pricing",
            utm_source: "google",
            utm_medium: "cpc",
            utm_campaign: "launch",
            plan: "grow",
            cycle: "year",
            referral_channel: "business",
        };
        controller.signupViewed(body, "203.0.113.7", { "user-agent": PHONE });
        controller.signupViewed(body, "203.0.113.7", { "user-agent": PHONE });

        const [one, two] = sent(transport);
        expect(one?.event).toBe("signup_page_viewed");
        expect(one?.properties).toEqual({
            ...body,
            app: "api",
            environment: "production",
            $process_person_profile: false,
        });
        // No person: every view is its own id.
        expect(one?.distinctId).not.toBe(two?.distinctId);
    });

    it("never sends a code, a cookie or anything else from the body", () => {
        const { transport, controller } = build();
        controller.signupViewed(
            {
                referral_channel: "both",
                referrer_code: "ab2cd3ef",
                manager_code: "AB2CD3EF",
                saroh_ref: "ab2cd3ef",
                email: "a@example.com",
            },
            "203.0.113.7",
            { "user-agent": PHONE },
        );
        expect(sent(transport)[0]?.properties).toEqual({
            referral_channel: "both",
            app: "api",
            environment: "production",
            $process_person_profile: false,
        });
    });

    it("drops values of any other shape", () => {
        const { transport, controller } = build();
        controller.signupViewed(
            {
                src: "<b>hi</b>",
                utm_source: "google",
                plan: "Grow Plan!",
                cycle: "week",
                referral_channel: "everyone",
            },
            "203.0.113.7",
            { "user-agent": PHONE },
        );
        expect(sent(transport)[0]?.properties).toEqual({
            utm_source: "google",
            referral_channel: "none",
            app: "api",
            environment: "production",
            $process_person_profile: false,
        });
        for (const body of [null, "x", [1], 42]) {
            controller.signupViewed(body, "203.0.113.7", {
                "user-agent": PHONE,
            });
        }
        expect(sent(transport)).toHaveLength(5);
    });

    it("skips a bot, a missing browser name and a prefetch", () => {
        const { transport, controller } = build();
        for (const agent of [
            "Googlebot/2.1 (+http://www.google.com/bot.html)",
            "curl/8.4.0",
            "HeadlessChrome/120",
            undefined,
        ]) {
            controller.signupViewed({}, "203.0.113.7", {
                "user-agent": agent,
            });
        }
        controller.signupViewed({}, "203.0.113.7", {
            "user-agent": PHONE,
            "sec-purpose": "prefetch;prerender",
        });
        controller.signupViewed({}, "203.0.113.7", {
            "user-agent": PHONE,
            purpose: "prefetch",
        });
        expect(transport.capture).not.toHaveBeenCalled();
    });

    it("stops counting one caller past the limit, still without an error", () => {
        const { transport, controller } = build();
        for (let i = 0; i < SIGNUP_VIEWS_PER_MINUTE + 5; i++) {
            controller.signupViewed({}, "203.0.113.7", { "user-agent": PHONE });
        }
        expect(transport.capture).toHaveBeenCalledTimes(
            SIGNUP_VIEWS_PER_MINUTE,
        );
    });

    it("sends nothing with PostHog off", () => {
        const { transport, controller } = build();
        setTelemetry(null);
        controller.signupViewed({ src: "pricing" }, "203.0.113.7", {
            "user-agent": PHONE,
        });
        expect(transport.capture).not.toHaveBeenCalled();
    });

    it("never throws when the send fails", () => {
        const { transport, controller } = build();
        transport.capture.mockImplementation(() => {
            throw new Error("down");
        });
        expect(() =>
            controller.signupViewed({}, "203.0.113.7", { "user-agent": PHONE }),
        ).not.toThrow();
    });
});
