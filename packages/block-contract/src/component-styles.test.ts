import { describe, expect, it } from "vitest";

import {
    CLASSIC_COMPONENTS,
    COMPONENT_KINDS,
    COMPONENT_LABELS,
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    componentStylesOf,
    componentStyleVariables,
    componentVariable,
    pickComponentStyles,
} from "./component-styles";
import { componentDefaults, LOOK_IDS, LOOKS } from "./looks";
import {
    defaultSiteStyle,
    presetSiteStyle,
    siteStyleVariables,
} from "./site-style";

describe("component styles (DEC-227)", () => {
    it("labels every component and option for the editor", () => {
        for (const kind of COMPONENT_KINDS) {
            expect(COMPONENT_LABELS[kind]).toBeTruthy();
            expect(Object.keys(COMPONENT_OPTION_LABELS[kind])).toEqual([
                ...COMPONENT_STYLE_OPTIONS[kind],
            ]);
        }
    });

    it("gives Classic and every look a listed default for every component (BRIEF Wave 2)", () => {
        expect(componentDefaults(undefined)).toBe(CLASSIC_COMPONENTS);
        for (const look of [undefined, ...LOOK_IDS]) {
            const d = componentDefaults(look);
            for (const kind of COMPONENT_KINDS) {
                expect(COMPONENT_STYLE_OPTIONS[kind]).toContain(d[kind]);
            }
        }
        expect(LOOKS.live.components).toMatchObject({
            buttons: "pill",
            cards: "raised",
            headings: "caps",
            spacing: "compact",
        });
        // "Soft" card corners are every look's own.
        for (const look of LOOK_IDS) {
            expect(LOOKS[look].components.cardCorners).toBe("soft");
        }
    });

    it("writes no variable, and no style key, for a site that chose nothing", () => {
        const style = defaultSiteStyle();
        expect(style).not.toHaveProperty("components");
        expect(componentStyleVariables(undefined)).toEqual({});
        expect(
            Object.keys(siteStyleVariables(style)).some((name) =>
                name.startsWith("--site-choice-"),
            ),
        ).toBe(false);
        for (const look of LOOK_IDS) {
            expect(presetSiteStyle({ look })).not.toHaveProperty("components");
        }
    });

    it("carries a choice by word, and reads back only listed words", () => {
        const vars = siteStyleVariables({
            ...defaultSiteStyle(),
            components: { buttons: "square", secondButton: "text" },
        });
        expect(vars[componentVariable("buttons")]).toBe("square");
        expect(vars["--site-choice-second-button"]).toBe("text");
        expect(componentStylesOf(vars)).toEqual({
            buttons: "square",
            secondButton: "text",
        });
        expect(
            componentStylesOf({ "--site-choice-buttons": "wobbly" }),
        ).toEqual({});
    });

    it("the forgiving read keeps listed choices and drops the rest", () => {
        expect(
            presetSiteStyle({
                components: { buttons: "wobbly", cards: "flat", colour: "red" },
            }).components,
        ).toEqual({ cards: "flat" });
        expect(pickComponentStyles({ buttons: "wobbly" })).toBeUndefined();
        expect(pickComponentStyles([])).toBeUndefined();
        expect(pickComponentStyles("square")).toBeUndefined();
    });

    it("keeps a choice equal to the look's default, across a look change (KD1)", () => {
        // Flat is Quiet's default; set under Classic, it is kept anyway.
        const classic = presetSiteStyle({ components: { cards: "flat" } });
        const quiet = presetSiteStyle({
            look: "quiet",
            components: classic.components,
        });
        const back = presetSiteStyle({ components: quiet.components });
        expect(quiet.components).toEqual({ cards: "flat" });
        expect(back.components).toEqual({ cards: "flat" });
    });
});
