"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminBroadcastRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/exchanges");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-slate-400 font-['Poppins',sans-serif]">
      Redirection vers les Échanges administratifs...
    </div>
  );
}
