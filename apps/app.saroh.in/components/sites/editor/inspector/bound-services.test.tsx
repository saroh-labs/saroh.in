// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import type { ServicesLoad } from "@/components/sites/section-fields";
import type { Section } from "@/lib/sites/service";

import { BoundServices, boundServiceIds } from "./bound-services";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
    document.body.innerHTML = "";
});

const booking = (serviceId?: string) =>
    ({
        type: "booking",
        content: serviceId ? { serviceId } : {},
    }) as unknown as Section;

it("a Booking section shows its one service, or every live one (D6)", () => {
    expect(boundServiceIds(booking("s2"), ["s1", "s2"])).toEqual(["s2"]);
    expect(boundServiceIds(booking(), ["s1", "s2"])).toEqual(["s1", "s2"]);
    expect(
        boundServiceIds({ type: "hero", content: {} } as unknown as Section),
    ).toBeNull();
});

it("a Booking section's price opens the price sheet", () => {
    const services = {
        status: "ready",
        services: [
            {
                id: "s1",
                name: "Trial",
                status: "ACTIVE",
                priceCents: 250000,
                currency: "INR",
                durationMinutes: 90,
            },
            {
                id: "s2",
                name: "Old",
                status: "ARCHIVED",
                priceCents: 100,
                currency: "INR",
            },
        ],
    } as unknown as ServicesLoad;
    const onPrice = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    act(() =>
        createRoot(host).render(
            <BoundServices
                section={booking()}
                services={services}
                onPrice={onPrice}
            />,
        ),
    );
    const price = host.querySelector<HTMLButtonElement>("[data-price-of=s1]");
    expect(price).not.toBeNull();
    expect(host.querySelector("[data-price-of=s2]")).toBeNull();
    act(() => price?.click());
    expect(onPrice).toHaveBeenCalledWith("s1");
});
