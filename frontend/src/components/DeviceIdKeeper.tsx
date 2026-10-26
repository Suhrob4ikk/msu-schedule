"use client";
import { useEffect } from "react";
import { syncDeviceId } from "@/lib/deviceId";

/** Раскладывает номер устройства по localStorage, cookie и IndexedDB (lib/deviceId.ts). Ничего не рисует. */
export default function DeviceIdKeeper() {
  useEffect(() => { void syncDeviceId(); }, []);
  return null;
}
