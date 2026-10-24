import { Button, Tabs } from "@mantine/core";
import { Globe } from "lucide-react";
import { useState } from "react";
import {
  useBranchesQuery,
  useBrandsQuery,
  useCreateBranch,
  useCreateBrand,
  useDeleteBranch,
  useDeleteBrand,
  useUpdateBranch,
  useUpdateBrand,
} from "../../shared/api/catalog";
import type { Branch } from "../../shared/types/stock";
import { PageHeader } from "../../shared/ui/PageHeader";
import { strings } from "../../shared/strings";
import { BranchProfileModal } from "./BranchProfileModal";
import { LocationsTab } from "./LocationsTab";
import { NameOnlyTab } from "./NameOnlyTab";

export function CadastrosPage() {
  const branchesQuery = useBranchesQuery();
  const brandsQuery = useBrandsQuery();
  const [profileBranch, setProfileBranch] = useState<Branch | null>(null);

  return (
    <div className="workspace-page">
      <PageHeader title={strings.nav.cadastros} subtitle="Marcas, filiais e locais do estoque" />

      <Tabs defaultValue="brands" variant="pills">
        <Tabs.List>
          <Tabs.Tab value="brands">Marcas</Tabs.Tab>
          <Tabs.Tab value="branches">Filiais</Tabs.Tab>
          <Tabs.Tab value="locations">Locais</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="brands" pt="md">
          <NameOnlyTab
            label="Marca"
            newLabel="Nova marca"
            query={brandsQuery}
            useCreate={useCreateBrand}
            useUpdate={useUpdateBrand}
            useDelete={useDeleteBrand}
          />
        </Tabs.Panel>

        <Tabs.Panel value="branches" pt="md">
          <NameOnlyTab
            label="Filial"
            newLabel="Nova filial"
            query={branchesQuery}
            useCreate={useCreateBranch}
            useUpdate={useUpdateBranch}
            useDelete={useDeleteBranch}
            renderRowActions={(branch) => (
              <Button size="xs" variant="subtle" leftSection={<Globe size={14} />} onClick={() => setProfileBranch(branch)}>
                Perfil público
              </Button>
            )}
          />
          <BranchProfileModal branch={profileBranch} onClose={() => setProfileBranch(null)} />
        </Tabs.Panel>

        <Tabs.Panel value="locations" pt="md">
          <LocationsTab />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
