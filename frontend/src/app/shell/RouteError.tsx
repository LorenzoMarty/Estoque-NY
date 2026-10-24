import { Alert, Button, Stack } from "@mantine/core";

/** Shown when a route fails to load, typically a lazy chunk missing after a deploy or a flaky network. */
export function RouteError() {
  return (
    <Stack p="xl" maw={480} mx="auto" mt="xl">
      <Alert color="red" title="Não foi possível carregar esta tela">
        Pode ter saído uma versão nova ou a conexão falhou. Recarregue a página.
      </Alert>
      <Button onClick={() => window.location.reload()}>Recarregar</Button>
    </Stack>
  );
}
