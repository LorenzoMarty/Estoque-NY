import { z } from "zod";

export const SKU_ORIGINS = [
  { value: "FOREIGN", label: "Estrangeira" },
  { value: "NATIONAL", label: "Nacional" },
  { value: "EXPORTED_NO_EXIT", label: "Exportada sem saída do território" },
] as const;

const ncm = z.string().regex(/^\d{8}$/, "O NCM tem 8 dígitos.").nullish();
const origin = z.enum(["FOREIGN", "NATIONAL", "EXPORTED_NO_EXIT"]).nullish();

export const skuCreateSchema = z.object({
  product_id: z.number({ error: "Selecione o produto." }).int().positive(),
  sku_code: z.string().min(1, "Informe o código da variação."),
  name: z.string().max(200).optional(),
  barcode: z.string().max(64).optional(),
  unit: z.string().min(1).max(20),
  cost: z.number().min(0),
  price: z.number().min(0),
  ncm,
  origin,
  restricted: z.boolean(),
  active: z.boolean(),
});

export const skuUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  barcode: z.string().max(64).optional(),
  unit: z.string().min(1).max(20),
  cost: z.number().min(0),
  price: z.number().min(0),
  ncm,
  origin,
  restricted: z.boolean(),
  active: z.boolean(),
});

export type SkuCreateFormValues = z.infer<typeof skuCreateSchema>;
export type SkuUpdateFormValues = z.infer<typeof skuUpdateSchema>;
