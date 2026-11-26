import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import {
    STORE_PAGE_SIZE,
    StoreListQueryDto,
    storePageOf,
} from "./store-list-query";

const errorsOf = (query: Record<string, string>) =>
    validateSync(plainToInstance(StoreListQueryDto, query));

describe("a store list's page", () => {
    it("defaults to the first page of the house size", () => {
        expect(storePageOf()).toEqual({
            page: 1,
            pageSize: STORE_PAGE_SIZE,
            skip: 0,
            take: STORE_PAGE_SIZE,
        });
    });

    it("skips to the page asked for", () => {
        expect(storePageOf({ page: 3, size: 25 })).toMatchObject({
            skip: 50,
            take: 25,
        });
    });

    it("refuses a size past the largest offered, so no one reads the whole store", () => {
        expect(errorsOf({ size: "100" })).toEqual([]);
        expect(errorsOf({ size: "101" })).not.toEqual([]);
        expect(errorsOf({ size: "100000" })).not.toEqual([]);
        expect(errorsOf({ page: "0" })).not.toEqual([]);
    });
});
