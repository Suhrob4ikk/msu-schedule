// Фото профиля (владелец, 29 окт 2026: студент подсказал в опросе/сообщении «поменять фотографию (иконку)»).
// Хранится ТОЛЬКО в браузере человека (localStorage), на сервер не уходит: так мы не копим чужие лица и не
// отвечаем за их содержимое. Выбранная картинка обрезается по центру до квадрата и уменьшается до 192 px
// (JPEG, ≈10–15 КБ) — localStorage не раздувается. Показывается вместо буквы в кружке в шапке и в Кабинете.
// На другом устройстве фото нужно выбрать заново.

import { useEffect, useState } from "react";

export const PHOTO_KEY = "profile_photo";
const SIZE = 192;
const EVENT = "profile-photo";

export function readPhoto(): string | null {
  try { return localStorage.getItem(PHOTO_KEY); } catch { return null; }
}

export function removePhoto(): void {
  try { localStorage.removeItem(PHOTO_KEY); } catch { /* приватный режим */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Фото из выбранного файла: квадрат по центру, 192 px, JPEG. Бросает ошибку с понятным текстом. */
export async function savePhoto(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("Выберите картинку");
  if (file.size > 25 * 1024 * 1024) throw new Error("Файл слишком большой");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Не удалось открыть картинку"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("Не удалось открыть картинку");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось обработать картинку");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    const data = canvas.toDataURL("image/jpeg", 0.82);
    try { localStorage.setItem(PHOTO_KEY, data); } catch { throw new Error("Не удалось сохранить фото: нет места в браузере"); }
    window.dispatchEvent(new Event(EVENT));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Текущее фото; обновляется, когда его сменили или убрали (в этой вкладке или в другой). */
export function usePhoto(): string | null {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setPhoto(readPhoto());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener("storage", read); };
  }, []);
  return photo;
}
