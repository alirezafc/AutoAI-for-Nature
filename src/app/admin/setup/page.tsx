import { Suspense } from "react";
import { AdminSetupForm } from "@/components/admin-setup-form";

export default function AdminSetupPage() {
  return (
    <Suspense fallback={null}>
      <AdminSetupForm />
    </Suspense>
  );
}
