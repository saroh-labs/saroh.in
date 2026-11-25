import { availabilityServer, mayReadBookingsList } from "@/lib/bookings/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** Hours and time off (U25): to whoever reads Bookings, as the section's layout decides. */
export const dynamic = "force-dynamic";
export const GET = readRoute(availabilityServer, mayReadBookingsList);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
