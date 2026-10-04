import type { StatusTone } from "../app/theme";
import type { MoveType } from "./types/stock";

export const MOVE_TYPE_LABELS: Record<MoveType, string> = {
  RECEIPT: "Entrada",
  ISSUE: "Saída",
  ADJUSTMENT: "Ajuste",
  TRANSFER_SHIP: "Transferência (envio)",
  TRANSFER_RECEIVE: "Transferência (recebimento)",
};

export const MOVE_TYPE_TONES: Record<MoveType, StatusTone> = {
  RECEIPT: "good",
  ISSUE: "info",
  ADJUSTMENT: "warning",
  TRANSFER_SHIP: "neutral",
  TRANSFER_RECEIVE: "neutral",
};

export type MoveGroup = "all" | "in" | "out" | "transfer";

export function moveInGroup(type: MoveType, group: MoveGroup): boolean {
  if (group === "all") return true;
  if (group === "in") return type === "RECEIPT";
  if (group === "out") return type === "ISSUE";
  return type === "TRANSFER_SHIP" || type === "TRANSFER_RECEIVE";
}
