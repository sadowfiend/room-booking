import { connection } from "next/server";
import { getBookingService } from "@/server/repository-factory";
import {
  createdResponse,
  getRequestContext,
  listResponse,
  readJsonBody,
  toResponse,
} from "@/server/http";

export async function GET(request: Request) {
  await connection();
  const date = new URL(request.url).searchParams.get("date");
  return toResponse(await getBookingService().list(date), listResponse);
}

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = await getBookingService().create(
    parsed.body,
    getRequestContext(request),
  );
  return toResponse(result, createdResponse);
}
