// @vitest-environment jsdom
/**
 * The account area's loading: inside the frame, shaped like the page that
 * is coming, picked by the path the router has already moved to (21 Nov).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    draw,
    host,
    setUp,
    tearDown,
    text,
} from "../billing-profiles/test-kit";
import { AreaLoading } from "./area-loading";

let path = "/account";
vi.mock("next/navigation", () => ({
    usePathname: () => path,
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

beforeEach(setUp);
afterEach(tearDown);

const heading = () => text(host.querySelector("h1"));

describe("AreaLoading", () => {
    it.each([
        ["/account", "Profile and sign-in", "Loading your profile"],
        ["/businesses", "Your businesses", "Loading your businesses"],
        [
            "/account/billing-profiles",
            "Billing profiles",
            "Loading your billing profiles",
        ],
    ])("%s draws its own title and says it is loading", (at, title, label) => {
        path = at;
        draw(<AreaLoading />);
        expect(heading()).toBe(title);
        const busy = host.querySelector("[aria-busy=true]");
        expect(text(busy)).toContain(label);
    });

    it("a billing profile draws its own cards, not the list's", () => {
        path = "/account/billing-profiles/bprof_1";
        draw(<AreaLoading />);
        expect(text(host)).toContain("Loading this billing profile");
        expect(text(host)).toContain("On Saroh's invoices");
        expect(text(host)).not.toContain("Who Saroh bills");
    });
});
