import {
    addressProblem,
    addressTaken,
    DOUBLE_HYPHEN_MESSAGE,
    freeAddress,
    MAX_ADDRESS_LENGTH,
    releaseExpired,
} from "./site-address";

const DAY = 86_400_000;

/**
 * The address rules (DEC-069, DEC-071). A fake reader stands in for the
 * three tables "is it free" asks: businesses' reservations at setup, sites'
 * addresses, and addresses held after a change.
 */
function reader(opts: {
    reservedBy?: Record<string, string>;
    sites?: Record<string, string>;
    held?: Record<string, { organizationId: string; reservedUntil: Date }>;
}) {
    const reservedBy = opts.reservedBy ?? {};
    const sites = opts.sites ?? {};
    const held = opts.held ?? {};
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
        addressReservation: {
            findUnique: jest.fn(({ where }: { where: { address: string } }) =>
                Promise.resolve(held[where.address] ?? null),
            ),
            deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
        },
    } as never;
}

describe("addressProblem", () => {
    it.each(["a--b", "test--rye", "xn--abc"])(
        "refuses %s: two hyphens in a row are Saroh's (DEC-071)",
        (address) => {
            expect(addressProblem(address)).toBe(DOUBLE_HYPHEN_MESSAGE);
            expect(DOUBLE_HYPHEN_MESSAGE).toBe(
                "An address can't have two hyphens in a row",
            );
        },
    );

    it("lets one hyphen through", () => {
        expect(addressProblem("a-b")).toBeNull();
        expect(addressProblem("rye-bakery-2")).toBeNull();
    });

    it("keeps test for Saroh (a test release's label)", () => {
        expect(addressProblem("test")).toBe("That address is kept for Saroh");
        expect(addressProblem("testing")).toBeNull();
    });

    it("caps an address at 57 characters, so test--<address> is still a DNS label", () => {
        expect(MAX_ADDRESS_LENGTH).toBe(57);
        expect(addressProblem("a".repeat(57))).toBeNull();
        expect(`test--${"a".repeat(57)}`).toHaveLength(63);
        expect(addressProblem("a".repeat(58))).toBe(
            "An address can have at most 57 characters",
        );
    });
});

describe("addressTaken", () => {
    const soon = () => new Date(Date.now() + DAY);
    const gone = () => new Date(Date.now() - DAY);

    it("counts another business's live hold as taken", async () => {
        const db = reader({
            held: { rye: { organizationId: "org_2", reservedUntil: soon() } },
        });
        await expect(addressTaken(db, "rye", "org_1")).resolves.toBe(true);
        // Setup asks with no business of its own yet.
        await expect(addressTaken(db, "rye")).resolves.toBe(true);
    });

    it("frees a hold past its reservedUntil", async () => {
        const db = reader({
            held: { rye: { organizationId: "org_2", reservedUntil: gone() } },
        });
        await expect(addressTaken(db, "rye", "org_1")).resolves.toBe(false);
    });

    it("leaves a business's own hold free to itself", async () => {
        const db = reader({
            held: { rye: { organizationId: "org_1", reservedUntil: soon() } },
        });
        await expect(addressTaken(db, "rye", "org_1")).resolves.toBe(false);
    });
});

describe("releaseExpired", () => {
    it("deletes only a hold whose reservedUntil has passed", async () => {
        const db = reader({}) as unknown as {
            addressReservation: { deleteMany: jest.Mock };
        };
        await expect(releaseExpired(db as never, "rye")).resolves.toBe(1);
        const [args] = db.addressReservation.deleteMany.mock.calls[0] as [
            { where: { address: string; reservedUntil: { lte: Date } } },
        ];
        expect(args.where.address).toBe("rye");
        expect(args.where.reservedUntil.lte).toBeInstanceOf(Date);
    });
});

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

    it("numbers past an address another business holds after a change", async () => {
        await expect(
            freeAddress(
                reader({
                    held: {
                        "rye-studio": {
                            organizationId: "org_2",
                            reservedUntil: new Date(Date.now() + DAY),
                        },
                    },
                }),
                "rye-studio",
                "org_1",
            ),
        ).resolves.toBe("rye-studio-2");
    });

    it("never suggests a reserved word or a bad shape", async () => {
        await expect(freeAddress(reader({}), "admin", "org_1")).resolves.toBe(
            "admin-2",
        );
        await expect(freeAddress(reader({}), "test", "org_1")).resolves.toBe(
            "test-2",
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

    it("never suggests two hyphens in a row", async () => {
        await expect(freeAddress(reader({}), "a--b", "org_1")).resolves.toBe(
            "a-b",
        );
        await expect(
            freeAddress(reader({}), "test--rye", "org_1"),
        ).resolves.toBe("test-rye");
    });

    it("stays within 57 characters however long the name", async () => {
        const long = "a".repeat(80);
        const suggestion = await freeAddress(
            reader({ reservedBy: { [long.slice(0, 54)]: "org_2" } }),
            long,
            "org_1",
        );
        expect(suggestion).toBe(`${"a".repeat(54)}-2`);
        expect(suggestion?.length).toBeLessThanOrEqual(MAX_ADDRESS_LENGTH);
    });
});
