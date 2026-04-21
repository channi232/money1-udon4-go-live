"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSession, type ServerSession } from "@/lib/auth-api";
import Image from "next/image";

export default function TopNav() {
  const [auth, setAuth] = useState<ServerSession | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSession().then((s) => {
      if (active) setAuth(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const logout = () => {
    alert("ให้ออกจากระบบผ่านหน้าต่าง Basic Auth ของเบราว์เซอร์ หรือปิดหน้าต่างทั้งหมดแล้วเปิดใหม่");
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-3 py-2 md:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-slate-900">
          {logoMissing ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-300 bg-orange-50 text-[10px] font-bold text-orange-800">
              สพป.4
            </span>
          ) : (
            <Image
              src="/org-logo.png"
              alt="โลโก้สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุดรธานี เขต 4"
              width={36}
              height={36}
              className="rounded-full border border-orange-200 bg-white object-cover"
              onError={() => setLogoMissing(true)}
              priority
            />
          )}
          <span className="hidden text-xs font-semibold leading-tight md:block">
            สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุดรธานี เขต 4
            <br />
            <span className="text-[11px] text-slate-600">สพป.อุดรธานี เขต 4</span>
          </span>
          <span className="text-sm font-semibold md:hidden">สพป.อุดรธานี เขต 4</span>
        </Link>
        <nav className="ml-2 flex min-w-0 items-center gap-0.5 whitespace-nowrap text-xs text-slate-700 md:text-sm">
          <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/money">
            การเงิน
          </Link>
          <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/slip">
            สลิป
          </Link>
          <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/tax">
            ภาษี
          </Link>
          {auth?.authenticated && auth.role === "admin" ? (
            <>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/executive">
                ผู้บริหาร
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/readiness">
                ความพร้อม
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/go-live">
                เปิดใช้งานจริง
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/go-live-day">
                วันเปิดจริง
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/uat-signoff">
                รับรองผล UAT
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/incident-log">
                เหตุการณ์
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/daily-brief">
                สรุปรายวัน
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/audit">
                บันทึก Audit
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/security">
                ความปลอดภัย
              </Link>
              <Link className="topnav-link rounded-md px-2 py-1.5 hover:bg-slate-100" href="/health">
                สุขภาพระบบ
              </Link>
            </>
          ) : null}
          {!auth?.authenticated ? (
            <Link className="rounded-md bg-blue-600 px-3 py-1.5 font-semibold text-white" href="/login">
              เข้าสู่ระบบ
            </Link>
          ) : (
            <>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">role: {auth.role}</span>
              <button
                type="button"
                className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white md:text-sm"
                onClick={logout}
              >
                ออกจากระบบ
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
