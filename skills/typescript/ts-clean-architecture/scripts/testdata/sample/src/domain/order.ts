import { PrismaClient } from "@prisma/client";
import type { Marker } from "@/usecase/place-order";

export type Order = { id: string; client: PrismaClient; marker: Marker };
