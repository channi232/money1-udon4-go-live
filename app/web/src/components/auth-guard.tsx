"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSession, type ServerSession } from "@/lib/auth-api";

type Props = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

export default function AuthGuard({ children, allowedRoles }: Props) {
  const [auth, setAuth] = useState<ServerSession | null>(null);

  useEffect(() => {
    let active = true;
    fetchSession().then((s) => {
      if (active) setAuth(s);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!auth) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12 text-slate-600">
        กำลังตรวจสอบสิทธิ์จากเซิร์ฟเวอร์...
      </main>
    );
  }

  if (!auth.authenticated) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">หน้านี้ต้องผ่านการยืนยันตัวตนจากเซิร์ฟเวอร์ก่อนใช้งาน</p>
          <Link className="mt-2 inline-block font-semibold underline" href="/login">
            ไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </main>
    );
  }

  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900">
          <p className="font-medium">สิทธิ์ไม่เพียงพอสำหรับหน้านี้ (บทบาท: {auth.role})</p>
          <Link className="mt-2 inline-block font-semibold underline" href="/">
            กลับหน้าแรก
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
