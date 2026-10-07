import { connection } from "next/server";
import { healthResponse } from "@/server/http";
import { getRepository } from "@/server/repository-factory";

export async function GET() {
  await connection();
  return healthResponse(getRepository().kind);
}
