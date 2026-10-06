"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { status: "error", message: "Introduce un email válido" };

  const next = String(formData.get("next") ?? "/dashboard");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? (await headers()).get("origin") ?? "";
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: callback.toString() },
  });
  if (error) return { status: "error", message: error.message };
  return { status: "sent" };
}
