import { describe, expect, it, vi } from "vitest";

const getJson = vi.fn(() => Promise.resolve(null));
vi.mock("./control-plane", () => ({ getJson }));

const { contactTopic, listContactMessages, topicLabel } =
    await import("./contact-messages");

describe("contactTopic", () => {
    it("shows every topic unless the address names one of the form's", () => {
        expect(contactTopic(undefined)).toBeUndefined();
        expect(contactTopic("bug")).toBe("bug");
        expect(contactTopic("other")).toBe("other");
        expect(contactTopic("BUG")).toBeUndefined();
        expect(contactTopic("toString")).toBeUndefined();
    });
});

describe("topicLabel", () => {
    it("names a topic, and shows one it doesn't know as stored", () => {
        expect(topicLabel("bug")).toBe("Something's not working");
        expect(topicLabel("sales")).toBe("sales");
    });
});

describe("listContactMessages", () => {
    it("asks the API for every topic by default", async () => {
        await listContactMessages({});
        expect(getJson).toHaveBeenCalledWith("/contact-messages");
    });

    it("asks for one topic and page", async () => {
        await listContactMessages({ topic: "help", cursor: "m 1" });
        expect(getJson).toHaveBeenLastCalledWith(
            "/contact-messages?topic=help&cursor=m+1",
        );
    });
});
