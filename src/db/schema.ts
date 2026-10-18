import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

export const ROLES = ["ADMIN", "TEACHER", "PARENT", "PSYCHOLOGIST", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export const schools = sqliteTable("schools", {
  id: id(),
  name: text("name").notNull(),
  // JSON array of lesson start times, e.g. ["08:30","09:25"]
  bellSchedule: text("bell_schedule", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    schoolId: text("school_id").notNull().references(() => schools.id),
    login: text("login").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_login_idx").on(t.login)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const classGroups = sqliteTable("class_groups", {
  id: id(),
  schoolId: text("school_id").notNull().references(() => schools.id),
  name: text("name").notNull(),
  schoolYear: text("school_year").notNull(),
  teacherId: text("teacher_id").references(() => users.id),
});

export const students = sqliteTable("students", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  classId: text("class_id").notNull().references(() => classGroups.id),
  displayName: text("display_name").notNull(),
  birthYear: integer("birth_year"),
  createdAt: createdAt(),
});

export const guardianships = sqliteTable(
  "guardianships",
  {
    parentId: text("parent_id").notNull().references(() => users.id),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
  },
  (t) => [primaryKey({ columns: [t.parentId, t.studentId] })],
);

export const psychAssignments = sqliteTable(
  "psych_assignments",
  {
    psychologistId: text("psychologist_id").notNull().references(() => users.id),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.psychologistId, t.studentId] })],
);

export const consents = sqliteTable("consents", {
  id: id(),
  parentId: text("parent_id").notNull().references(() => users.id),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  textVersion: text("text_version").notNull(),
  givenAt: integer("given_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

export const PLAN_STATUS = ["DRAFT", "PENDING", "ACTIVE", "ARCHIVED"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export const supportPlans = sqliteTable(
  "support_plans",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status", { enum: PLAN_STATUS }).notNull(),
    thresholdPct: integer("threshold_pct").notNull().default(70),
    workMinutes: integer("work_minutes").notNull().default(10),
    breakMinutes: integer("break_minutes").notNull().default(3),
    // First school day the plan applies to (YYYY-MM-DD); set on approval.
    effectiveFrom: text("effective_from"),
    authorId: text("author_id").notNull().references(() => users.id),
    approvedById: text("approved_by_id").references(() => users.id),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plans_student_version_idx").on(t.studentId, t.version)],
);

export const GOAL_PLACE = ["SCHOOL", "HOME"] as const;
export type GoalPlace = (typeof GOAL_PLACE)[number];

export const goals = sqliteTable("goals", {
  id: id(),
  planId: text("plan_id").notNull().references(() => supportPlans.id, { onDelete: "cascade" }),
  // Stays the same when a goal is carried into a new plan version, so history charts stay continuous.
  lineageId: text("lineage_id").notNull(),
  adultText: text("adult_text").notNull(),
  childText: text("child_text").notNull(),
  place: text("place", { enum: GOAL_PLACE }).notNull().default("SCHOOL"),
  position: integer("position").notNull(),
});

export const MARK_VALUES = ["YES", "NO", "NA"] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

export const marks = sqliteTable(
  "marks",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    goalId: text("goal_id").notNull().references(() => goals.id),
    date: text("date").notNull(),
    // 1..N for school lessons, 0 for home goals
    lessonNo: integer("lesson_no").notNull(),
    value: text("value", { enum: MARK_VALUES }).notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("marks_unique_idx").on(t.studentId, t.date, t.lessonNo, t.goalId),
    index("marks_student_date_idx").on(t.studentId, t.date),
  ],
);

export const dayNotes = sqliteTable(
  "day_notes",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    text: text("text").notNull().default(""),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("day_notes_unique_idx").on(t.studentId, t.date, t.authorId)],
);

export const rewards = sqliteTable("rewards", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  cost: integer("cost").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const REQUEST_STATUS = ["PENDING", "GRANTED", "DECLINED"] as const;

export const rewardRequests = sqliteTable("reward_requests", {
  id: id(),
  rewardId: text("reward_id").notNull().references(() => rewards.id),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status", { enum: REQUEST_STATUS }).notNull(),
  // Cost is copied at grant time so later price changes don't rewrite history.
  costAtGrant: integer("cost_at_grant"),
  decidedById: text("decided_by_id").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const homework = sqliteTable("homework", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const homeworkSteps = sqliteTable("homework_steps", {
  id: id(),
  homeworkId: text("homework_id").notNull().references(() => homework.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  position: integer("position").notNull(),
  doneAt: integer("done_at", { mode: "timestamp_ms" }),
});

export const selfChecks = sqliteTable(
  "self_checks",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    homeworkId: text("homework_id").references(() => homework.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    onTask: integer("on_task", { mode: "boolean" }).notNull(),
    starAwarded: integer("star_awarded", { mode: "boolean" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("self_checks_student_date_idx").on(t.studentId, t.date)],
);

export const EVIDENCE = ["STRONG", "MODERATE", "PRACTICE"] as const;
export type Evidence = (typeof EVIDENCE)[number];

export const techniques = sqliteTable("techniques", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  evidence: text("evidence", { enum: EVIDENCE }).notNull(),
  source: text("source"),
});

export const planTechniques = sqliteTable(
  "plan_techniques",
  {
    planId: text("plan_id").notNull().references(() => supportPlans.id, { onDelete: "cascade" }),
    techniqueId: text("technique_id").notNull().references(() => techniques.id),
  },
  (t) => [primaryKey({ columns: [t.planId, t.techniqueId] })],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").notNull().references(() => users.id),
    studentId: text("student_id"),
    action: text("action").notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
    at: createdAt(),
  },
  (t) => [index("audit_student_idx").on(t.studentId)],
);
