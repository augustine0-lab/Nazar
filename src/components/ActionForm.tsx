"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action. Errors show under the form; successes show as a page toast (see Flash). */
export function ActionForm({ action, children, className }: { action: Action; children: React.ReactNode; className?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {state?.error && <p className="msg err" role="alert">{state.error}</p>}
    </form>
  );
}
