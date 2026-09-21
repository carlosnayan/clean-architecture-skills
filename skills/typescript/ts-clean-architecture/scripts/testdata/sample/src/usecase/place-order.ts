import express from "express";
import type { Order } from "@/domain/order";

export type Marker = { tag: "marker" };
export function place(order: Order, app: express.Express): void {}
