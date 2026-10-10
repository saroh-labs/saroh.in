import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { MediaService } from "../media/media.service";
import { logoProblem } from "../organizations/business-logo";

import type { UpdateStoreDto } from "./dto";
import type { LogoPatch } from "./location-logo";
import {
    legacyLogoPatch,
    locationLogos,
    LOGO_ADDRESS_GONE_MESSAGE,
} from "./location-logo";
import { StoresService } from "./stores.service";

/**
 * A location read with its logos, and saved with its own logo (DEC-123).
 * `StoresService` still decides who may read and write the location and
 * makes the write; this adds the logo around it.
 *
 * The business is the location's own (`Store.organizationId`), never one
 * the caller named: its logo is the default, and an image set as the
 * location's logo must be in its library.
 */
@Injectable()
export class LocationLogoService {
    constructor(
        private readonly stores: StoresService,
        private readonly media: MediaService,
    ) {}

    /**
     * The location (as `getForUser` gives it, 404 the same) with its own
     * logo, the business's, and the one to show, so the app asks once.
     */
    async read(userId: string, storeId: string) {
        const store = await this.stores.getForUser(storeId, userId);
        const profile = await prisma.businessProfile.findUnique({
            where: { organizationId: store.organizationId },
            select: { logoUrl: true },
        });
        return {
            ...store,
            ...locationLogos(store, profile?.logoUrl ?? null),
        };
    }

    /**
     * Save the location's core fields and, when the save says so, its logo:
     * `logoMediaId` an image from the business's library (READY, this
     * business's, a logo's type and size — the business logo's own rule,
     * `logoProblem`), or `null` to go back to the business logo. Left out,
     * the logo stays as it is. Replacing or clearing leaves the old image
     * in the library.
     */
    async update(userId: string, storeId: string, dto: UpdateStoreDto) {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (!writable?.organizationId) {
            throw new NotFoundException("Location not found");
        }
        const logo = await this.logoPatch(
            storeId,
            writable.organizationId,
            dto,
        );
        return this.stores.updateForUser(userId, storeId, dto, logo);
    }

    private async logoPatch(
        storeId: string,
        organizationId: string,
        dto: UpdateStoreDto,
    ): Promise<LogoPatch | null> {
        if (dto.logoMediaId === null) {
            return { logo: null, logoMediaId: null };
        }
        if (dto.logoMediaId !== undefined) {
            // Another business's image, or one still uploading, is a 404.
            const media = await this.media.readyObject(
                organizationId,
                dto.logoMediaId,
            );
            const problem = logoProblem(media);
            if (problem) throw refusal(problem);
            if (!media.url) {
                throw refusal(
                    "Uploaded, but storage is not set up to serve images yet, so the logo cannot show.",
                );
            }
            return { logo: media.url, logoMediaId: media.id };
        }
        if (dto.logo === undefined) return null;
        const current = await prisma.store.findUnique({
            where: { id: storeId },
            select: { logo: true, logoMediaId: true },
        });
        if (!current) throw new NotFoundException("Location not found");
        const patch = legacyLogoPatch(dto.logo, current);
        if (patch === "refused") throw refusal(LOGO_ADDRESS_GONE_MESSAGE);
        return patch;
    }
}

/** A refusal the app says under the logo. */
function refusal(message: string) {
    return new BadRequestException({ message, details: { field: "logo" } });
}
