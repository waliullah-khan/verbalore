"use client";

import { useState } from "react";

// A password box with a show/hide switch. The password only ever goes to the sign-in action.
export default function PasswordField({ id = "password", name = "password", autoComplete }: { id?: string; name?: string; autoComplete: "new-password" | "current-password" }) {
  const [shown, setShown] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input id={id} name={name} type={shown ? "text" : "password"} required minLength={8} maxLength={72} autoComplete={autoComplete} className="lf" style={{ paddingRight: "4.6rem" }} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: ".5rem", top: "50%", transform: "translateY(-50%)", border: 0, background: "none", fontWeight: 700, cursor: "pointer", color: "var(--ink2)", padding: ".4rem .6rem" }}
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
