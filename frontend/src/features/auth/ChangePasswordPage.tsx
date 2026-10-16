import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, PasswordInput } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { strings } from "../../shared/strings";
import { changePassword } from "./api";
import { useAuthStore } from "./store";

const copy = strings.change_password;

// Mirrors app/core/password_policy.py; the API stays the authority.
const schema = z
  .object({
    current: z.string().min(1, copy.required),
    next: z
      .string()
      .min(10, copy.too_short)
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), copy.needs_letter_and_digit),
    confirm: z.string(),
  })
  .refine((values) => values.next === values.confirm, { path: ["confirm"], message: copy.mismatch })
  .refine((values) => values.next !== values.current, { path: ["next"], message: copy.same_as_current });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setApiError(null);
    try {
      await changePassword(values.current, values.next);
      if (user) setUser({ ...user, must_change_password: false });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
    }
  }

  return (
    <section className="placeholder-page">
      <article className="placeholder-card border-gradient reveal" style={{ maxWidth: 380 }}>
        <h2>{copy.title}</h2>
        <p>{copy.subtitle}</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <PasswordInput
            label={copy.current_label}
            autoComplete="current-password"
            error={errors.current?.message}
            {...register("current")}
          />
          <PasswordInput
            label={copy.new_label}
            description={copy.rules}
            autoComplete="new-password"
            error={errors.next?.message}
            mt="sm"
            {...register("next")}
          />
          <PasswordInput
            label={copy.confirm_label}
            autoComplete="new-password"
            error={errors.confirm?.message}
            mt="sm"
            {...register("confirm")}
          />
          {apiError && (
            <Alert color="red" mt="sm">
              {apiError}
            </Alert>
          )}
          <Button type="submit" fullWidth mt="md" loading={isSubmitting}>
            {copy.submit_label}
          </Button>
          <Button type="button" variant="subtle" fullWidth mt="xs" onClick={logout}>
            {copy.logout_label}
          </Button>
        </form>
      </article>
    </section>
  );
}
