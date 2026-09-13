import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Select, Stack, Switch, Textarea, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useBrandsQuery, useCategoriesQuery } from "../../shared/api/catalog";
import type { Product } from "../../shared/types/stock";
import { useCreateProduct, useUpdateProduct } from "./api";
import { productSchema, type ProductFormValues } from "./schema";

export function ProductForm({ product, onSuccess }: { product?: Product; onSuccess: () => void }) {
  const { data: categories } = useCategoriesQuery();
  const { data: brands } = useBrandsQuery();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? undefined,
      category_id: product?.category_id ?? undefined,
      brand_id: product?.brand_id ?? undefined,
      active: product?.active ?? true,
    },
  });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? 0);

  const categoryOptions = useMemo(() => (categories ?? []).map((c) => ({ value: String(c.id), label: c.name })), [categories]);
  const brandOptions = useMemo(() => (brands ?? []).map((b) => ({ value: String(b.id), label: b.name })), [brands]);

  async function onSubmit(values: ProductFormValues) {
    setApiError(null);
    try {
      if (product) await updateProduct.mutateAsync(values);
      else await createProduct.mutateAsync(values);
      onSuccess();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack>
        <TextInput label="Nome" error={errors.name?.message} {...register("name")} />
        <Textarea label="Descrição (opcional)" {...register("description")} />
        <Controller
          name="category_id"
          control={control}
          render={({ field }) => (
            <Select
              label="Categoria (opcional)"
              data={categoryOptions}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        <Controller
          name="brand_id"
          control={control}
          render={({ field }) => (
            <Select
              label="Marca (opcional)"
              data={brandOptions}
              value={field.value != null ? String(field.value) : null}
              onChange={(value) => field.onChange(value ? Number(value) : undefined)}
            />
          )}
        />
        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <Switch label="Produto ativo" checked={field.value} onChange={(event) => field.onChange(event.currentTarget.checked)} />
          )}
        />
        {apiError && <Alert color="red">{apiError}</Alert>}
        <Button type="submit" loading={isSubmitting}>
          {product ? "Salvar alterações" : "Criar produto"}
        </Button>
      </Stack>
    </form>
  );
}
