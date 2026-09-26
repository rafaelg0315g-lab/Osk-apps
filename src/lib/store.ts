"use client";

import { create } from "zustand";

interface AppState {
  /** Id de la herramienta activa (null = home). */
  activeToolId: string | null;
  /** Consulta de búsqueda en la landing. */
  searchQuery: string;
  /** Panel flotante de donación visible. */
  donateOpen: boolean;
  openTool: (id: string) => void;
  goHome: () => void;
  setSearchQuery: (q: string) => void;
  setDonateOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeToolId: null,
  searchQuery: "",
  donateOpen: false,
  openTool: (id) => set({ activeToolId: id, searchQuery: "" }),
  goHome: () => set({ activeToolId: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setDonateOpen: (open) => set({ donateOpen: open }),
}));
