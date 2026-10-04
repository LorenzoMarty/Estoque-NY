import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import { REORDER_POINT } from "../../shared/stock";
import type {
  Branch,
  Category,
  InventoryCount,
  Location,
  Product,
  Sku,
  StockBalance,
  StockMove,
  Transfer,
} from "../../shared/types/stock";
import type { DashboardData, DashboardItem } from "./kpis";

function withPaging(path: string, pageSize: number): string {
  return `${path}${path.includes("?") ? "&" : "?"}page=1&page_size=${pageSize}`;
}

async function fetchPaginated<T>(path: string, pageSize: number): Promise<T[]> {
  const page = await apiClient.get<Paginated<T>>(withPaging(path, pageSize));
  return page.items;
}

export interface DashboardQueryData extends DashboardData {
  branches: Branch[];
  locations: Location[];
  skus: Sku[];
  products: Product[];
  categories: Category[];
}

export function useDashboardQuery() {
  return useQuery<DashboardQueryData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [branches, locations, balances, moves, skus, transfers, counts, products, categories] = await Promise.all([
        fetchPaginated<Branch>("/branches", 200),
        fetchPaginated<Location>("/locations", 200),
        fetchPaginated<StockBalance>("/stock/balances?order=desc", 200),
        fetchPaginated<StockMove>("/stock/moves?order=desc", 200),
        fetchPaginated<Sku>("/catalog/skus?order=asc", 200),
        fetchPaginated<Transfer>("/stock/transfers?order=desc", 50),
        fetchPaginated<InventoryCount>("/stock/inventory-counts?order=desc", 50),
        fetchPaginated<Product>("/catalog/products?order=asc", 200),
        fetchPaginated<Category>("/catalog/categories?order=asc", 200),
      ]);

      const itemsById = new Map<number, DashboardItem>();
      skus.forEach((sku) => {
        itemsById.set(sku.id, { id: sku.id, reorder_point: REORDER_POINT, active: sku.active });
      });
      [...balances, ...moves].forEach((row) => {
        if (!itemsById.has(row.sku_id)) {
          itemsById.set(row.sku_id, { id: row.sku_id, reorder_point: REORDER_POINT, active: true });
        }
      });

      return { branches, locations, balances, moves, transfers, counts, itemsById, skus, products, categories };
    },
    staleTime: 30_000,
  });
}
