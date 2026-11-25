import { diaryServer, mayReadBookingsList } from "@/lib/bookings/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The bookings diary (DEC-259), behind the same gate as the list. */
export const dynamic = "force-dynamic";
export const GET = readRoute(diaryServer, mayReadBookingsList);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
