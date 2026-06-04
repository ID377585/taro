import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildReadingMarkdownReport } from "@/lib/reporting";
import { getReadingByIdForHost } from "@/lib/reading-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const reading = await getReadingByIdForHost(id, {
    id: session.user.id,
    role: session.user.role,
  });

  if (!reading) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  const report = buildReadingMarkdownReport(reading);

  return new NextResponse(report, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename=\"reading-${reading.id}.md\"`,
    },
  });
}
