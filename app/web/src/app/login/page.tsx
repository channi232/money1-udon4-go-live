"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSession, type ServerSession } from "@/lib/auth-api";
import Image from "next/image";

export default function LoginPage() {
  const [session, setSession] = useState<ServerSession | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);

  const refresh = async () => {
    const s = await fetchSession();
    setSession(s);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-6xl items-center px-6 py-12 md:px-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          {logoMissing ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-300 bg-orange-50 text-[10px] font-bold text-orange-800">
              สพป.4
            </span>
          ) : (
            <Image
              src="/org-logo.png"
              alt="โลโก้ สพป.อุดรธานี เขต 4"
              width={36}
              height={36}
              className="rounded-full border border-orange-200 bg-white object-cover"
              onError={() => setLogoMissing(true)}
            />
          )}
          <span className="text-xs font-semibold text-slate-700">ระบบงานภายในหน่วยงาน</span>
        </div>
        <h1 className="text-2xl font-bold">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-xs text-slate-500">
          สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุดรธานี เขต 4 (สพป.อุดรธานี เขต 4)
        </p>
        <p className="mt-2 text-sm text-slate-600">
          ระบบนี้ใช้การยืนยันตัวตนจากเซิร์ฟเวอร์ (Basic Auth) และอ่าน session ผ่าน API
        </p>
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          หากคุณเข้าหน้านี้ได้ แปลว่าผ่านชั้น Basic Auth แล้ว จากนั้นระบบจะกำหนดบทบาทตามบัญชีผู้ใช้ที่เซิร์ฟเวอร์ตั้งไว้
        </p>

        <div className="mt-6 space-y-3">
          {!session ? (
            <p className="text-sm text-slate-600">กำลังตรวจสอบ session...</p>
          ) : session.authenticated ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              ยืนยันตัวตนแล้ว: {session.username} (role: {session.role})
            </div>
          ) : (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              ยังไม่พบ session ที่ยืนยันตัวตนจากเซิร์ฟเวอร์
            </div>
          )}

          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            onClick={refresh}
          >
            ตรวจสอบ session ใหม่
          </button>

          <Link className="ml-2 inline-block rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800" href="/">
            กลับหน้าแรก
          </Link>
        </div>
      </section>
    </main>
  );
}
