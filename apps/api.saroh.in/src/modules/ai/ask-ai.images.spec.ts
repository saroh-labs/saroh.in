/**
 * Images on a question (owner, 22 Nov): checked before the stream opens, so
 * a bad one is an HTTP error and nothing is asked or counted.
 */
jest.mock("@saroh/database", () => ({
    prisma: { media: { findMany: jest.fn() } },
}));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { mediaStorages } from "../media/object-storage.provider";
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

describe("AskAiService.get with images (M2)", () => {
    it("never returns a public media address for a chat image, only a signed link", async () => {
        const getPublicUrl = jest.fn(() => "https://media.test/public");
        const storage = {
            getPublicUrl,
            createSignedDownloadUrl: jest.fn().mockResolvedValue({
                url: "https://acct.r2.cloudflarestorage.com/k?X-Amz-Signature=s",
            }),
        } as unknown as ObjectStorage;
        (prisma.media.findMany as jest.Mock).mockResolvedValue([
            {
                id: "m1",
                key: "org/org_1/ask-ai/m1.png",
                bucket: "MAIN",
                purpose: "ask-ai-sent",
                filename: "a.png",
            },
        ]);
        const service = new AskAiService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {
                get: jest.fn().mockResolvedValue({
                    id: "c1",
                    messages: [{ id: "x", role: "USER", images: ["m1"] }],
                }),
            } as never,
            new MediaService(mediaStorages(storage, null)),
        );
        const got = await service.get(ctx, "c1");
        const url = (got.messages[0] as { images: { url: string }[] }).images[0]
            .url;
        expect(url).toContain("X-Amz-Signature");
        expect(JSON.stringify(got)).not.toContain("media.test");
        expect(getPublicUrl).not.toHaveBeenCalled();
    });
});
