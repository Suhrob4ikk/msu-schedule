"use client";
import { useEffect } from "react";
import { syncDeviceId } from "@/lib/deviceId";
import { noteSurveyDay } from "@/lib/survey";

/** Раскладывает номер устройства по localStorage, cookie и IndexedDB (lib/deviceId.ts) и отмечает день захода
 *  для опроса (lib/survey.ts). Ничего не рисует. */
export default function DeviceIdKeeper() {
  useEffect(() => { void syncDeviceId(); noteSurveyDay(); }, []);
  return null;
}
