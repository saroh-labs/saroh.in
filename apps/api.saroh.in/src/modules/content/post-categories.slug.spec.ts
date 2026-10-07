import { ConflictException } from "@nestjs/common";

import { slugTaken } from "./post-categories.service";

describe("a category name already in use (UX-066)", () => {
    it("names the category the merchant already has", () => {
        const err = slugTaken("Seasonal");
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toMatchObject({
            message: "You already have a category called “Seasonal”.",
            field: "slug",
        });
    });

    it("never says slug", () => {
        expect(JSON.stringify(slugTaken(null).getResponse())).not.toMatch(
            /slug is/i,
        );
    });
});
