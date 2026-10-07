import { type Db, employees, onboardingItems, onboardingRuns, tasks } from "@operant/db";
import { and, count, eq, isNull, sql } from "drizzle-orm";

/**
 * Marks an onboarding step done or not done, keeping its task, its run and the
 * employee's onboarding status in step. Called from both the onboarding
 * checklist and the task (so either place can tick it).
 */
export async function setOnboardingItemDone(
  db: Db,
  itemId: string,
  done: boolean,
  userId: string,
  opts: { syncTask?: boolean } = {},
) {
  const [item] = await db
    .update(onboardingItems)
    .set(done ? { doneAt: new Date(), doneBy: userId } : { doneAt: null, doneBy: null })
    .where(eq(onboardingItems.id, itemId))
    .returning({ runId: onboardingItems.runId });
  if (!item) return { runCompleted: false };

  if (opts.syncTask !== false) {
    await db
      .update(tasks)
      .set(done ? { status: "done", completedAt: new Date() } : { status: "todo", completedAt: null })
      .where(and(eq(tasks.source, "onboarding"), eq(tasks.sourceId, itemId)));
  }

  // The run (and the employee's onboarding status) completes with its last step.
  const [left] = await db
    .select({ n: count() })
    .from(onboardingItems)
    .where(and(eq(onboardingItems.runId, item.runId), isNull(onboardingItems.doneAt)));
  const runCompleted = left?.n === 0;
  const [run] = await db
    .update(onboardingRuns)
    .set({ completedAt: runCompleted ? new Date() : null })
    .where(eq(onboardingRuns.id, item.runId))
    .returning({ employeeId: onboardingRuns.employeeId });
  if (run) {
    const [open] = await db
      .select({ n: count() })
      .from(onboardingRuns)
      .where(and(eq(onboardingRuns.employeeId, run.employeeId), isNull(onboardingRuns.completedAt)));
    await db
      .update(employees)
      .set({ status: open?.n === 0 ? "active" : "onboarding" })
      .where(and(eq(employees.id, run.employeeId), sql`${employees.status} <> 'offboarded'`));
  }
  return { runCompleted };
}
