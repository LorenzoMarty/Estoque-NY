import { Alert, Button, Checkbox, Modal, Stack, Textarea } from "@mantine/core";
import { useState, type FormEvent } from "react";
import type { Product } from "../../shared/types/stock";
import { useArchiveProduct } from "./api";

/** Archives a product (and its variations). With stock on hand it asks for a reason and an explicit force. */
export function ArchiveProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const archive = useArchiveProduct();
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason("");
    setForce(false);
    setNeedsForce(false);
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    setError(null);
    try {
      await archive.mutateAsync({ id: product.id, reason: reason.trim() || undefined, force });
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível arquivar.";
      if (message.includes("units on hand")) setNeedsForce(true);
      setError(message);
    }
  }

  return (
    <Modal opened={Boolean(product)} onClose={close} title={`Arquivar ${product?.name ?? ""}`}>
      <form onSubmit={handleSubmit}>
        <Stack>
          <Textarea
            label={needsForce ? "Motivo" : "Motivo (opcional)"}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={255}
          />
          {needsForce && (
            <Checkbox
              label="Arquivar mesmo com estoque (exige motivo)"
              checked={force}
              onChange={(event) => setForce(event.currentTarget.checked)}
            />
          )}
          {error && <Alert color={needsForce ? "yellow" : "red"}>{error}</Alert>}
          <Button type="submit" color="red" loading={archive.isPending} disabled={needsForce && (!force || !reason.trim())}>
            Arquivar
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
