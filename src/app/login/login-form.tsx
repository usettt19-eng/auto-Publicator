"use client";

import { useActionState } from "react";
import { Button, inputClass } from "@/components/ui";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return <p className="text-sm">Revisa tu bandeja de entrada: te enviamos un enlace para entrar.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input id="email" name="email" type="email" required className={inputClass} placeholder="tu@marca.com" />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviarme un enlace de acceso"}
      </Button>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}
