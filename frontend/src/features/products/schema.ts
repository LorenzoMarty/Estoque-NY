import { z } from "zod";

const isHttpUrl = (value: string) => {
  try {
    const { protocol, host } = new URL(value);
    return (protocol === "http:" || protocol === "https:") && host !== "";
  } catch {
    return false;
  }
};

export const productSchema = z.object({
  name: z.string().min(1, "Informe o nome do produto.").max(200),
  description: z.string().max(1000).optional(),
  category_id: z.number().int().positive().optional(),
  brand_id: z.number().int().positive().optional(),
  active: z.boolean(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
  image_url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || isHttpUrl(value), "Use um link http ou https.")
    .optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
