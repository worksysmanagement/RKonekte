import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function AdminSubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role === "SUPER_ADMIN") {
    redirect("/super-admin/organizations");
  }
  redirect("/admin/dashboard");
  return children;
}
