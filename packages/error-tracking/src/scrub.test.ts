import { describe, expect, it } from "vitest";

import {
    MAX_MESSAGE_LENGTH,
    MAX_STACK_LINES,
    routeTemplate,
    scrubContext,
    scrubError,
    scrubMessage,
    scrubStack,
    scrubText,
} from "./scrub";

describe("scrubText", () => {
    it("masks email addresses, plain and URL-encoded", () => {
        expect(scrubText("No user asha.rao+shop@example.com found")).toBe(
            "No user [email] found",
        );
        expect(scrubText("to=asha%40example.com")).not.toContain("asha");
    });

    it("masks phone numbers and other long numbers, not short ones", () => {
        expect(scrubText("SMS to +91 98765 43210 failed")).toBe(
            "SMS to [number] failed",
        );
        expect(scrubText("card 4111-1111-1111-1111")).toBe("card [number]");
        expect(scrubText("took 1500 ms, 3 retries")).toBe(
            "took 1500 ms, 3 retries",
        );
    });

    it("keeps a stack frame's line and column", () => {
        const frame = "    at save (/app/dist/orders.service.js:1234:56)";
        expect(scrubText(frame)).toBe(frame);
    });

    it("masks bearer and basic credentials", () => {
        expect(scrubText("got Bearer abc.def-123_xyz back")).toBe(
            "got Bearer [token] back",
        );
        expect(scrubText("Basic dXNlcjpwYXNz")).toBe("Basic [token]");
    });

    it("masks Authorization, Cookie and API-key header lines whole", () => {
        const text = [
            "request failed",
            "Authorization: Token abc123",
            "cookie: saroh.session_token=s3cr3t; theme=dark",
            "Set-Cookie: a=b",
            "x-api-key: live_key",
            "accept: text/html",
        ].join("\n");
        const out = scrubText(text);
        expect(out).toContain("Authorization: [secret]");
        expect(out).toContain("cookie: [secret]");
        expect(out).toContain("Set-Cookie: [secret]");
        expect(out).toContain("x-api-key: [secret]");
        expect(out).toContain("accept: text/html");
        expect(out).not.toMatch(/abc123|s3cr3t|theme=dark|live_key/u);
    });

    it("drops query strings and fragments from URLs and paths", () => {
        expect(
            scrubText(
                "GET https://api.saroh.in/orders?token=abc&email=a@b.co failed",
            ),
        ).toBe("GET https://api.saroh.in/orders failed");
        expect(scrubText("at /reset#code=991")).toBe("at /reset");
    });

    it("masks values written beside a sensitive name", () => {
        expect(scrubText("password=hunter2 rejected")).toBe(
            "password=[secret] rejected",
        );
        expect(scrubText('{"apiKey": "k-1", "plan": "pro"}')).toBe(
            '{"apiKey": [secret], "plan": "pro"}',
        );
        expect(scrubText("client_secret: abc")).toBe("client_secret: [secret]");
    });

    it("masks JWTs and keys with a provider's prefix", () => {
        // Made-up values, assembled here so no scanner reads them as real.
        const jwt =
            ["eyJ", "hbGciOiJub25lIn0"].join("") + ".eyJzdWIiOiJ4In0.c2ln";
        expect(scrubText(`jwt ${jwt} bad`)).toBe("jwt [token] bad");
        const providerKey = ["rzp", "live", "Ab12Cd34Ef56Gh"].join("_");
        expect(scrubText(`key ${providerKey} used`)).toBe("key [secret] used");
        expect(scrubText(["phc", "Ab12Cd34Ef56Gh78Ij90"].join("_"))).toBe(
            "[secret]",
        );
    });

    it("masks long mixed tokens but leaves long plain words and ids", () => {
        expect(
            scrubText("hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822c"),
        ).toBe("hash [secret]");
        const name = "OrganizationOnboardingServiceRetentionHandler";
        expect(scrubText(name)).toBe(name);
        // A cuid (25 characters) is an internal id: support needs it.
        expect(scrubText("org cmf3k2x9w0001abcd1234efgh")).toBe(
            "org cmf3k2x9w0001abcd1234efgh",
        );
    });
});

