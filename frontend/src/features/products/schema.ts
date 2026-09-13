import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1, "Informe o nome do produto.").max(200),
  description: z.string().max(1000).optional(),
  category_id: z.number().int().positive().optional(),
  brand_id: z.number().int().positive().optional(),
  active: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
