"use client";

import { create } from "zustand";

interface AppState {
  /** Consulta de búsqueda en la landing. */
  searchQuery: string;
  /** Panel flotante de donación visible. */
  donateOpen: boolean;
  /** Diálogo de inicio de sesión / registro visible (sección PROFESIONAL). */
  authOpen: boolean;
  setSearchQuery: (q: string) => void;
  setDonateOpen: (open: boolean) => void;
  setAuthOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  searchQuery: "",
  donateOpen: false,
  authOpen: false,
  setSearchQuery: (q) => set({ searchQuery: q }),
  setDonateOpen: (open) => set({ donateOpen: open }),
  setAuthOpen: (open) => set({ authOpen: open }),
}));
