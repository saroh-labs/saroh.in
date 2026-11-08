/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ModuleRow } from "./module-row";

/** A made-up plan and feature; the warning is a line on the row, not a block. */
const row = (indiaOnly: string | null) =>
    render(
        <ModuleRow
            plan="Plan B"
            planId="b"
            feature="Things"
            cell={{
                inc: true,
                text: "GST invoices",
                card: "",
                limit: null,
                per: "",
                soft: false,
            }}
            changed={false}
            was={[]}
            reach="Reaches no business"
            usage={null}
            focused={false}
            disabled={false}
            errors={{}}
            indiaOnly={indiaOnly}
            onInclude={() => undefined}
            onPatch={() => undefined}
            onLimit={() => undefined}
            onOff={() => undefined}
        />,
    );

afterEach(cleanup);

describe("ModuleRow's India-only warning (stage 9)", () => {
    it("shows on the row and leaves the fields editable", () => {
        row('"GST" only means something in India.');
        expect(
            screen.getByText('"GST" only means something in India.'),
        ).toBeTruthy();
        expect(screen.getByDisplayValue("GST invoices")).toHaveProperty(
            "disabled",
            false,
        );
    });

    it("shows nothing without one", () => {
        row(null);
        expect(screen.queryByText(/only means something in India/)).toBeNull();
    });
});
