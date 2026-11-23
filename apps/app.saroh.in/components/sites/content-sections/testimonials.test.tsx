// @vitest-environment jsdom
// The testimonials editor holds a Stars field per quote, so a rating can be
// changed after the review is added (ERVReviewStars).
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { Section } from "@/lib/sites/service";

import { TestimonialsFields } from "@/components/sites/content-sections/testimonials";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let draft: Section;
beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function Harness({ start }: { start: Section }) {
    const [section, setSection] = useState<Section>(start);
    if (section.type !== "testimonials") return null;
    return (
        <TestimonialsFields
            section={section}
            pages={[]}
            services={{ status: "ready", services: [] }}
            onChange={(next) => {
                draft = next;
                setSection(next);
            }}
        />
    );
}

it("sets, changes and clears a saved quote's stars", () => {
    const start = {
        type: "testimonials",
        content: { items: [{ quote: "Great", name: "Asha", rating: 4 }] },
    } as unknown as Section;
    draft = start;
    act(() => root.render(<Harness start={start} />));
    expect(host.querySelector("[data-star-rating]")).not.toBeNull();
    const stars = () =>
        Array.from(host.querySelectorAll<HTMLElement>("[role=radio]"));
    act(() => stars()[1]?.click());
    const items = (d: Section) =>
        (d as unknown as { content: { items: { rating?: number }[] } }).content
            .items;
    expect(items(draft)[0]?.rating).toBe(2);
    const clear = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "Clear",
    );
    act(() => clear?.click());
    expect(items(draft)[0]?.rating).toBeUndefined();
});
