import { getAuthorsOverview, parseAuthorMerges, saveMerges } from "@/lib/authors";
import { IngestError } from "@/lib/ingest";
import { assertKnownRepo, errorResponse } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/repos/[id]/authors">) {
  try {
    const { id } = await context.params;
    await assertKnownRepo(id);
    return Response.json(await getAuthorsOverview(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext<"/api/repos/[id]/authors">) {
  try {
    const { id } = await context.params;
    await assertKnownRepo(id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new IngestError("The request body must be valid JSON.", 400);
    }

    const overview = await getAuthorsOverview(id);
    const merges = parseAuthorMerges(body, overview.authors);
    await saveMerges(id, merges);
    return Response.json({ ...overview, merges });
  } catch (error) {
    return errorResponse(error);
  }
}
