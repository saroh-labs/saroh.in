import { BadRequestException } from "@nestjs/common";
import {
    checkDeliveryPlace,
    listedCountry,
    POSTCODE_MAX,
    REGION_MAX,
    splitDeliveryPlace,
} from "@saroh/block-contract";
import { prisma, runInOrgContext } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";

import type { DeliveryAddressInput } from "./dto";

/**
 * A delivery address held to its business's rules, by the business's edition
 * and never by anything the request says (DEC-204).
 *
 * - **India**: a state, read later as the GST place of supply, and a PIN
 *   code. Refused in the words and shape the DTO's validators used.
 * - **Global**: no tax reads the region or postcode (a Global business can't
 *   register for GST); they're held to the address's own country, never to
 *   the business's (`checkDeliveryPlace`): the US, Canada and Australia need
 *   the state from the list and the code, elsewhere both are optional but a
 *   typed postcode must fit. The country is one from the list, else the one
 *   already on the line (an edit sends back what it read), else the
 *   business's own. The region goes in `state` and the country's ISO code in
 *   `country`, each to its own column (DEC-207).
 */
export function deliveryAddressFor<A extends DeliveryAddressInput>(
    address: A,
    business: { edition: Edition; country: string | null },
): A {
    const { country: sent, ...rest } = address;
    if (editionProfile(business.edition).address === "indian-state-and-pin") {
        const missing = [
            !address.state && "address.Add the state",
            !address.postalCode && "address.Add the PIN code",
        ].filter((message) => message !== false);
        if (missing.length > 0) {
            throw new BadRequestException({ message: missing });
        }
        return rest as A;
    }
    if (sent && !listedCountry(sent)) {
        throw new BadRequestException({
            message: "Pick a country from the list.",
            field: "address.country",
        });
    }
    const place = sent
        ? { region: address.state ?? "", country: null }
        : splitDeliveryPlace(address.state);
    if (place.region.length > REGION_MAX) {
        throw new BadRequestException({
            message: `A region is up to ${REGION_MAX} characters.`,
            field: "address.state",
        });
    }
    const postcode = address.postalCode?.trim() ?? "";
    if (postcode.length > POSTCODE_MAX) {
        throw new BadRequestException({
            message: `A postcode is up to ${POSTCODE_MAX} characters.`,
            field: "address.postalCode",
        });
    }
    const country =
        listedCountry(sent ?? place.country ?? business.country)?.code ?? null;
    const checked = checkDeliveryPlace(country, place.region, postcode);
    if ("problem" in checked) {
        throw new BadRequestException({
            message: checked.problem,
            field: `address.${checked.field}`,
        });
    }
    return {
        ...rest,
        state: checked.region || null,
        postalCode: checked.postcode || null,
        country,
    } as A;
}

/** {@link deliveryAddressFor}, with the business read from the database. */
export async function settleDeliveryAddress<A extends DeliveryAddressInput>(
    organizationId: string | null,
    address: A,
): Promise<A> {
    const business = organizationId
        ? await runInOrgContext(organizationId, () =>
              prisma.organization.findUnique({
                  where: { id: organizationId },
                  select: {
                      edition: true,
                      businessProfile: { select: { country: true } },
                  },
              }),
          )
        : null;
    return deliveryAddressFor(address, {
        edition: business?.edition ?? "INDIA",
        country: business?.businessProfile?.country ?? null,
    });
}
