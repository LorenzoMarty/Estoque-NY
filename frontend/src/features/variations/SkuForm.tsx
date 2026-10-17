import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, NumberInput, Select, Stack, Switch, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useProductsQuery } from "../products/api";
import type { Sku } from "../../shared/types/stock";
import { useCreateSku, useUpdateSku } from "./api";
import { SKU_ORIGINS, skuCreateSchema, skuUpdateSchema, type SkuCreateFormValues } from "./schema";

export function SkuForm({ sku, onSuccess }: { sku?: Sku; onSuccess: () => void }) {
  const { data: products } = useProductsQuery({});
  const [apiError, setApiError] = useState<string | null>(null);
  const isEditing = Boolean(sku);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SkuCreateFormValues>({
    resolver: zodResolver(skuCreateSchema),
    defaultValues: {
      product_id: sku?.product_id,
      sku_code: sku?.sku_code ?? "",
      name: sku?.name ?? undefined,
      barcode: sku?.barcode ?? undefined,
      unit: sku?.unit ?? "UN",
      cost: sku ? Number(sku.cost) : 0,
      price: sku ? Number(sku.price) : 0,
      ncm: sku?.ncm ?? null,
      origin: sku?.origin ?? null,
      restricted: sku?.restricted ?? false,
      active: sku?.active ?? true,
    },
  });

  const createSku = useCreateSku();
  const updateSku = useUpdateSku(sku?.id ?? 0);

  const productOptions = useMemo(() => (products ?? []).map((p) => ({ value: String(p.id), label: p.name })), [products]);

  async function onSubmit(values: SkuCreateFormValues) {
    setApiError(null);
    try {
      if (isEditing) await updateSku.mutateAsync(skuUpdateSchema.parse(values));
      else await createSku.mutateAsync(values);
      onSuccess();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível salvar a variação.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack>
        {!isEditing && (
          <Controller
            name="product_id"
            control={control}
            render={({ field }) => (
              <Select
                label="Produto"
                data={productOptions}
                error={errors.product_id?.message}
                value={field.value != null ? String(field.value) : null}
                onChange={(value) => field.onChange(value ? Number(value) : undefined)}
              />
            )}
          />
        )}
        {!isEditing && <TextInput label="Código (SKU)" error={errors.sku_code?.message} {...register("sku_code")} />}
        <TextInput label="Nome (opcional)" {...register("name")} />
        <TextInput label="Código de barras (opcional)" {...register("barcode")} />
        <TextInput label="Unidade" error={errors.unit?.message} {...register("unit")} />
        <Controller
          name="cost"
          control={control}
          render={({ field }) => (
            <NumberInput label="Custo" decimalScale={2} min={0} value={field.value} onChange={(value) => field.onChange(Number(value) || 0)} />
          )}
        />
        <Controller
          name="price"
          control={control}
          render={({ field }) => (
            <NumberInput label="Preço" decimalScale={2} min={0} value={field.value} onChange={(value) => field.onChange(Number(value) || 0)} />
          )}
        />
        <Controller
          name="ncm"
          control={control}
          render={({ field }) => (
            <TextInput
              label="NCM (opcional)"
              description="8 dígitos, sem pontos."
              maxLength={8}
              error={errors.ncm?.message}
              value={field.value ?? ""}
              onChange={(event) => field.onChange(event.currentTarget.value.trim() || null)}
            />
          )}
        />
        <Controller
          name="origin"
          control={control}
          render={({ field }) => (
            <Select
              label="Origem (opcional)"
              data={SKU_ORIGINS.map((o) => ({ value: o.value, label: o.label }))}
              clearable
              value={field.value ?? null}
              onChange={(value) => field.onChange(value ?? null)}
            />
          )}
        />
        <Controller
          name="restricted"
          control={control}
          render={({ field }) => (
            <Switch
              label="Mercadoria proibida ou restrita"
              description="Não pode ficar ativa. NCM do capítulo 71 também não."
              checked={field.value}
              onChange={(event) => field.onChange(event.currentTarget.checked)}
            />
          )}
        />
        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <Switch label="Variação ativa" checked={field.value} onChange={(event) => field.onChange(event.currentTarget.checked)} />
          )}
        />
        {apiError && <Alert color="red">{apiError}</Alert>}
        <Button type="submit" loading={isSubmitting}>
          {isEditing ? "Salvar alterações" : "Criar variação"}
        </Button>
      </Stack>
    </form>
  );
}
