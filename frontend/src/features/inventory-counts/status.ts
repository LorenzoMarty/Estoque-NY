import type { StatusTone } from "../../app/theme";
import type { InventoryCountStatus } from "../../shared/types/stock";

export const COUNT_STATUS_TONES: Record<InventoryCountStatus, StatusTone> = {
  OPEN: "info",
  CLOSED: "warning",
  POSTED: "good",
  CANCELLED: "critical",
};

export const COUNT_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  POSTED: "Lançada",
  CANCELLED: "Cancelada",
};
