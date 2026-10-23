import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { createClassAction, createStudentAction, createUserAction, linkAction, moveStudentAction, resetPasswordAction } from "@/app/actions";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import { getT } from "@/lib/i18n/server";

export default async function AdminPage() {
  const user = await requireUser("ADMIN");
  const { t, L } = await getT();
  const { people, classes, kids, links, assigns } = await S.schoolOverview(getDb(), user);
  const byId = new Map(people.map((p) => [p.id, p]));
  const teachers = people.filter((p) => p.role === "TEACHER");
  const parents = people.filter((p) => p.role === "PARENT");
  const psychs = people.filter((p) => p.role === "PSYCHOLOGIST");

  return (
    <Shell current="/admin">
      <h1>{t("nav.school")}</h1>
      <p className="muted">{t("ad.intro")}</p>

      <section className="card">
        <h2>{t("ad.students")}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("ad.col.student")}</th><th>{t("ad.col.class")}</th><th>{t("ad.col.parents")}</th><th>{t("ad.col.psych")}</th></tr></thead>
            <tbody>
              {kids.map(({ student, className }) => (
                <tr key={student.id}>
                  <td>{student.displayName}</td>
                  <td>{className}</td>
                  <td>{links.filter((l) => l.studentId === student.id).map((l) => `${L(byId.get(l.parentId)?.name ?? "")} (${L(l.relation)})`).join(", ") || "—"}</td>
                  <td>{assigns.filter((a) => a.studentId === student.id).map((a) => L(byId.get(a.psychologistId)?.name ?? "")).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>{t("ad.newAdult")}</h2>
          <ActionForm action={createUserAction} className="stack">
            <label>{t("ad.name")}<input name="name" required /></label>
            <label>{t("ad.login")}<input name="login" required autoCapitalize="none" /></label>
            <label>{t("ad.role")}
              <select name="role" defaultValue="PARENT">
                <option value="TEACHER">{t("role.TEACHER")}</option><option value="PARENT">{t("role.PARENT")}</option><option value="PSYCHOLOGIST">{t("role.PSYCHOLOGIST")}</option><option value="ADMIN">{t("role.ADMIN")}</option>
              </select>
            </label>
            <label>{t("ad.tempPw")}<input name="password" type="text" minLength={8} required /></label>
            <button className="btn primary" type="submit">{t("ad.create")}</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>{t("ad.newStudent")}</h2>
          <ActionForm action={createStudentAction} className="stack">
            <label>{t("ad.fullName")}<input name="displayName" required /></label>
            <label>{t("ad.login")}<input name="login" required autoCapitalize="none" /></label>
            <label>{t("ad.pin")}<input name="pin" inputMode="numeric" pattern="\d{6}" required /></label>
            <label>{t("ad.birthYear")}<input name="birthYear" type="number" min={2005} max={2022} /></label>
            <label>{t("ad.class")}
              <select name="classId" required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <button className="btn primary" type="submit">{t("ad.add")}</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>{t("ad.link")}</h2>
          <ActionForm action={linkAction} className="stack">
            <label>{t("ad.student")}<select name="studentId">{kids.map(({ student }) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label>
            <label>{t("ad.who")}
              <select name="personId">
                <optgroup label={t("ad.parentsGroup")}>{parents.map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}</optgroup>
                <optgroup label={t("ad.psychsGroup")}>{psychs.map((p) => <option key={p.id} value={p.id}>{L(p.name)}</option>)}</optgroup>
              </select>
            </label>
            <label>{t("ad.kind")}
              <select name="kind"><option value="parent">{t("ad.kindParent")}</option><option value="psych">{t("ad.kindPsych")}</option></select>
            </label>
            <label>{t("ad.relation")}<input name="relation" placeholder={t("ad.relationPh")} /></label>
            <button className="btn primary" type="submit">{t("ad.linkBtn")}</button>
          </ActionForm>
        </section>

        <section className="card">
          <h2>{t("ad.newClass")}</h2>
          <ActionForm action={createClassAction} className="stack">
            <label>{t("ad.className")}<input name="name" placeholder="2 «В»" required /></label>
            <label>{t("ad.year")}<input name="schoolYear" defaultValue="2026/2027" required /></label>
            <label>{t("ad.homeroom")}
              <select name="teacherId"><option value="">{t("ad.none")}</option>{teachers.map((tc) => <option key={tc.id} value={tc.id}>{L(tc.name)}</option>)}</select>
            </label>
            <button className="btn primary" type="submit">{t("ad.create")}</button>
          </ActionForm>
        </section>
      </div>

      <section className="card">
        <h2>{t("ad.move")}</h2>
        <p className="muted small">{t("ad.moveHint")}</p>
        <ActionForm action={moveStudentAction} className="form-grid">
          <label>{t("ad.student")}<select name="studentId">{kids.map(({ student, className }) => <option key={student.id} value={student.id}>{student.displayName} · {className}</option>)}</select></label>
          <label>{t("ad.moveTo")}<select name="classId">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <button className="btn primary" type="submit">{t("ad.moveBtn")}</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>{t("ad.reset")}</h2>
        <ActionForm action={resetPasswordAction} className="form-grid">
          <label>{t("ad.user")}
            <select name="userId">{people.map((p) => <option key={p.id} value={p.id}>{L(p.name)} · {t(`role.${p.role}`)} · {p.login}</option>)}</select>
          </label>
          <label>{t("ad.newPw")}<input name="password" required /></label>
          <button className="btn" type="submit">{t("ad.change")}</button>
        </ActionForm>
      </section>
    </Shell>
  );
}
