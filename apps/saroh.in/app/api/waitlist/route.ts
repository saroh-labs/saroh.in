// POST /api/waitlist
//
// Only api.saroh.in may touch the database (single-backend refactor). The
// public site no longer writes directly; until api exposes a waitlist
// endpoint, this records the signup to the server log and acknowledges. Wire
// it to `fetch(`${API_URL}/waitlist`, { method: "POST", ... })` when ready.

import { NextResponse } from "next/server";

export async function POST(req: Request) {
	try {
		const data = await req.json();
		// TODO: forward to api.saroh.in's waitlist endpoint.
		console.log("[waitlist] signup:", data?.email);
		return NextResponse.json({ message: "success", status: "success" });
	} catch (reason) {
		console.log(reason);
		return NextResponse.json({ status: "failure", reason });
	}
}
