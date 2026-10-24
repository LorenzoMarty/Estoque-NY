import { Alert, Button, Modal, Stack, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";
import { useUpdateBranch } from "../../shared/api/catalog";
import type { Branch, OpeningHours } from "../../shared/types/stock";

const DAYS = [
  ["mon", "Segunda"],
  ["tue", "Terça"],
  ["wed", "Quarta"],
  ["thu", "Quinta"],
  ["fri", "Sexta"],
  ["sat", "Sábado"],
  ["sun", "Domingo"],
] as const;

const blank = (value: string) => value.trim() || null;

/** Edits what the public site shows for a store. Leaving "Nome público" empty unpublishes it. */
export function BranchProfileModal({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const update = useUpdateBranch(branch?.id ?? 0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branch) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const hours = Object.fromEntries(DAYS.map(([day]) => [day, blank(text(day))])) as OpeningHours;
    try {
      await update.mutateAsync({
        name: branch.name,
        public_name: blank(text("public_name")),
        address: blank(text("address")),
        phone: blank(text("phone")),
        timezone: blank(text("timezone")),
        opening_hours: Object.values(hours).some(Boolean) ? hours : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <Modal opened={Boolean(branch)} onClose={onClose} title={`Perfil público · ${branch?.name ?? ""}`}>
      {/* key remounts the uncontrolled form with the selected branch's values */}
      <form key={branch?.id} onSubmit={handleSubmit}>
        <Stack>
          <TextInput name="public_name" label="Nome público" description="Vazio = a loja não aparece no site" defaultValue={branch?.public_name ?? ""} />
          <TextInput name="address" label="Endereço" defaultValue={branch?.address ?? ""} />
          <TextInput name="phone" label="Telefone" defaultValue={branch?.phone ?? ""} />
          <TextInput name="timezone" label="Fuso horário" placeholder="America/Sao_Paulo" defaultValue={branch?.timezone ?? ""} />
          {DAYS.map(([day, label]) => (
            <TextInput key={day} name={day} label={label} placeholder="09:00-18:00 (vazio = fechado)" defaultValue={branch?.opening_hours?.[day] ?? ""} />
          ))}
          {error && <Alert color="red">{error}</Alert>}
          <Button type="submit" loading={update.isPending}>
            Salvar
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
