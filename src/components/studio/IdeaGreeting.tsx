"use client";

import { useEffect, useState } from "react";

// "Good morning" follows the viewer's own clock, so it is worked out in the browser.
export default function IdeaGreeting({ name, posted }: { name: string; posted: boolean }) {
  const [hello, setHello] = useState("Hello");
  useEffect(() => {
    const h = new Date().getHours();
    setHello(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <p className="lab" id="greet" style={{ fontSize: "1.1rem", marginBottom: ".75rem" }}>
      {hello}
      {name ? `, ${name}` : ""}. {posted ? "You have already posted today." : "You have not posted today yet."}
    </p>
  );
}
