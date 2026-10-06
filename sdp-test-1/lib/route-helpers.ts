import { IngestError } from "./ingest";
import { listRepos } from "./workspace";

export async function assertKnownRepo(id: string): Promise<void> {
  const repos = await listRepos();
  if (!repos.includes(id)) {
    throw new IngestError("Repository not found in the workspace.", 404);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof IngestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Unexpected server error." }, { status: 500 });
}

export function parseTimestamp(value: string | null, name: string): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  if (!/^\d{1,12}$/.test(value.trim())) {
    throw new IngestError(`The ${name} parameter must be a UNIX timestamp in seconds.`, 400);
  }
  return Number.parseInt(value.trim(), 10);
}
