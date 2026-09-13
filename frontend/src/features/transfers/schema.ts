import { z } from "zod";

export const transferItemSchema = z.object({
  sku_id: z.number({ error: "Selecione a variação." }).int().positive(),
  qty: z.number({ error: "Informe a quantidade." }).int().positive("Quantidade deve ser maior que zero."),
});

export const transferCreateSchema = z.object({
  from_branch_id: z.number({ error: "Selecione a filial de origem." }).int().positive(),
  from_location_id: z.number({ error: "Selecione o local de origem." }).int().positive(),
  to_branch_id: z.number({ error: "Selecione a filial de destino." }).int().positive(),
  to_location_id: z.number({ error: "Selecione o local de destino." }).int().positive(),
  note: z.string().max(240).optional(),
  items: z.array(transferItemSchema).min(1, "Adicione ao menos um item."),
});

export type TransferCreateFormValues = z.infer<typeof transferCreateSchema>;
