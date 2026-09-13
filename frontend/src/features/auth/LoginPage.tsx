import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { strings } from "../../shared/strings";
import { login } from "./api";
import { useAuthStore } from "./store";

const loginSchema = z.object({
  email: z.string().email(strings.login.invalid_email),
  password: z.string().min(8, strings.login.invalid_password),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setApiError(null);
    try {
      const user = await login(values.email, values.password);
      setUser(user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Nao foi possivel concluir o login.");
    }
  }

  return (
    <section className="placeholder-page">
      <article className="placeholder-card border-gradient reveal" style={{ maxWidth: 380 }}>
        <h2>{strings.login.title}</h2>
        <p>{strings.login.subtitle}</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextInput
            label={strings.login.email_label}
            autoComplete="username"
            error={errors.email?.message}
            {...register("email")}
          />
          <PasswordInput
            label={strings.login.password_label}
            autoComplete="current-password"
            error={errors.password?.message}
            mt="sm"
            {...register("password")}
          />
          {apiError && (
            <Alert color="red" mt="sm">
              {apiError}
            </Alert>
          )}
          <Button type="submit" fullWidth mt="md" loading={isSubmitting}>
            {strings.login.submit_label}
          </Button>
        </form>
      </article>
    </section>
  );
}
