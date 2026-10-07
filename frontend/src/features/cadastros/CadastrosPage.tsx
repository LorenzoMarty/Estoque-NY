import { Tabs } from "@mantine/core";
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
import { PageHeader } from "../../shared/ui/PageHeader";
import { strings } from "../../shared/strings";
import { LocationsTab } from "./LocationsTab";
import { NameOnlyTab } from "./NameOnlyTab";

export function CadastrosPage() {
  const branchesQuery = useBranchesQuery();
  const brandsQuery = useBrandsQuery();

  return (
    <div className="workspace-page">
      <PageHeader title={strings.nav.cadastros} subtitle="Marcas, filiais e locais do estoque" />

      <Tabs className="workspace-tabs" defaultValue="brands" variant="pills">
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
          />
        </Tabs.Panel>

        <Tabs.Panel value="locations" pt="md">
          <LocationsTab />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
