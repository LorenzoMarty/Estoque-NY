import { Badge, Select } from "@mantine/core";
import { Store } from "lucide-react";
import { useActiveBranch } from "./useActiveBranch";

export function BranchSwitcher() {
  const { branches, active, canConsolidate, select, ready } = useActiveBranch();
  if (!ready) return null;
  if (branches.length === 0) {
    return (
      <Badge color="yellow" variant="light" title="Peça a um administrador para atribuir filiais ao seu usuário">
        Sem filiais atribuídas
      </Badge>
    );
  }

  const data = [
    ...(canConsolidate ? [{ value: "all", label: "Todas as filiais" }] : []),
    ...branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
  ];

  return (
    <Select
      aria-label="Filial ativa"
      size="xs"
      w={190}
      leftSection={<Store size={14} />}
      data={data}
      value={active === null ? null : String(active)}
      allowDeselect={false}
      readOnly={branches.length === 1 && !canConsolidate}
      onChange={(value) => {
        if (value === "all") select("all");
        else if (value) select(Number(value));
      }}
    />
  );
}
