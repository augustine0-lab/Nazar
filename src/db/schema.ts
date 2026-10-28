import { sqliteTable, text, integer, real, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";

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
    // Optional e-mail copies of notifications, only for adults who turn them on.
    email: text("email"),
    emailNotify: integer("email_notify", { mode: "boolean" }).notNull().default(false),
    emailLang: text("email_lang", { enum: ["ru", "kk"] }).notNull().default("ru"),
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
  // The class-wide support (UDL_SUPPORTS key) that gives every pupil the same help, if there is one.
  classSupport: text("class_support"),
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

/* ---------- visual schedule, mood, pet ---------- */

// Fixed set of pictograms; the keys are translated and drawn on screen.
export const SCHEDULE_ICONS = ["wake", "wash", "eat", "dress", "bag", "school", "walk", "homework", "play", "read", "bath", "sleep"] as const;
export type ScheduleIcon = (typeof SCHEDULE_ICONS)[number];

export const scheduleItems = sqliteTable(
  "schedule_items",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    // 1 = Monday … 7 = Sunday
    weekday: integer("weekday").notNull(),
    time: text("time").notNull(),
    title: text("title").notNull(),
    icon: text("icon", { enum: SCHEDULE_ICONS }).notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
  },
  (t) => [index("schedule_student_idx").on(t.studentId, t.weekday)],
);

export const scheduleDone = sqliteTable(
  "schedule_done",
  {
    itemId: text("item_id").notNull().references(() => scheduleItems.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    doneAt: integer("done_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.date] })],
);

export const MOOD_SLOTS = ["MORNING", "AFTER_SCHOOL"] as const;
export type MoodSlot = (typeof MOOD_SLOTS)[number];

export const moodChecks = sqliteTable(
  "mood_checks",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    slot: text("slot", { enum: MOOD_SLOTS }).notNull(),
    // 1 (very bad) … 5 (very good)
    mood: integer("mood").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mood_unique_idx").on(t.studentId, t.date, t.slot)],
);

export const PET_KINDS = ["fox", "cat", "owl", "dino"] as const;
export type PetKind = (typeof PET_KINDS)[number];

export const pets = sqliteTable("pets", {
  studentId: text("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: PET_KINDS }).notNull(),
  name: text("name").notNull(),
});

/* ---------- messages between adults, notifications ---------- */

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_student_idx").on(t.studentId, t.createdAt)],
);

export const chatReads = sqliteTable(
  "chat_reads",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.studentId] })],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studentId: text("student_id").references(() => students.id, { onDelete: "cascade" }),
    // Message key and parameters, translated when the reader opens it.
    kind: text("kind").notNull(),
    params: text("params", { mode: "json" }).$type<Record<string, string | number>>(),
    href: text("href"),
    createdAt: createdAt(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/* ---------- observation scales (teacher and parent) ---------- */

export const SCALE_ROLES = ["TEACHER", "PARENT"] as const;

export const scaleResponses = sqliteTable(
  "scale_responses",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    respondentId: text("respondent_id").notNull().references(() => users.id),
    respondentRole: text("respondent_role", { enum: SCALE_ROLES }).notNull(),
    date: text("date").notNull(),
    // 18 answers, each 0..3, in the order of SCALE_ITEMS
    answers: text("answers", { mode: "json" }).$type<number[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("scale_student_idx").on(t.studentId, t.date)],
);

/* ---------- social stories (custom ones; the library lives in code) ---------- */

export const stories = sqliteTable("stories", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // [{ icon, text }]
  steps: text("steps", { mode: "json" }).$type<{ icon: string; text: string }[]>().notNull(),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

/* ---------- evening bag checklist ---------- */

export const bagItems = sqliteTable("bag_items", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  icon: text("icon").notNull(),
  position: integer("position").notNull(),
});

export const bagDone = sqliteTable(
  "bag_done",
  {
    itemId: text("item_id").notNull().references(() => bagItems.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.date] })],
);

/* ---------- the big goal a child saves stars for ---------- */

