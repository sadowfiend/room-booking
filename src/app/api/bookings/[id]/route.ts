import { getBookingService } from "@/server/repository-factory";
import {
  getRequestContext,
  noContentResponse,
  okResponse,
  readJsonBody,
  toResponse,
} from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = await getBookingService().update(
    id,
    parsed.body,
    getRequestContext(request),
  );
  return toResponse(result, okResponse);
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return toResponse(await getBookingService().remove(id), noContentResponse);
}
