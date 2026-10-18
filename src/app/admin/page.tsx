import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { createClassAction, createStudentAction, createUserAction, linkAction, resetPasswordAction } from "@/app/actions";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";

const ROLE = { ADMIN: "администратор", TEACHER: "учитель", PARENT: "родитель", PSYCHOLOGIST: "психолог", STUDENT: "ученик" } as const;

export default async function AdminPage() {
  const user = await requireUser("ADMIN");
  const { people, classes, kids, links, assigns } = await S.schoolOverview(getDb(), user);
  const byId = new Map(people.map((p) => [p.id, p]));
  const teachers = people.filter((p) => p.role === "TEACHER");
  const parents = people.filter((p) => p.role === "PARENT");
  const psychs = people.filter((p) => p.role === "PSYCHOLOGIST");

  return (
    <Shell current="/admin">
      <h1>Школа</h1>
      <p className="muted">Администратор управляет учётными записями и связями, но не видит отметки и заметки о детях.</p>

      <section className="card">
        <h2>Ученики</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Ученик</th><th>Класс</th><th>Родители</th><th>Психолог</th></tr></thead>
            <tbody>
              {kids.map(({ student, className }) => (
                <tr key={student.id}>
                  <td>{student.displayName}</td>
                  <td>{className}</td>
                  <td>{links.filter((l) => l.studentId === student.id).map((l) => `${byId.get(l.parentId)?.name} (${l.relation})`).join(", ") || "—"}</td>
                  <td>{assigns.filter((a) => a.studentId === student.id).map((a) => byId.get(a.psychologistId)?.name).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Новый взрослый</h2>
          <ActionForm action={createUserAction} className="stack">
            <label>Имя<input name="name" required /></label>
            <label>Логин<input name="login" required autoCapitalize="none" /></label>
            <label>Роль
              <select name="role" defaultValue="PARENT">
                <option value="TEACHER">учитель</option><option value="PARENT">родитель</option><option value="PSYCHOLOGIST">психолог</option><option value="ADMIN">администратор</option>
              </select>
            </label>
            <label>Временный пароль (от 8 символов)<input name="password" type="text" minLength={8} required /></label>
            <button className="btn primary" type="submit">Создать</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>Новый ученик</h2>
          <ActionForm action={createStudentAction} className="stack">
            <label>Имя и фамилия<input name="displayName" required /></label>
            <label>Логин<input name="login" required autoCapitalize="none" /></label>
            <label>PIN из 6 цифр<input name="pin" inputMode="numeric" pattern="\d{6}" required /></label>
            <label>Год рождения<input name="birthYear" type="number" min={2005} max={2022} /></label>
            <label>Класс
              <select name="classId" required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <button className="btn primary" type="submit">Добавить</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>Связать с ребёнком</h2>
          <ActionForm action={linkAction} className="stack">
            <label>Ученик<select name="studentId">{kids.map(({ student }) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label>
            <label>Кто
              <select name="personId">
                <optgroup label="Родители">{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                <optgroup label="Психологи">{psychs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              </select>
            </label>
            <label>Связь
              <select name="kind"><option value="parent">родитель</option><option value="psych">психолог</option></select>
            </label>
            <label>Кем приходится (для родителя)<input name="relation" placeholder="мама, папа, опекун" /></label>
            <button className="btn primary" type="submit">Связать</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>Новый класс</h2>
          <ActionForm action={createClassAction} className="stack">
            <label>Название<input name="name" placeholder="2 «В»" required /></label>
            <label>Учебный год<input name="schoolYear" defaultValue="2026/2027" required /></label>
            <label>Классный руководитель
              <select name="teacherId"><option value="">не назначен</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </label>
            <button className="btn primary" type="submit">Создать</button>
          </ActionForm>
        </section>
      </div>

      <section className="card">
        <h2>Сброс пароля или PIN</h2>
        <ActionForm action={resetPasswordAction} className="form-grid">
          <label>Пользователь
            <select name="userId">{people.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role]} · {p.login}</option>)}</select>
          </label>
          <label>Новый пароль (ребёнку 6 цифр)<input name="password" required /></label>
          <button className="btn" type="submit">Сменить</button>
        </ActionForm>
      </section>
    </Shell>
  );
}
