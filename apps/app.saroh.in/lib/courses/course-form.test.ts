import { describe, expect, it } from "vitest";

import type { CourseFormValues } from "./course-form";
import {
    courseGstDefaults,
    courseGstProblems,
    courseInput,
    courseSchema,
} from "./course-form";

/*
 * The course form's GST (12 Oct 2026): asked of a GST-registered business's
 * priced course, never of one that isn't registered, and sent as the API
 * takes it.
 */

const values = (over: Partial<CourseFormValues> = {}): CourseFormValues => ({
    serviceId: "svc_1",
    name: "Wheel throwing",
    description: "",
    price: "5000",
    currency: "INR",
    seats: "6",
    gstRate: "",
    sacCode: "",
    gstPriceMode: "",
    ...over,
});

describe("what the form holds", () => {
    it("starts a new course with no GST chosen", () => {
        expect(courseGstDefaults()).toEqual({
            gstRate: "",
            sacCode: "",
            gstPriceMode: "",
        });
        expect(courseGstDefaults(null)).toEqual({
            gstRate: "",
            sacCode: "",
            gstPriceMode: "",
        });
    });

    it("reads a saved course's GST into the fields", () => {
        expect(
            courseGstDefaults({
                gstRate: "18.00",
                sacCode: "999293",
                gstPriceMode: "ADDED",
            }),
        ).toEqual({ gstRate: "18", sacCode: "999293", gstPriceMode: "ADDED" });
        expect(
            courseGstDefaults({
                gstRate: "0",
                sacCode: null,
                gstPriceMode: null,
            }),
        ).toEqual({ gstRate: "0", sacCode: "", gstPriceMode: "" });
    });

    it("takes the fields in the schema, a rate or none", () => {
        expect(courseSchema.safeParse(values()).success).toBe(true);
        expect(
            courseSchema.safeParse(
                values({ gstRate: "18", gstPriceMode: "ADDED" }),
            ).success,
        ).toBe(true);
        expect(
            courseSchema.safeParse({ ...values(), gstPriceMode: "MAYBE" })
                .success,
        ).toBe(false);
    });
});

describe("what is asked", () => {
    it("asks a registered business's priced course for its rate", () => {
        expect(courseGstProblems(values(), true)).toEqual({
            gstRate: "Choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        });
    });

    it("takes 0% as an answer", () => {
        expect(courseGstProblems(values({ gstRate: "0" }), true)).toEqual({});
        expect(courseGstProblems(values({ gstRate: "18" }), true)).toEqual({});
    });

    it("doesn't ask a free course, or one whose price isn't a price yet", () => {
        expect(courseGstProblems(values({ price: "0" }), true)).toEqual({});
        expect(courseGstProblems(values({ price: "" }), true)).toEqual({});
        expect(courseGstProblems(values({ price: "lots" }), true)).toEqual({});
    });

    it("says a SAC code that isn't four to eight digits", () => {
        expect(
            courseGstProblems(values({ gstRate: "18", sacCode: "99" }), true),
        ).toEqual({ sacCode: "A SAC code is 4 to 8 digits." });
        expect(
            courseGstProblems(
                values({ gstRate: "18", sacCode: "9992 93" }),
                true,
            ),
        ).toEqual({});
    });

    it("never asks a business that isn't registered, and never blocks it", () => {
        expect(courseGstProblems(values(), false)).toEqual({});
        expect(courseGstProblems(values({ sacCode: "99" }), false)).toEqual({});
    });
});

describe("what a save sends", () => {
    it("sends the GST as the API takes it, from a business that was asked", () => {
        expect(
            courseInput(
                values({
                    gstRate: "18",
                    sacCode: " 9992 93 ",
                    gstPriceMode: "ADDED",
                }),
                { asked: true },
            ),
        ).toEqual({
            name: "Wheel throwing",
            description: null,
            price: "5000",
            currency: "INR",
            seats: 6,
            gstRate: "18",
            sacCode: "999293",
            gstPriceMode: "ADDED",
        });
    });

    it("sends null for not set, and for the same as the business", () => {
        expect(
            courseInput(values({ price: "0" }), { asked: true }),
        ).toMatchObject({ gstRate: null, sacCode: null, gstPriceMode: null });
        // Exempt is a rate of its own.
        expect(
            courseInput(values({ gstRate: "0" }), { asked: true }).gstRate,
        ).toBe("0");
    });

    it("sends none of it from a business that isn't registered", () => {
        const sent = courseInput(values({ gstRate: "18" }), { asked: false });
        expect(sent).toEqual({
            name: "Wheel throwing",
            description: null,
            price: "5000",
            currency: "INR",
            seats: 6,
        });
        expect("gstRate" in sent).toBe(false);
    });
});
