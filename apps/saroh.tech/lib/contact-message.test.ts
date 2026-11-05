import { describe, expect, it } from "vitest";

import { contactProblems, firstName, sendContact } from "./contact-message";

const good = {
    name: "Asha Rao",
    email: "asha@example.com",
    message: "Hello there",
};
const body = { topic: "question" as const, ...good };
const answering =
    (status: number): typeof fetch =>
    () =>
        Promise.resolve(new Response("{}", { status }));

describe("a contact message", () => {
    it("names every field at fault, in the form's order", () => {
        expect(contactProblems(good)).toEqual([]);
        expect(
            contactProblems({ name: " ", email: "a@b", message: "hi" }),
        ).toEqual(["name", "email", "message"]);
    });

    it("greets by first name", () => {
        expect(firstName(" Asha Rao ")).toBe("Asha");
        expect(firstName("")).toBe("there");
    });

    it("posts to the public route, and reads its answer", async () => {
        let url = "";
        await sendContact("https://api.example.com", body, (input) => {
            url = input as string;
            return Promise.resolve(new Response("{}"));
        });
        expect(url).toBe("https://api.example.com/public/contact-messages");
        const send = (status: number) =>
            sendContact("https://api.example.com", body, answering(status));
        expect(await send(200)).toBe("sent");
        expect(await send(400)).toBe("email");
        expect(await send(429)).toBe("rate-limited");
        expect(await send(500)).toBe("unavailable");
        expect(
            await sendContact("https://api.example.com", body, () =>
                Promise.reject(new Error("down")),
            ),
        ).toBe("unavailable");
    });
});
