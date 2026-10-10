// What the QR routes accept at the boundary, through the real pipe options
// `main.ts` hands the global pipe: the lists are closed, text is trimmed and
// bounded, a colour is only ever #rrggbb, and nothing is coerced.
import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import {
    CreateQrCodeDto,
    QR_LABEL_MAX,
    QR_PLACE_NOTE_MAX,
    QrScanDto,
    UpdateQrCodeDto,
} from "./qr-codes.dto";

const pipe = new ValidationPipe(validationPipeOptions);

function parse<T>(metatype: new () => T, value: unknown): Promise<T> {
    return pipe.transform(value, { type: "body", metatype }) as Promise<T>;
}

async function refused(
    metatype: new () => unknown,
    value: unknown,
): Promise<void> {
    await expect(parse(metatype, value)).rejects.toBeInstanceOf(
        BadRequestException,
    );
}

const GOOD = { targetKind: "BOOK", place: "COUNTER" };

describe("CreateQrCodeDto", () => {
    it("takes a target and a place, and nothing else is needed", async () => {
        const dto = await parse(CreateQrCodeDto, GOOD);
        expect(dto).toMatchObject(GOOD);
        expect(dto.style).toBeUndefined();
        expect(dto.color).toBeUndefined();
    });

    it("trims text, lower-cases the colour, and reads an emptied line as none", async () => {
        const dto = await parse(CreateQrCodeDto, {
            ...GOOD,
            targetKind: "PRODUCT",
            targetRef: "  prod_1 ",
            label: "  Scan to book  ",
            placeNote: "   ",
            style: "BRANDED",
            color: " #0B5D3B ",
        });
        expect(dto).toMatchObject({
            targetRef: "prod_1",
            label: "Scan to book",
            placeNote: null,
            style: "BRANDED",
            color: "#0b5d3b",
        });
    });

    it("refuses anything outside its lists, and any field it doesn't know", async () => {
        for (const bad of [
            {},
            { place: "COUNTER" },
            { targetKind: "BOOK" },
            { ...GOOD, targetKind: "OFFER" },
            { ...GOOD, targetKind: "book" },
            { ...GOOD, place: "WINDOW" },
            { ...GOOD, style: "FANCY" },
            { ...GOOD, color: "#fff" },
            { ...GOOD, color: "0b5d3b" },
            { ...GOOD, color: "green" },
            { ...GOOD, color: 0 },
            { ...GOOD, label: "x".repeat(QR_LABEL_MAX + 1) },
            { ...GOOD, placeNote: "x".repeat(QR_PLACE_NOTE_MAX + 1) },
            { ...GOOD, targetRef: "x".repeat(65) },
            { ...GOOD, targetRef: 7 },
            // Never the caller's to choose.
            { ...GOOD, code: "h7c" },
            { ...GOOD, organizationId: "org_other" },
            { ...GOOD, retiredAt: null },
        ]) {
            await refused(CreateQrCodeDto, bad);
        }
    });
});

describe("UpdateQrCodeDto", () => {
    it("takes any one change on its own", async () => {
        for (const change of [
            {},
            { place: "MIRROR" },
            { label: null },
            { placeNote: "By the till" },
            { style: "PLAIN" },
            { color: "#1c1c1a" },
            { targetKind: "SITE" },
            { targetKind: "PAGE", targetRef: "page_1" },
        ]) {
            await expect(parse(UpdateQrCodeDto, change)).resolves.toBeDefined();
        }
    });

    it("moves the target as one thing: a reference needs its kind", async () => {
        await refused(UpdateQrCodeDto, { targetRef: "prod_1" });
        await refused(UpdateQrCodeDto, {
            targetKind: "OFFER",
            targetRef: "x",
        });
    });

    it("refuses the short id, and anything outside its lists", async () => {
        for (const bad of [
            { code: "h7c" },
            { place: "WINDOW" },
            { style: "FANCY" },
            { color: "#12345" },
            { retired: true },
        ]) {
            await refused(UpdateQrCodeDto, bad);
        }
    });
});

describe("QrScanDto", () => {
    it("takes the visitor's browser and whether only headers were asked for", async () => {
        await expect(parse(QrScanDto, {})).resolves.toBeDefined();
        await expect(
            parse(QrScanDto, { userAgent: "Mozilla/5.0", head: true }),
        ).resolves.toMatchObject({ userAgent: "Mozilla/5.0", head: true });
    });

    it("never reads a string as a boolean, and never takes who to count for", async () => {
        for (const bad of [
            { head: "false" },
            { head: "true" },
            { head: 1 },
            { userAgent: "x".repeat(513) },
            { userAgent: 7 },
            { organizationId: "org_other" },
            { count: 100 },
        ]) {
            await refused(QrScanDto, bad);
        }
    });
});
