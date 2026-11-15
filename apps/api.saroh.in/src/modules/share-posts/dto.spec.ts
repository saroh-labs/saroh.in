// What Create post's own posts accept at the boundary (#1378), through the
// real pipe options: the merchant's words within their caps, the card's
// lists closed, and a link that is a path on the business's own site.
import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { CAPTION_MAX, HEADLINE_MAX, SharePostInputDto } from "./dto";

const pipe = new ValidationPipe(validationPipeOptions);
const parse = (value: unknown) =>
    pipe.transform(value, {
        type: "body",
        metatype: SharePostInputDto,
    }) as Promise<SharePostInputDto>;
const refused = (value: unknown) =>
    expect(parse(value)).rejects.toBeInstanceOf(BadRequestException);

describe("SharePostInputDto", () => {
    it("takes a headline, a photo, a card and a link, trimmed", async () => {
        expect(
            await parse({
                headline: "  दिवाली पर बंद ",
                mediaId: "m_1",
                style: "simple",
                size: "story",
                caption: " Closed for Diwali ",
                linkPath: "/book?service=haircut",
            }),
        ).toMatchObject({
            headline: "दिवाली पर बंद",
            caption: "Closed for Diwali",
            linkPath: "/book?service=haircut",
        });
        expect((await parse({ headline: "  " })).headline).toBeNull();
    });

    it("refuses a headline or caption over its cap", async () => {
        await refused({ headline: "x".repeat(HEADLINE_MAX + 1) });
        expect(
            (await parse({ headline: "x".repeat(HEADLINE_MAX) })).headline,
        ).toHaveLength(HEADLINE_MAX);
        await refused({ caption: "x".repeat(CAPTION_MAX + 1) });
    });

    it("refuses a link to another host, a scheme or anything that isn't a path", async () => {
        for (const linkPath of [
            "https://evil.test/",
            "//evil.test/x",
            "evil.test",
            "javascript:alert(1)",
            "/\\evil.test",
            "/two words",
        ]) {
            await refused({ linkPath });
        }
        expect((await parse({ linkPath: "/" })).linkPath).toBe("/");
    });

    it("keeps the card's lists closed, and nothing extra", async () => {
        await refused({ style: "poster" });
        await refused({ size: "banner" });
        await refused({ organizationId: "org_other" });
    });
});
