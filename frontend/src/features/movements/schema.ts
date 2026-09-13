import { z } from "zod";

export const moveKindSchema = z.enum(["receipt", "issue", "adjustment"]);
export type MoveKind = z.infer<typeof moveKindSchema>;

const baseFields = {
  branch_id: z.coerce.number({ error: "Selecione a filial." }).int().positive(),
  sku_id: z.coerce.number({ error: "Selecione a variação." }).int().positive(),
  location_id: z.coerce.number().int().positive().optional(),
  reason: z.string().max(240).optional(),
  reference_id: z.string().max(120).optional(),
};

export const receiptSchema = z.object({
  ...baseFields,
  qty: z.coerce.number({ error: "Informe a quantidade." }).int().positive("Quantidade deve ser maior que zero."),
});

export const issueSchema = z.object({
  ...baseFields,
  qty: z.coerce.number({ error: "Informe a quantidade." }).int().positive("Quantidade deve ser maior que zero."),
});

export const adjustmentSchema = z.object({
  ...baseFields,
  qty_delta: z.coerce
    .number({ error: "Informe o ajuste." })
    .int()
    .refine((value) => value !== 0, "O ajuste não pode ser zero."),
});

export type ReceiptFormValues = z.infer<typeof receiptSchema>;
export type IssueFormValues = z.infer<typeof issueSchema>;
export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

/**
 * The RHF-bound shape: a superset with qty/qty_delta both optional, since the
 * active kind (and therefore which one is required) is chosen at runtime via
 * a SegmentedControl, not statically known to the form's generic type. Final
 * validation happens per-kind against receipt/issue/adjustmentSchema right
 * before submit — this schema only anchors the field names/types for RHF.
 */
export const movementFormSchema = z.object({
  branch_id: z.number({ error: "Selecione a filial." }).int().positive(),
  sku_id: z.number({ error: "Selecione a variação." }).int().positive(),
  location_id: z.number().int().positive().optional(),
  reason: z.string().max(240).optional(),
  reference_id: z.string().max(120).optional(),
  qty: z.number().int().optional(),
  qty_delta: z.number().int().optional(),
});
export type MovementFormValues = z.infer<typeof movementFormSchema>;
