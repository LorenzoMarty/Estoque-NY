import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Select, Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBranchesQuery, useLocationsQuery } from "../../shared/api/catalog";
import { useCreateInventoryCount } from "./api";
import { inventoryCountCreateSchema, type InventoryCountCreateFormValues } from "./schema";

export function CreateCountForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: branches } = useBranchesQuery();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InventoryCountCreateFormValues>({ resolver: zodResolver(inventoryCountCreateSchema) });
  const branchId = watch("branch_id");
  const { data: locations } = useLocationsQuery(branchId);
  const createCount = useCreateInventoryCount();

  const branchOptions = useMemo(() => (branches ?? []).map((b) => ({ value: String(b.id), label: b.name })), [branches]);
  const locationOptions = useMemo(() => (locations ?? []).map((l) => ({ value: String(l.id), label: l.name })), [locations]);

  async function onSubmit(values: InventoryCountCreateFormValues) {
    setApiError(null);
    try {
      await createCount.mutateAsync(values);
      onSuccess();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível abrir a contagem.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack>
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
              label="Local"
              data={locationOptions}
              error={errors.location_id?.message}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        {apiError && <Alert color="red">{apiError}</Alert>}
        <Button type="submit" loading={isSubmitting}>
          Abrir contagem
        </Button>
      </Stack>
    </form>
  );
}
