import { z } from "zod";

export const inventoryCountCreateSchema = z.object({
  branch_id: z.number({ error: "Selecione a filial." }).int().positive(),
  location_id: z.number({ error: "Selecione o local." }).int().positive(),
});

export type InventoryCountCreateFormValues = z.infer<typeof inventoryCountCreateSchema>;
