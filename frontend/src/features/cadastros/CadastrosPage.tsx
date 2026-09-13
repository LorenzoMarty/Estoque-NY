import { Tabs, Text, Title } from "@mantine/core";
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
import { strings } from "../../shared/strings";
import { LocationsTab } from "./LocationsTab";
import { NameOnlyTab } from "./NameOnlyTab";

export function CadastrosPage() {
  const branchesQuery = useBranchesQuery();
  const brandsQuery = useBrandsQuery();

  return (
    <div>
      <Title order={2} mb={4}>
        {strings.nav.cadastros}
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        Marcas, filiais e locais do estoque
      </Text>

      <Tabs defaultValue="brands">
        <Tabs.List>
          <Tabs.Tab value="brands">Marcas</Tabs.Tab>
          <Tabs.Tab value="branches">Filiais</Tabs.Tab>
          <Tabs.Tab value="locations">Locais</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="brands" pt="md">
          <NameOnlyTab
            label="Marca"
            query={brandsQuery}
            useCreate={useCreateBrand}
            useUpdate={useUpdateBrand}
            useDelete={useDeleteBrand}
          />
        </Tabs.Panel>

        <Tabs.Panel value="branches" pt="md">
          <NameOnlyTab
            label="Filial"
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
