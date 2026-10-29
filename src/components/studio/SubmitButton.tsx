"use client";

import { useFormStatus } from "react-dom";

// A button that says what is happening while its form's server action runs.
export default function SubmitButton({ children, busy, className }: { children: React.ReactNode; busy: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? busy : children}
    </button>
  );
}
