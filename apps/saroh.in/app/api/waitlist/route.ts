// create the POST /api/waitlist route

import { NextResponse } from "next/server";
import primsa from "@/lib/prisma";
export async function POST(req: Request) {
	try {
		const data = await req.json();
		console.log(data);
		const createWaitlist = await primsa.waitlist.create({
			data: {
				email: data.email,
			},
		});
		return NextResponse.json({
			message: "success",
			status: "success",
		});
	} catch (reason) {
		console.log(reason);
		return NextResponse.json({ status: "failure", reason });
	}
}
