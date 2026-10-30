import { redirect } from "next/navigation";

// The Rewards page became the Team screen, which is where the badges and the prize box live now.
export default function Rewards() {
  redirect("/team");
}