describe("scrubMessage / scrubStack", () => {
    it("caps a message", () => {
        expect(scrubMessage("x".repeat(2_000))).toHaveLength(
            MAX_MESSAGE_LENGTH,
        );
    });

    it("caps a stack's lines and scrubs each", () => {
        const stack = [
            "Error: no user a@b.co",
            ...Array.from(
                { length: 200 },
                (_, i) => `    at f${i} (/x.js:1:1)`,
            ),
        ].join("\n");
        const out = scrubStack(stack);
        expect(out.split("\n")).toHaveLength(MAX_STACK_LINES);
        expect(out).toContain("[email]");
    });
});

describe("scrubError", () => {
    it("reads an error by shape and scrubs name, message and stack", () => {
        const error = new TypeError("bad email asha@example.com");
        const out = scrubError(error);
        expect(out.name).toBe("TypeError");
        expect(out.message).toBe("bad email [email]");
        expect(out.stack).not.toContain("asha@example.com");
    });

    it("never stringifies a thrown object: it may be a body", () => {
        const out = scrubError({ email: "asha@example.com", card: "4111" });
        expect(out).toEqual({
            name: "Error",
            message: "A non-Error value was thrown",
        });
    });

    it("keeps a thrown string, scrubbed", () => {
        expect(scrubError("call +91 98765 43210").message).toBe(
            "call [number]",
        );
    });
});

describe("routeTemplate", () => {
    it("replaces record ids and drops origin, query and fragment", () => {
        expect(
            routeTemplate(
                "https://app.saroh.in/commerce/orders/cmf3k2x9w0001abcd1234efgh/edit?tab=1#x",
            ),
        ).toBe("/commerce/orders/:id/edit");
        expect(routeTemplate("/customers/42")).toBe("/customers/:id");
        expect(routeTemplate("/x/3f2b8c1e-9d4a-4c1b-8e2f-0a1b2c3d4e5f")).toBe(
            "/x/:id",
        );
        expect(routeTemplate("/invoices/INV-2026-0042/pdf")).toBe(
            "/invoices/:id/pdf",
        );
    });

    it("never lets an email or a long token through as a segment", () => {
        expect(routeTemplate("/invite/asha@example.com")).toBe("/invite/:id");
        expect(routeTemplate("/invite/asha%40example.com")).toBe("/invite/:id");
        expect(routeTemplate(`/preview/${"a".repeat(64)}`)).toBe(
            "/preview/:id",
        );
    });

    it("keeps a screen's own words", () => {
        expect(routeTemplate("/settings/modules")).toBe("/settings/modules");
        expect(routeTemplate("")).toBe("/");
    });
});

describe("scrubContext", () => {
    it("keeps ids and drops anything that could be a body, header or person", () => {
        expect(
            scrubContext({
                correlation_id: "req-1",
                organization_id: "org_1",
                job_type: "enquiry.notify",
                status_code: 500,
                handled: false,
                body: { card: "4111" },
                requestBody: "x",
                headers: { cookie: "a=b" },
                cookie: "a=b",
                authorization: "Bearer x",
                query: "?a=b",
                email: "asha@example.com",
                phone: "+91 98765 43210",
                customerName: "Asha",
                amount: 4500,
                ip: "203.0.113.9",
                nested: { a: 1 },
                missing: undefined,
            }),
        ).toEqual({
            correlation_id: "req-1",
            organization_id: "org_1",
            job_type: "enquiry.notify",
            status_code: 500,
            handled: false,
        });
    });

    it("scrubs the strings it keeps", () => {
        expect(scrubContext({ route: "/x?email=a@b.co" })).toEqual({
            route: "/x",
        });
    });
});
