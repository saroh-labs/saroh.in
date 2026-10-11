import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { validationPipeOptions } from "../../common/validation";
import {
    StockChecksQueryDto,
    StockLevelsQueryDto,
    StockLogQueryDto,
} from "./dto";
import { stockWindow } from "./stock-paging";

describe("stockWindow", () => {
    it("reads a page by its number, at the size asked", () => {
        expect(stockWindow({ page: 2, size: 10 })).toEqual({
            take: 10,
            skip: 10,
        });
        expect(stockWindow({ page: 1, size: 25 })).toEqual({
            take: 25,
            skip: 0,
        });
        expect(stockWindow({ size: 100 })).toEqual({ take: 100, skip: 0 });
    });

    it("gives a page with no size 50 rows", () => {
        expect(stockWindow({ page: 3 })).toEqual({ take: 50, skip: 100 });
    });

    it("still reads by limit, and a size wins over it", () => {
        expect(stockWindow({ limit: 2 })).toEqual({ take: 2, skip: 0 });
        expect(stockWindow({ limit: 2, cursor: "c1" })).toEqual({
            take: 2,
            skip: 0,
        });
        expect(stockWindow({ limit: 2, size: 10 })).toEqual({
            take: 10,
            skip: 0,
        });
    });

    it("answers what the list sent before when nothing is asked", () => {
        expect(stockWindow({})).toEqual({ take: undefined, skip: 0 });
        expect(stockWindow({}, 50)).toEqual({ take: 50, skip: 0 });
    });

    it("refuses a cursor and a page number together", () => {
        expect(() => stockWindow({ cursor: "c1", page: 2 })).toThrow(
            BadRequestException,
        );
        expect(() => stockWindow({ cursor: "c1", page: 2 })).toThrow(
            "Page by a cursor or a page number, not both.",
        );
    });
});

describe("the stock lists' page and size", () => {
    const queries = [
        ["levels", StockLevelsQueryDto],
        ["log", StockLogQueryDto],
        ["checks", StockChecksQueryDto],
    ] as const;

    /** A query string as the pipe reads it: the DTO, and what it refused. */
    function read(Dto: (typeof queries)[number][1], raw: object) {
        const dto = plainToInstance(Dto, raw);
        return { dto, errors: validateSync(dto, validationPipeOptions) };
    }

    it.each(queries)("%s reads them from text", (_name, Dto) => {
        const { dto, errors } = read(Dto, { page: "2", size: "25" });
        expect(errors).toEqual([]);
        expect(dto.page).toBe(2);
        expect(dto.size).toBe(25);
    });

    it.each(queries)("%s takes neither, as before", (_name, Dto) => {
        const { dto, errors } = read(Dto, {});
        expect(errors).toEqual([]);
        expect(dto.page).toBeUndefined();
        expect(dto.size).toBeUndefined();
    });

    it.each(queries)("%s refuses a size it doesn't offer", (_name, Dto) => {
        for (const size of ["20", "0", "1000", "ten"]) {
            expect(read(Dto, { size }).errors.map((e) => e.property)).toEqual([
                "size",
            ]);
        }
    });

    it.each(queries)("%s refuses a page that isn't one", (_name, Dto) => {
        for (const page of ["0", "-1", "1.5", "two"]) {
            expect(read(Dto, { page }).errors.map((e) => e.property)).toEqual([
                "page",
            ]);
        }
    });
});
