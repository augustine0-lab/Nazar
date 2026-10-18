import { redirect } from "next/navigation";
import { currentUser, HOME_BY_ROLE } from "@/lib/session";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? HOME_BY_ROLE[user.role] : "/login");
}
