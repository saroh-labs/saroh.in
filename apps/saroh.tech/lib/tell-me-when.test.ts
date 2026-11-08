import { describe, expect, it } from "vitest";

import { emailLooksRight, sendTellMeWhen } from "./tell-me-when";

const answering =
    (status: number): typeof fetch =>
    () =>
        Promise.resolve(new Response("{}", { status }));

describe("Tell me when (KTD8)", () => {
    it("checks the address before sending", () => {
        expect(emailLooksRight(" asha@example.com ")).toBe(true);
        expect(emailLooksRight("asha@example")).toBe(false);
        expect(emailLooksRight("")).toBe(false);
    });

    it("posts a paid-plans join with Turnstile's token to the public waitlist", async () => {
        let url = "";
        let body: unknown;
        await sendTellMeWhen(
            "https://api.example.com",
            " asha@example.com ",
            "tok",
            (input, init) => {
                url = input as string;
                body = JSON.parse(init?.body as string);
                return Promise.resolve(new Response("{}"));
            },
        );
        expect(url).toBe("https://api.example.com/public/waitlist");
        expect(body).toEqual({
            email: "asha@example.com",
            source: "paid-plans",
            turnstileToken: "tok",
        });
    });

    it("reads the answer: sent, the email refused, the check failed, or down", async () => {
        const send = (status: number) =>
            sendTellMeWhen(
                "https://api.example.com",
                "a@example.com",
                null,
                answering(status),
            );
        expect(await send(200)).toBe("sent");
        expect(await send(400)).toBe("email");
        expect(await send(403)).toBe("check");
        expect(await send(429)).toBe("unavailable");
        expect(await send(500)).toBe("unavailable");
        expect(
            await sendTellMeWhen(
                "https://api.example.com",
                "a@example.com",
                null,
                () => Promise.reject(new Error("down")),
            ),
        ).toBe("unavailable");
    });
});
