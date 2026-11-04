// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ShotView } from "../media/shot";
import { ComingList } from "./coming-list";
import { CtaBand } from "./cta-band";
import { FeatureSteps } from "./feature-steps";
import { HomeHero } from "./home-hero";
import { ProductHero } from "./product-hero";
import { SolutionChanges } from "./solution-changes";

afterEach(cleanup);

const SHOT: ShotView = {
    id: "a-shot",
    image: { src: "/a.webp", alt: "A shot", width: 1600, height: 1000 },
};

const HERO = {
    section: { name: "Features", href: "/#features" },
    name: "Orders",
    headline: "A headline",
    sub: "A sub",
    freeLine: "A free line",
};

const frames = (c: HTMLElement) => c.querySelectorAll("[data-shot]");

describe("ProductHero", () => {
    it("draws the given words, links and shot", () => {
        const { container } = render(
            <ProductHero
                {...HERO}
                actions={<a href="/start">Begin</a>}
                shot={SHOT}
                note="A note"
            />,
        );
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
            "A headline",
        );
        expect(
            screen.getByRole("link", { name: "Begin" }).getAttribute("href"),
        ).toBe("/start");
        expect(
            screen.getByRole("link", { name: "Features" }).getAttribute("href"),
        ).toBe("/#features");
        expect(frames(container)).toHaveLength(1);
        expect(screen.getByText("A note")).toBeTruthy();
    });

    it("no shot: no empty frame and no note", () => {
        const { container } = render(<ProductHero {...HERO} note="A note" />);
        expect(frames(container)).toHaveLength(0);
        expect(screen.queryByText("A note")).toBeNull();
    });
});

describe("HomeHero", () => {
    const props = {
        eyebrow: "An eyebrow",
        headlineLabel: "Orders. Handled.",
        headline: [{ initial: "O", rest: "rders." }],
        sub: "A sub",
        freeLine: "A free line",
        chips: ["One"],
    };

    it("reads the headline whole, and draws no frame without a shot", () => {
        const { container } = render(<HomeHero {...props} />);
        expect(
            screen.getByRole("heading", { name: "Orders. Handled." }),
        ).toBeTruthy();
        expect(frames(container)).toHaveLength(0);
    });
});

describe("CtaBand", () => {
    it("draws the site's buttons and the note", () => {
        render(
            <CtaBand
                title="T"
                body="B"
                actions={<a href="/start">Begin</a>}
                note="No card"
            />,
        );
        expect(screen.getByRole("link", { name: "Begin" })).toBeTruthy();
        expect(screen.getByText("No card")).toBeTruthy();
    });

    it("no CTA and no note: no link, and no empty column", () => {
        const { container } = render(<CtaBand title="T" body="B" />);
        expect(screen.queryByRole("link")).toBeNull();
        const band = container.querySelector(".rounded-mk-band");
        expect(band?.children).toHaveLength(1);
    });

    it("a null note is no line", () => {
        render(<CtaBand title="T" body="B" actions={<i>x</i>} note={null} />);
        expect(document.querySelector("span")).toBeNull();
    });
});

describe("FeatureSteps", () => {
    const step = { title: "S", body: "B", who: "Rye" };

    it("a step without a shot is its words, with no frame", () => {
        const { container } = render(
            <FeatureSteps
                title="How"
                steps={[step, { ...step, title: "S2", shot: SHOT }]}
            />,
        );
        expect(frames(container)).toHaveLength(1);
    });

    it("no shots: two columns of words, and no business named", () => {
        const { container } = render(
            <FeatureSteps
                title="How"
                steps={[{ title: "S", body: "B" }, step]}
            />,
        );
        expect(container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
        expect(screen.getAllByText("Rye")).toHaveLength(1);
    });

    it("draws no help row with no links", () => {
        render(<FeatureSteps title="How" steps={[step]} />);
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("SolutionChanges", () => {
    const seg = { label: "L", pain: "P", title: "T", body: "B" };

    it("no shots: two columns of words", () => {
        const { container } = render(
            <SolutionChanges title="C" segments={[seg]} />,
        );
        expect(container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
        expect(frames(container)).toHaveLength(0);
    });

    it("a shot: a row beside it; the link only where one is given", () => {
        const { container } = render(
            <SolutionChanges
                title="C"
                segments={[
                    { ...seg, shot: SHOT, see: { href: "/f", label: "See F" } },
                    { ...seg, title: "T2" },
                ]}
            />,
        );
        expect(container.querySelector(".md\\:grid-cols-2")).toBeNull();
        expect(screen.getAllByRole("link")).toHaveLength(1);
    });
});

describe("ComingList", () => {
    it("labels a group's first row and never links a row", () => {
        render(
            <ComingList
                idPrefix="p"
                mark="Later"
                groups={[
                    {
                        key: "next",
                        label: "Next",
                        rows: [
                            { name: "A", line: "a" },
                            { name: "B", line: "b" },
                        ],
                    },
                ]}
            />,
        );
        expect(screen.getAllByRole("heading")).toHaveLength(1);
        expect(screen.getAllByText("Later")).toHaveLength(2);
        expect(screen.queryByRole("link")).toBeNull();
    });
});