export const goalPins = sqliteTable("goal_pins", {
  studentId: text("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  rewardId: text("reward_id").notNull().references(() => rewards.id, { onDelete: "cascade" }),
  setById: text("set_by_id").notNull().references(() => users.id),
});

/* ---------- goals proposed by a parent or teacher for the psychologist ---------- */

export const PROPOSAL_STATUS = ["PROPOSED", "ADOPTED", "DISMISSED"] as const;

export const goalProposals = sqliteTable("goal_proposals", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  adultText: text("adult_text").notNull(),
  childText: text("child_text").notNull(),
  place: text("place", { enum: GOAL_PLACE }).notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status", { enum: PROPOSAL_STATUS }).notNull().default("PROPOSED"),
  createdAt: createdAt(),
});

/* ---------- sleep and medication diary (only when a parent turns it on) ---------- */

export const healthSettings = sqliteTable("health_settings", {
  studentId: text("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  changedById: text("changed_by_id").notNull().references(() => users.id),
  changedAt: integer("changed_at", { mode: "timestamp_ms" }).notNull(),
});

export const MEDICATION = ["TAKEN", "SKIPPED", "NONE"] as const;
export type Medication = (typeof MEDICATION)[number];

export const healthLogs = sqliteTable(
  "health_logs",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    sleepHours: real("sleep_hours"),
    medication: text("medication", { enum: MEDICATION }),
    authorId: text("author_id").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("health_unique_idx").on(t.studentId, t.date)],
);

/* ---------- outgoing e-mail ---------- */

export const OUTBOX_STATUS = ["PENDING", "SENT", "FAILED"] as const;

export const emailOutbox = sqliteTable("email_outbox", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: OUTBOX_STATUS }).notNull().default("PENDING"),
  error: text("error"),
  createdAt: createdAt(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
});

/* ---------- trying one technique at a time: the team compares days before and during ---------- */

export const TRIAL_STATUS = ["RUNNING", "DONE"] as const;
export const TRIAL_DECISION = ["KEEP", "DROP"] as const;
export type TrialDecision = (typeof TRIAL_DECISION)[number];

export const trials = sqliteTable(
  "trials",
  {
    id: id(),
    studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    techniqueId: text("technique_id").notNull().references(() => techniques.id),
    // The goal being watched (goals.lineage_id); null means all school goals together.
    lineageId: text("lineage_id"),
    // What exactly the adults do differently, in their words.
    howTo: text("how_to").notNull().default(""),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", { enum: TRIAL_STATUS }).notNull().default("RUNNING"),
    decision: text("decision", { enum: TRIAL_DECISION }),
    conclusion: text("conclusion"),
    authorId: text("author_id").notNull().references(() => users.id),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("trials_student_idx").on(t.studentId, t.startDate)],
);

/* ---------- transition passport: what a new teacher should know on day one ---------- */

export const passports = sqliteTable("passports", {
  studentId: text("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  strengths: text("strengths").notNull().default(""),
  interests: text("interests").notNull().default(""),
  helps: text("helps").notNull().default(""),
  hard: text("hard").notNull().default(""),
  calming: text("calming").notNull().default(""),
  family: text("family").notNull().default(""),
  updatedById: text("updated_by_id").notNull().references(() => users.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/* ---------- the class as a whole: universal supports and the lesson board ---------- */

export const classSupports = sqliteTable(
  "class_supports",
  {
    classId: text("class_id").notNull().references(() => classGroups.id, { onDelete: "cascade" }),
    support: text("support").notNull(),
    enabledById: text("enabled_by_id").notNull().references(() => users.id),
    enabledAt: integer("enabled_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.support] })],
);

export const classBoards = sqliteTable("class_boards", {
  classId: text("class_id").primaryKey().references(() => classGroups.id, { onDelete: "cascade" }),
  // [{ icon, text, minutes }]
  steps: text("steps", { mode: "json" }).$type<{ icon: string; text: string; minutes: number }[]>().notNull(),
  updatedById: text("updated_by_id").notNull().references(() => users.id),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
