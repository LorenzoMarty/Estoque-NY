import { z } from "zod";

export const moveKindSchema = z.enum(["receipt", "issue", "adjustment"]);
export type MoveKind = z.infer<typeof moveKindSchema>;

/** Why stock left (issues and adjustments); feeds the shrinkage report. Keep in sync with the API's StockReason. */
export const STOCK_REASONS = {
  BREAKAGE: "Quebra",
  THEFT: "Furto",
  EXPIRY: "Vencimento",
  DAMAGE: "Avaria",
  SAMPLE: "Amostra",
  COUNT_CORRECTION: "Correção de contagem",
  OTHER: "Outro",
} as const;
export const stockReasonSchema = z.enum(Object.keys(STOCK_REASONS) as [keyof typeof STOCK_REASONS]);

const baseFields = {
  branch_id: z.coerce.number({ error: "Selecione a filial." }).int().positive(),
  sku_id: z.coerce.number({ error: "Selecione a variação." }).int().positive(),
  location_id: z.coerce.number().int().positive().optional(),
  reason: z.string().max(240).optional(),
  reference_id: z.string().max(120).optional(),
};

/** Empty form inputs arrive as "" and must not reach the API (an empty date would be rejected). */
const optionalText = z
  .string()
  .max(60)
  .optional()
  .transform((value) => value || undefined);

export const receiptSchema = z.object({
  ...baseFields,
  lot_code: optionalText,
  expires_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  qty: z.coerce.number({ error: "Informe a quantidade." }).int().positive("Quantidade deve ser maior que zero."),
});

export const issueSchema = z.object({
  ...baseFields,
  reason_code: stockReasonSchema.optional(),
  qty: z.coerce.number({ error: "Informe a quantidade." }).int().positive("Quantidade deve ser maior que zero."),
});

export const adjustmentSchema = z.object({
  ...baseFields,
  reason_code: stockReasonSchema.optional(),
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
  reason_code: stockReasonSchema.optional(),
  lot_code: z.string().max(60).optional(),
  expires_on: z.string().optional(),
  qty: z.number().int().optional(),
  qty_delta: z.number().int().optional(),
});
export type MovementFormValues = z.infer<typeof movementFormSchema>;
