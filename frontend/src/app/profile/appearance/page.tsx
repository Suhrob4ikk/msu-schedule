"use client";
/**
 * «Внешний вид» отдельным экраном, как в приложении (Кабинет → Оформление).
 * На телефоне своя шапка со стрелкой «назад», общая шапка сайта скрыта.
 */
import Link from "next/link";
import Header from "@/components/Header";
import Icon from "@/components/tablo/Icon";
import AppearanceView from "@/components/tablo/profile/AppearanceView";

export default function AppearancePage() {
  return (
    <div className="t-page">
      <Header phone={false} />
      <main className="t-main t-av-main">
        <div className="t-av-top">
          <Link href="/profile" className="t-icon-btn" aria-label="Назад, в Кабинет">
            <Icon name="arrowLeft" size={24} />
          </Link>
          <h1>Внешний вид</h1>
        </div>
        <AppearanceView />
      </main>
    </div>
  );
}
