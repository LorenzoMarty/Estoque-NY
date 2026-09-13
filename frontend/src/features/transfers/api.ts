import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import type { Transfer } from "../../shared/types/stock";
import type { TransferCreateFormValues } from "./schema";

export function useTransfersQuery() {
  return useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<Transfer>>("/stock/transfers?page=1&page_size=100&order=desc");
      return page.items;
    },
    staleTime: 10_000,
  });
}

function idempotencyHeaders() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: TransferCreateFormValues) =>
      apiClient.post<Transfer>("/stock/transfers", values, { headers: idempotencyHeaders() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transfers"] }),
  });
}

function useTransferAction(action: "ship" | "receive" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: number) =>
      apiClient.post<Transfer>(`/stock/transfers/${transferId}/${action}`, null, { headers: idempotencyHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export const useShipTransfer = () => useTransferAction("ship");
export const useReceiveTransfer = () => useTransferAction("receive");
export const useCancelTransfer = () => useTransferAction("cancel");
