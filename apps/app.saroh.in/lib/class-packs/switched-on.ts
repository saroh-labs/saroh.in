import type { ModuleView } from "@/lib/modules/schema";

/**
 * Whether packs can be spent or sold here: the Class packs module (E12) is
 * available, which is what the rail and `/class-packs`'s gate ask too
 * (`readiness`, not `lifecycle`).
 *
 * Fails open, as the rail does: a module list that could not be read, or an
 * API from before Class packs was its own module (no CLASS_PACKS entry),
 * keeps today's controls, and the API refuses anything it must.
 *
 * Switched off, a booking already paid with a pack still says so; only the
 * controls that spend or sell one go.
 */
export function packsOn(modules: readonly ModuleView[] | null): boolean {
    const packs = modules?.find((m) => m.key === "CLASS_PACKS");
    return packs ? packs.readiness !== "DISABLED" : true;
}
