import { freeAddress } from "./site-address";

/**
 * `freeAddress` (DEC-069): the address a refusal suggests, and the Turn on
 * sheet's default (DEC-068). A fake reader stands in for the two tables it
 * asks: businesses' reservations and sites' addresses.
 */
function reader(opts: {
    reservedBy?: Record<string, string>;
    sites?: Record<string, string>;
}) {
    const reservedBy = opts.reservedBy ?? {};
    const sites = opts.sites ?? {};
    return {
        organization: {
            findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
                Promise.resolve(
                    reservedBy[where.slug]
                        ? { id: reservedBy[where.slug] }
                        : null,
                ),
            ),
        },
        site: {
            findUnique: jest.fn(({ where }: { where: { subdomain: string } }) =>
                Promise.resolve(
                    sites[where.subdomain]
                        ? {
                              id: `site-${where.subdomain}`,
                              organizationId: sites[where.subdomain],
                          }
                        : null,
                ),
            ),
        },
    } as never;
}

describe("freeAddress", () => {
    it("keeps the address asked for when it is free", async () => {
        await expect(
            freeAddress(reader({}), "rye-studio", "org_1"),
        ).resolves.toBe("rye-studio");
    });

    it("keeps the business's own reservation, which is free to itself", async () => {
        await expect(
            freeAddress(
                reader({ reservedBy: { "rye-studio": "org_1" } }),
                "rye-studio",
                "org_1",
            ),
        ).resolves.toBe("rye-studio");
    });

    it("numbers past another business's reservation and every site", async () => {
        await expect(
            freeAddress(
                reader({
                    reservedBy: { "rye-studio": "org_2" },
                    // A site of its own still holds the address: it is unique.
                    sites: { "rye-studio-2": "org_1" },
                }),
                "rye-studio",
                "org_1",
            ),
        ).resolves.toBe("rye-studio-3");
    });

    it("never suggests a reserved word or a bad shape", async () => {
        await expect(freeAddress(reader({}), "admin", "org_1")).resolves.toBe(
            "admin-2",
        );
        await expect(
            freeAddress(reader({}), "  Rye  Studio! ", "org_1"),
        ).resolves.toBe("rye-studio");
        await expect(freeAddress(reader({}), "ab", "org_1")).resolves.toBe(
            "ab-site",
        );
        await expect(freeAddress(reader({}), "", "org_1")).resolves.toBe(
            "my-site",
        );
    });

    it("stays within a DNS label however long the name", async () => {
        const long = "a".repeat(80);
        const suggestion = await freeAddress(
            reader({ reservedBy: { [long.slice(0, 59)]: "org_2" } }),
            long,
            "org_1",
        );
        expect(suggestion).toBe(`${"a".repeat(59)}-2`);
        expect(suggestion?.length).toBeLessThanOrEqual(63);
    });
});
