import type * as Registry from "../../src/modules/capabilities/module-registry";

type FlagReader = Parameters<typeof Registry.moduleRolledOut>[0];

/**
 * The module registry, with Class packs rolled out by its flag alone.
 *
 * Class packs are hidden from every business for now (DEC-099), so
 * `moduleRolledOut` says no whatever the flag. The site's pack sale is kept
 * for when packs return, and its specs still test it, mocking the registry
 * with this:
 *
 *     jest.mock("../capabilities/module-registry", () =>
 *         jest
 *             .requireActual("../../../test/fixtures/class-packs-shown")
 *             .registryShowingClassPacks(),
 *     );
 */
export function registryShowingClassPacks(): typeof Registry {
    const actual = jest.requireActual<typeof Registry>(
        "../../src/modules/capabilities/module-registry",
    );
    return {
        ...actual,
        moduleRolledOut: (
            flags: FlagReader,
            key: Registry.ModuleKey,
            organizationId: string,
        ) => {
            const descriptor = actual.MODULE_BY_KEY.get(key);
            if (key !== "CLASS_PACKS" || !flags || !descriptor)
                return actual.moduleRolledOut(flags, key, organizationId);
            return flags.isEnabled(descriptor.rolloutFlag, organizationId);
        },
    };
}
