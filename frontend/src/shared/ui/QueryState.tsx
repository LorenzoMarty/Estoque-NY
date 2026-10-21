import { Alert, Button, Group, Loader, Text } from "@mantine/core";
import type { ReactNode } from "react";

export interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  /** Shown instead of children when the query succeeded with no rows. */
  isEmpty?: boolean;
  errorMessage: string;
  emptyMessage?: string;
  /** Renders a "Tentar novamente" button in the error state. */
  onRetry?: () => void;
  children: ReactNode;
}

/** Single place for the loading / error (with retry) / empty / content states of a query. */
export function QueryState({ isLoading, isError, isEmpty, errorMessage, emptyMessage, onRetry, children }: QueryStateProps) {
  if (isLoading) {
    return (
      <Group justify="center" mt="xl" role="status" aria-live="polite">
        <Loader aria-hidden />
        <Text size="sm" c="dimmed">
          Carregando...
        </Text>
      </Group>
    );
  }
  if (isError) {
    return (
      <Alert color="red" mt="xl" role="alert" title={errorMessage}>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
      </Alert>
    );
  }
  if (isEmpty) {
    return (
      <Text c="dimmed" ta="center" py="xl" role="status">
        {emptyMessage ?? "Nenhum registro encontrado."}
      </Text>
    );
  }
  return <>{children}</>;
}
