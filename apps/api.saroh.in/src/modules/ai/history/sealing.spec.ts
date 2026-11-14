import { randomBytes } from "node:crypto";

import { ServiceUnavailableException } from "@nestjs/common";

import { env } from "../../../env";
import {
    AiSealMismatchError,
    openAiText,
    openMessageBody,
    sealAiText,
    sealMessageBody,
} from "./sealing";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const before = mutableEnv.AI_TEXT_ENC_KEY;
// A throwaway key for this run only, never a value in the repo.
beforeEach(() => {
    mutableEnv.AI_TEXT_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = before;
});

const here = { organizationId: "org_a", conversationId: "conv_x", rowId: "m1" };

describe("Ask AI text sealing", () => {
    it("round-trips a message body, card and all", () => {
        const content = {
            text: "Kal kitne bookings hain?",
            card: { kind: "booking", fields: { name: "Asha" } },
        };
        const sealed = sealMessageBody(content, here);
        expect(sealed.ciphertext).not.toContain("Asha");
        expect(openMessageBody(sealed, here)).toEqual(content);
    });

    it("refuses ciphertext moved to another business, conversation, row or field", () => {
        const sealed = sealAiText("secret words", { ...here, field: "body" });
        for (const elsewhere of [
            { ...here, organizationId: "org_b" },
            { ...here, conversationId: "conv_y" },
            { ...here, organizationId: "org_b", conversationId: "conv_y" },
            { ...here, rowId: "m2" },
        ]) {
            expect(() =>
                openAiText(sealed, { ...elsewhere, field: "body" }),
            ).toThrow(AiSealMismatchError);
        }
        expect(() => openAiText(sealed, { ...here, field: "title" })).toThrow(
            AiSealMismatchError,
        );
        expect(openAiText(sealed, { ...here, field: "body" })).toBe(
            "secret words",
        );
    });

    it("refuses a tampered ciphertext", () => {
        const sealed = sealAiText("x", { ...here, field: "body" });
        const tag = Buffer.from(sealed.authTag, "base64");
        tag[0] ^= 1;
        expect(() =>
            openAiText(
                { ...sealed, authTag: tag.toString("base64") },
                { ...here, field: "body" },
            ),
        ).toThrow();
    });

    it("refuses with a 503 naming the key when it is missing, at use", () => {
        mutableEnv.AI_TEXT_ENC_KEY = undefined;
        const seal = () => sealAiText("x", { ...here, field: "body" });
        expect(seal).toThrow(ServiceUnavailableException);
        expect(seal).toThrow(/AI_TEXT_ENC_KEY/);
    });

    it("opens text sealed under an older key on the ring", () => {
        const old = randomBytes(32).toString("base64");
        mutableEnv.AI_TEXT_ENC_KEY = old;
        const sealed = sealAiText("kept", { ...here, field: "title" });
        mutableEnv.AI_TEXT_ENC_KEY = `v2:${randomBytes(32).toString("base64")},v1:${old}`;
        expect(openAiText(sealed, { ...here, field: "title" })).toBe("kept");
    });
});
