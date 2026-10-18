import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { AccessDenied } from "@/lib/access";
import { exportStudentData } from "@/lib/more-services";
import { currentUser } from "@/lib/session";
import { today } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Everything stored about one child, as a JSON download for the parent. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const data = await exportStudentData(getDb(), user, id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="nazar-${today()}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AccessDenied) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
}
