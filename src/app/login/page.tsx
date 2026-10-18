import { ActionForm } from "@/components/ActionForm";
import { loginAction } from "@/app/actions";

export const metadata = { title: "Вход · Nazar" };

const DEMO = [
  ["olga", "учитель 3 «Б»"],
  ["elena", "мама Миши"],
  ["natalia", "психолог"],
  ["misha", "ученик, PIN 123456"],
  ["admin", "администратор"],
];

export default function LoginPage() {
  return (
    <main className="login">
      <div className="card">
        <h1>Nazar</h1>
        <p className="muted">Команда вокруг ребёнка. Вход для учителей, родителей, психологов и учеников.</p>
        <ActionForm action={loginAction} className="stack">
          <label>
            Логин
            <input name="login" id="login" autoComplete="username" autoCapitalize="none" required />
          </label>
          <label>
            Пароль или PIN
            <input name="password" id="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn primary" type="submit">Войти</button>
        </ActionForm>
        {process.env.NEXT_PUBLIC_DEMO !== "off" && (
          <div className="demo-logins stack muted">
            <span className="eyebrow">Демо-школа</span>
            <p>Пароль взрослых <code>demo1234</code>, PIN детей <code>123456</code>.</p>
            <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {DEMO.map(([l, who]) => <li key={l}><code>{l}</code> {who}</li>)}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
