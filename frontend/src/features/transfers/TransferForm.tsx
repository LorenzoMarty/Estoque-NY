import { zodResolver } from "@hookform/resolvers/zod";
import { ActionIcon, Alert, Button, Group, NumberInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useBranchesQuery, useLocationsQuery, useSkusQuery } from "../../shared/api/catalog";
import { useCreateTransfer } from "./api";
import { transferCreateSchema, type TransferCreateFormValues } from "./schema";

export function TransferForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: branches } = useBranchesQuery();
  const { data: skus } = useSkusQuery();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferCreateFormValues>({
    resolver: zodResolver(transferCreateSchema),
    defaultValues: { items: [{ sku_id: undefined as never, qty: undefined as never }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const fromBranchId = watch("from_branch_id");
  const toBranchId = watch("to_branch_id");
  const { data: fromLocations } = useLocationsQuery(fromBranchId);
  const { data: toLocations } = useLocationsQuery(toBranchId);

  const createTransfer = useCreateTransfer();

  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const fromLocationOptions = useMemo(
    () => (fromLocations ?? []).map((l) => ({ value: String(l.id), label: l.name })),
    [fromLocations]
  );
  const toLocationOptions = useMemo(() => (toLocations ?? []).map((l) => ({ value: String(l.id), label: l.name })), [toLocations]);
  const skuOptions = useMemo(
    () => (skus ?? []).map((s) => ({ value: String(s.id), label: `${s.sku_code} — ${s.name ?? "Sem nome"}` })),
    [skus]
  );

  async function onSubmit(values: TransferCreateFormValues) {
    setApiError(null);
    try {
      await createTransfer.mutateAsync(values);
      onSuccess();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível criar a transferência.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack>
        <Group grow align="flex-start">
          <Controller
            name="from_branch_id"
            control={control}
            render={({ field }) => (
              <Select
                label="Filial de origem"
                data={branchOptions}
                error={errors.from_branch_id?.message}
                value={field.value != null ? String(field.value) : null}
                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
              />
            )}
          />
          <Controller
            name="from_location_id"
            control={control}
            render={({ field }) => (
              <Select
                label="Local de origem"
                data={fromLocationOptions}
                error={errors.from_location_id?.message}
                value={field.value != null ? String(field.value) : null}
                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
              />
            )}
          />
        </Group>
        <Group grow align="flex-start">
          <Controller
            name="to_branch_id"
            control={control}
            render={({ field }) => (
              <Select
                label="Filial de destino"
                data={branchOptions}
                error={errors.to_branch_id?.message}
                value={field.value != null ? String(field.value) : null}
                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
              />
            )}
          />
          <Controller
            name="to_location_id"
            control={control}
            render={({ field }) => (
              <Select
                label="Local de destino"
                data={toLocationOptions}
                error={errors.to_location_id?.message}
                value={field.value != null ? String(field.value) : null}
                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
              />
            )}
          />
        </Group>

        <Text fw={600} size="sm">
          Itens
        </Text>
        {fields.map((field, index) => (
          <Group key={field.id} align="flex-start">
            <Controller
              name={`items.${index}.sku_id`}
              control={control}
              render={({ field: skuField }) => (
                <Select
                  placeholder="Variação"
                  searchable
                  data={skuOptions}
                  style={{ flex: 1 }}
                  error={errors.items?.[index]?.sku_id?.message}
                  value={skuField.value != null ? String(skuField.value) : null}
                  onChange={(value) => skuField.onChange(value ? Number(value) : undefined)}
                />
              )}
            />
            <Controller
              name={`items.${index}.qty`}
              control={control}
              render={({ field: qtyField }) => (
                <NumberInput
                  placeholder="Qtd"
                  min={1}
                  w={100}
                  error={errors.items?.[index]?.qty?.message}
                  value={qtyField.value ?? ""}
                  onChange={(value) => qtyField.onChange(value)}
                />
              )}
            />
            <ActionIcon color="red" variant="subtle" onClick={() => remove(index)} disabled={fields.length === 1}>
              <Trash2 size={16} />
            </ActionIcon>
          </Group>
        ))}
        {errors.items?.message && (
          <Text c="red" size="sm">
            {errors.items.message}
          </Text>
        )}
        <Button
          variant="light"
          leftSection={<Plus size={16} />}
          onClick={() => append({ sku_id: undefined as never, qty: undefined as never })}
        >
          Adicionar item
        </Button>

        <TextInput label="Observação (opcional)" {...register("note")} />
        {apiError && <Alert color="red">{apiError}</Alert>}
        <Button type="submit" loading={isSubmitting}>
          Criar transferência
        </Button>
      </Stack>
    </form>
  );
}
