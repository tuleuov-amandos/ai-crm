"use client";

import { create } from "zustand";
import { BoardColumn, DealCard } from "@/lib/validations/deals.schema";
import {
  moveDealBetweenColumns,
  removeDealFromColumns,
  reorderDealInColumn,
  replaceDeal,
  rollbackDealMove,
} from "./dealBoard";

// Selector helpers; derive them with useMemo, a zustand selector that returns
// a new array on every call re-renders forever.
export { getAllDeals, findColumnByDealId } from "./dealBoard";

type PipelineState = {
  // Board columns from GET /deals/board, one per tenant stage in stage order.
  columns: BoardColumn[];
  isLoading: boolean;
  error: string | null;
} & PipelineActions;

// Stage arguments are PipelineStage ids. An unknown id is ignored.
type PipelineActions = {
  setBoard: (columns: BoardColumn[]) => void;
  moveDeal: (dealId: string, fromStageId: string, toStageId: string) => void;
  rollbackMoveDeal: (dealId: string, fromStageId: string, toStageId: string) => void;
  // Reorder in same column (sort)
  reorderDeal: (stageId: string, fromIndex: number, toIndex: number) => void;
  updateDeal: (deal: DealCard) => void;
  removeDeal: (dealId: string, stageId?: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const useDealPipelineStore = create<PipelineState>((set) => ({
  columns: [],
  isLoading: false,
  error: null,

  setBoard: (columns) => set({ columns }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  // Optimistic update: move deal immediately on UI
  moveDeal: (dealId, fromStageId, toStageId) =>
    set((state) => ({
      columns: moveDealBetweenColumns(state.columns, dealId, fromStageId, toStageId),
    })),

  // Rollback: undo moveDeal when API fails
  rollbackMoveDeal: (dealId, fromStageId, toStageId) =>
    set((state) => ({
      columns: rollbackDealMove(state.columns, dealId, fromStageId, toStageId),
    })),

  // Update deal in the column that holds it
  updateDeal: (deal) =>
    set((state) => ({ columns: replaceDeal(state.columns, deal) })),

  // Delete deal from its column (optimistic soft delete)
  removeDeal: (dealId, stageId) =>
    set((state) => ({
      columns: removeDealFromColumns(state.columns, dealId, stageId),
    })),

  reorderDeal: (stageId, fromIndex, toIndex) =>
    set((state) => ({
      columns: reorderDealInColumn(state.columns, stageId, fromIndex, toIndex),
    })),
}));
