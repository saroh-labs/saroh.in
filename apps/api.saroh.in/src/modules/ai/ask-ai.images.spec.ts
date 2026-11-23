/**
 * Images on a question (owner, 22 Nov): checked before the stream opens, so
 * a bad one is an HTTP error and nothing is asked or counted.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));

import { NotFoundException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AskAiService } from "./ask-ai.service";

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "u1",
    role: "OWNER",
};

function setup(askAiImages = jest.fn().mockResolvedValue([])) {
    const conversations = { assertOwn: jest.fn().mockResolvedValue(undefined) };
    const service = new AskAiService(
        {} as never,
        {} as never,
        {} as never,
        { setLanguage: jest.fn() } as never,
        conversations as never,
        { askAiImages } as never,
    );
    return { service, askAiImages };
}

describe("AskAiService.begin with images", () => {
    it("checks each image against the business once, and keeps them for the turn", async () => {
        const t = setup();
        const begun = await t.service.begin(ctx, {
            conversationId: "c1",
            question: "Alt text",
            images: ["a", "b", "a"],
        });
        expect(t.askAiImages).toHaveBeenCalledWith("org_1", ["a", "b"]);
        expect(begun.images).toEqual(["a", "b"]);
    });

    it("an image that isn't the business's, or isn't ready, stops the question", async () => {
        const t = setup(
            jest.fn().mockRejectedValue(new NotFoundException("no")),
        );
        await expect(
            t.service.begin(ctx, {
                conversationId: "c1",
                question: "Hi",
                images: ["theirs"],
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a question without images asks the media store nothing", async () => {
        const t = setup();
        const begun = await t.service.begin(ctx, {
            conversationId: "c1",
            question: "Hi",
        });
        expect(t.askAiImages).not.toHaveBeenCalled();
        expect(begun.images).toBeUndefined();
    });
});
