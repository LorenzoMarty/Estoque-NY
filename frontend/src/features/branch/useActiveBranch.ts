import { create } from "zustand";
import { useBranchesQuery } from "../../shared/api/catalog";

const STORAGE_KEY = "estoque.activeBranch";

type Selection = number | "all" | null; // null = the user never chose

function readStored(): Selection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "all") return "all";
    const id = Number(raw);
    return raw !== null && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null; // storage can be blocked (private mode); the selection then lasts for the session
  }
}

interface BranchState {
  selected: Selection;
  select: (value: number | "all") => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  selected: typeof window === "undefined" ? null : readStored(),
  select: (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* see readStored */
    }
    set({ selected: value });
  },
}));

/**
 * The branch the whole app is working on.
 *
 * The API only returns the branches the user may use, so a stored choice that is no
 * longer allowed is ignored. Users with two or more branches may also pick "all"
 * (consolidated view), which is also their default.
 */
export function useActiveBranch() {
  const { data: branches, isLoading } = useBranchesQuery();
  const selected = useBranchStore((state) => state.selected);
  const select = useBranchStore((state) => state.select);

  const list = branches ?? [];
  const canConsolidate = list.length > 1;
  const allowed = new Set(list.map((branch) => branch.id));

  let active: number | "all" | null;
  if (selected === "all" && canConsolidate) active = "all";
  else if (typeof selected === "number" && allowed.has(selected)) active = selected;
  else active = canConsolidate ? "all" : (list[0]?.id ?? null);

  return {
    branches: list,
    isLoading,
    /** False until the user's branches arrived; queries that depend on the branch should wait. */
    ready: !isLoading,
    active,
    /** The chosen branch id, or undefined for the consolidated view / nothing available. */
    branchId: typeof active === "number" ? active : undefined,
    canConsolidate,
    select,
  };
}
