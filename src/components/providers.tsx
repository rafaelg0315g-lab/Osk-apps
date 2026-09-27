"use client";

import { SessionProvider } from "next-auth/react";

/** Provee el contexto de sesión (NextAuth) a toda la aplicación. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
