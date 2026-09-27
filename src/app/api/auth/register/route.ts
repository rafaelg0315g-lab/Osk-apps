import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Registro de cuentas para la sección PROFESIONAL (login ligero). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Ingresa un correo electrónico válido." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese correo. Inicia sesión en su lugar." },
        { status: 409 },
      );
    }

    const hash = await bcrypt.hash(password, 10);
    await db.user.create({ data: { email, name: name || null, password: hash } });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[register] error:", err);
    return NextResponse.json(
      { error: "No pudimos crear tu cuenta. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
