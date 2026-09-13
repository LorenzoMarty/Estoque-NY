import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, NumberInput, Select, SegmentedControl, Stack, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBranchesQuery, useLocationsQuery, useSkusQuery } from "../../shared/api/catalog";
import { useCreateAdjustment, useCreateIssue, useCreateReceipt } from "./api";
import {
  adjustmentSchema,
  issueSchema,
  movementFormSchema,
  receiptSchema,
  type MoveKind,
  type MovementFormValues,
} from "./schema";

const SCHEMAS = { receipt: receiptSchema, issue: issueSchema, adjustment: adjustmentSchema } as const;
const LABELS: Record<MoveKind, string> = { receipt: "Entrada", issue: "Saída", adjustment: "Ajuste" };

export function MovementForm({ onSuccess }: { onSuccess: () => void }) {
  const [kind, setKind] = useState<MoveKind>("receipt");
  const { data: branches } = useBranchesQuery();
  const { data: skus } = useSkusQuery();
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MovementFormValues>({ resolver: zodResolver(movementFormSchema) });
  const branchId = watch("branch_id");
  const { data: locations } = useLocationsQuery(branchId ? Number(branchId) : undefined);
  const [apiError, setApiError] = useState<string | null>(null);

  const createReceipt = useCreateReceipt();
  const createIssue = useCreateIssue();
  const createAdjustment = useCreateAdjustment();

  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const locationOptions = useMemo(
    () => (locations ?? []).map((l) => ({ value: String(l.id), label: l.name })),
    [locations]
  );
  const skuOptions = useMemo(
    () => (skus ?? []).map((s) => ({ value: String(s.id), label: `${s.sku_code} — ${s.name ?? "Sem nome"}` })),
    [skus]
  );

  async function onSubmit(values: MovementFormValues) {
    setApiError(null);
    const parsed = SCHEMAS[kind].safeParse(values);
    if (!parsed.success) {
      const qtyIssue = parsed.error.issues.find((issue) => issue.path[0] === "qty" || issue.path[0] === "qty_delta");
      if (qtyIssue) {
        setError(kind === "adjustment" ? "qty_delta" : "qty", { message: qtyIssue.message });
      }
      return;
    }
    try {
      if (kind === "receipt") await createReceipt.mutateAsync(receiptSchema.parse(values));
      else if (kind === "issue") await createIssue.mutateAsync(issueSchema.parse(values));
      else await createAdjustment.mutateAsync(adjustmentSchema.parse(values));
      reset();
      onSuccess();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível registrar a movimentação.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack>
        <SegmentedControl
          fullWidth
          value={kind}
          onChange={(value) => setKind(value as MoveKind)}
          data={Object.entries(LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Controller
          name="branch_id"
          control={control}
          render={({ field }) => (
            <Select
              label="Filial"
              data={branchOptions}
              error={errors.branch_id?.message}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        <Controller
          name="location_id"
          control={control}
          render={({ field }) => (
            <Select
              label="Local (opcional)"
              data={locationOptions}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        <Controller
          name="sku_id"
          control={control}
          render={({ field }) => (
            <Select
              label="Variação"
              searchable
              data={skuOptions}
              error={errors.sku_id?.message}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        {kind === "adjustment" ? (
          <Controller
            name="qty_delta"
            control={control}
            render={({ field }) => (
              <NumberInput
                label="Ajuste (+ ou -)"
                error={errors.qty_delta?.message}
                value={field.value ?? ""}
                onChange={(value) => field.onChange(value)}
              />
            )}
          />
        ) : (
          <Controller
            name="qty"
            control={control}
            render={({ field }) => (
              <NumberInput
                label="Quantidade"
                min={1}
                error={errors.qty?.message}
                value={field.value ?? ""}
                onChange={(value) => field.onChange(value)}
              />
            )}
          />
        )}
        <TextInput label="Motivo (opcional)" {...register("reason")} />
        <TextInput label="Referência (opcional)" {...register("reference_id")} />
        {apiError && <Alert color="red">{apiError}</Alert>}
        <Button type="submit" loading={isSubmitting}>
          Registrar {LABELS[kind].toLowerCase()}
        </Button>
      </Stack>
    </form>
  );
}
