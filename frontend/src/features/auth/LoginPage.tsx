import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, PasswordInput, TextInput } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { palette } from "../../app/theme";
import logoFull from "../../assets/brand/logo-ny.svg";
import DotGrid from "../../shared/reactbits/DotGrid";
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
    <main className="placeholder-page login-stage">
      <div className="login-backdrop">
        <DotGrid
          dotSize={5}
          gap={28}
          baseColor={palette.line}
          activeColor={palette.primary}
          proximity={140}
          shockRadius={220}
          shockStrength={3}
        />
      </div>
      <article className="placeholder-card border-gradient reveal login-card" style={{ maxWidth: 380 }}>
        <img alt="New York Free Shop" className="login-logo" height="173" src={logoFull} width="168" />
        <h1>{strings.login.title}</h1>
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
      <p className="login-credits">
        Silhueta do skyline: &ldquo;NYC Skyline Silhouette&rdquo;, de Diego Torres Silvestre, sob licen&ccedil;a{" "}
        <a href="https://creativecommons.org/licenses/by/2.0/" rel="noreferrer" target="_blank">
          CC BY 2.0
        </a>{" "}
        (
        <a
          href="https://commons.wikimedia.org/wiki/File:NYC_Skyline_Silhouette.png"
          rel="noreferrer"
          target="_blank"
        >
          Wikimedia Commons
        </a>
        ). Est&aacute;tua da Liberdade: Bea.miau,{" "}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noreferrer" target="_blank">
          CC0
        </a>
        .
      </p>
    </main>
  );
}
