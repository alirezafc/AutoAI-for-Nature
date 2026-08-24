import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin-login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <Suspense fallback={null}>
      <AdminLoginForm from={from} />
    </Suspense>
  );
}
