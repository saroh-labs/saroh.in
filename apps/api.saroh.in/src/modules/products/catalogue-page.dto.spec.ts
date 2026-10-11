// The read's own file reaches the database; this spec only reads its DTO.
jest.mock("@saroh/database", () => ({ prisma: {}, Prisma: {} }));

import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { CatalogueQueryDto, wantsPage } from "./catalogue-page";

/**
 * The Products list's query, without a database: a page by its number and
 * the sizes a list offers. The read itself runs in
 * `catalogue-page.db.spec.ts`.
 */
describe("the catalogue page's query", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const read = (value: Record<string, string>) =>
        pipe.transform(value, {
            type: "query",
            metatype: CatalogueQueryDto,
        }) as Promise<CatalogueQueryDto>;

    it("reads a page and a size off the address as numbers", async () => {
        const query = await read({ page: "3", size: "25" });
        expect(query.page).toBe(3);
        expect(query.size).toBe(25);
    });

    it("offers 10, 25, 50 and 100 rows a page, and no other size", async () => {
        for (const size of ["10", "25", "50", "100"]) {
            expect((await read({ size })).size).toBe(Number(size));
        }
        for (const size of ["0", "20", "200", "many"]) {
            await expect(read({ size })).rejects.toThrow(BadRequestException);
        }
    });

    it("refuses a page that is not a whole number from 1", async () => {
        for (const page of ["0", "-1", "1.5", "two"]) {
            await expect(read({ page })).rejects.toThrow(BadRequestException);
        }
    });

    it("is a page once it names a limit, a page or a size", () => {
        expect(wantsPage({})).toBe(false);
        expect(wantsPage({ status: "DRAFT", q: "rye" })).toBe(false);
        expect(wantsPage({ limit: 20 })).toBe(true);
        expect(wantsPage({ page: 2 })).toBe(true);
        expect(wantsPage({ size: 25 })).toBe(true);
    });
});
