import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const requireAuthUser = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
};
