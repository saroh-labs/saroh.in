// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Claim } from "./claim";

describe("Claim (DEC-221)", () => {
    it("draws the claim only while its switch is on", () => {
        expect(
            render(<Claim on>Posts for you</Claim>).container.textContent,
        ).toBe("Posts for you");
        expect(
            render(<Claim on={false}>Posts for you</Claim>).container
                .textContent,
        ).toBe("");
    });

    it("off, says the page's 'Not available yet' instead, never the claim", () => {
        const { container } = render(
            <Claim on={false} notYet="Not available yet">
                Posts for you
            </Claim>,
        );
        expect(container.textContent).toBe("Not available yet");
    });
});
