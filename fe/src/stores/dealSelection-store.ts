"use client";

import { create } from "zustand";
import { toggleAll, toggleOne } from "@/lib/dealBulk";

// Selection mode of the pipeline page, shared by the board, the list view and
// the bulk action bar. Ids may outlive the deals on screen (refetch, filters),
// so readers intersect them with the board (splitSelection, selectAllState).
type DealSelectionState = {
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  enterSelection: () => void;
  // Leaves the mode and drops the selection
  exitSelection: () => void;
  // Drops the selection, the mode stays (filters, search, view changed)
  clearSelection: () => void;
  toggleDeal: (dealId: string) => void;
  // "Select all" of a column or the list: the ids visible there
  toggleDeals: (dealIds: string[]) => void;
};

const empty: ReadonlySet<string> = new Set();

export const useDealSelectionStore = create<DealSelectionState>((set) => ({
  selectionMode: false,
  selectedIds: empty,

  enterSelection: () => set({ selectionMode: true, selectedIds: empty }),

  exitSelection: () => set({ selectionMode: false, selectedIds: empty }),

  clearSelection: () =>
    set((state) => (state.selectedIds.size === 0 ? state : { selectedIds: empty })),

  toggleDeal: (dealId) =>
    set((state) => ({ selectedIds: toggleOne(state.selectedIds, dealId) })),

  toggleDeals: (dealIds) =>
    set((state) => ({ selectedIds: toggleAll(state.selectedIds, dealIds) })),
}));
