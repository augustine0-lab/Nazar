import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { StoryViewer } from "@/components/StoryViewer";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as M from "@/lib/more-services";
import { libraryStories } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function StudentStory({ params }: { params: Promise<{ sid: string }> }) {
  const user = await requireUser("STUDENT");
  const { t } = await getT();
  const { sid } = await params;
  const db = getDb();
  const me = await myStudent(db, user);
  if (!(await hasActiveConsent(db, me.id))) redirect("/student");
  const story = libraryStories().find((s) => s.id === sid) ?? (await M.storiesOf(db, user, me.id)).find((s) => s.id === sid);
  if (!story) notFound();
  return (
    <Shell current="/student/stories">
      <div className="child stack">
        <Link href="/student/stories" className="small">{t("story.back")}</Link>
        <StoryViewer title={story.title} steps={story.steps} />
      </div>
    </Shell>
  );
}
