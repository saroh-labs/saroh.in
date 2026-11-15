/**
 * The app's providers give use-intl a time zone. Without one, the server
 * render of the first translated line falls back to the server's own zone
 * and reports ENVIRONMENT_FALLBACK, on every page (use-intl only checks on
 * the server, so this renders the way Next does there).
 */
import { renderToString } from "react-dom/server";
import { useTranslations } from "use-intl";
import { expect, it, vi } from "vitest";

import { Providers } from "@/app/providers";

function Line() {
    // Asking for the translator is enough: use-intl checks the zone there.
    useTranslations();
    return <p>ok</p>;
}

it("server-renders a translated line without use-intl reporting a missing time zone", () => {
    const errors = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
    const html = renderToString(
        <Providers>
            <Line />
        </Providers>,
    );
    expect(html).toContain("ok");
    const reported = errors.mock.calls.map((call) => String(call[0]));
    expect(
        reported.filter((message) => message.includes("ENVIRONMENT_FALLBACK")),
    ).toEqual([]);
    errors.mockRestore();
});
