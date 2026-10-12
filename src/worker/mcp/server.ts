import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { and, asc, desc, gte, isNotNull, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  assistantHabit,
  assistantTask,
  buildOverview,
  filterTasks,
  matchList,
  overviewRangeError,
} from '../../shared/assistant';
import { addDays, dateInZone, isISODate } from '../../shared/dates';
import type { TaskUpdateInput } from '../../shared/schemas';
import { PRIORITIES, type HabitWithChecks, type List, type Task } from '../../shared/types';
import * as schema from '../db/schema';
import { habitChecks, habits, lists, tasks } from '../db/schema';
import type { Db, Env } from '../env';
import { createTask, loadOpenTasks, updateTask } from '../services/tasks';

/*
 * The Claude connector (SPEC §9): a stateless MCP server on /mcp. Claude can
 * read everything and create / edit tasks, but never complete or delete.
 * Task rules are the app's own (services/tasks.ts).
 */

const CONCEPTS = `How this planner works:
- Every task has a DEADLINE (the day it must be done by, always set) and an optional PLANNED DATE (the day the user intends to work on it). New tasks are unplanned unless a planned date is given. A planned date after the deadline is allowed but unusual (plannedAfterDeadline: true).
- flag: "overdue" = the deadline has passed (red, most urgent); "missed_plan" = the planned date has passed but not the deadline (orange); null = on track. Overdue tasks are never moved automatically.
- priority: "high" (2), "medium" (1), "low" (0) — the app shows the number.
- weekly: true = created by a weekly template (one task per week).
- Dates are YYYY-MM-DD in the user's time zone; every result includes "today".
- Task titles and list names are usually in Czech.`;

const INSTRUCTIONS = `${CONCEPTS}
You can read tasks, lists and habits, create tasks and edit them. You cannot complete or delete tasks, and you cannot tick habits — ask the user to do that in the app.
Deadlines and planned dates can't be set in the past.`;

const date = z
  .string()
  .refine(isISODate, 'Use a date in YYYY-MM-DD format')
  .describe('Date in YYYY-MM-DD format');

const priority = z.enum(PRIORITIES).describe('"high" (2), "medium" (1, the default) or "low" (0)');

function json(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function failure(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Runs a tool; errors from the app's rules become a readable tool error. */
async function run(action: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HTTPException) {
      const body = (await error
        .getResponse()
        .json()
        .catch(() => ({}))) as { error?: string };
      return failure(body.error ?? error.message);
    }
    throw error;
  }
}

async function loadLists(db: Db): Promise<List[]> {
  return db.select().from(lists).orderBy(asc(lists.sortOrder));
}

async function loadHabits(db: Db): Promise<HabitWithChecks[]> {
  const [rows, checks] = await db.batch([
    db.select().from(habits).orderBy(asc(habits.createdAt)),
    db.select().from(habitChecks).orderBy(asc(habitChecks.date)),
  ]);
  return rows.map((habit) => ({
    ...habit,
    checks: checks.filter((check) => check.habitId === habit.id).map((check) => check.date),
  }));
}

function buildServer(db: Db, today: string, timeZone: string): McpServer {
  const server = new McpServer(
    { name: 'planner', title: 'Planner', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );

  const view = (task: Task, all: List[]) =>
    assistantTask(task, new Map(all.map((list) => [list.id, list])), today, timeZone);

  /** Resolves a list name to its id; null = "no list". */
  async function resolveList(name: string | null | undefined): Promise<string | null | undefined> {
    if (name === undefined) return undefined;
    if (name === null) return null;
    const match = matchList(await loadLists(db), name);
    if (!match.ok) throw new HTTPException(400, { res: Response.json({ error: match.error }) });
    return match.list.id;
  }

  server.registerTool(
    'get_overview',
    {
      title: 'Overview for a date range',
      description: `Everything about a date range in one call — ideal for a weekly review or planning a week.
Returns: overdue tasks and missed plans (all, regardless of range), open tasks planned on each day, open tasks due on each day, all unplanned open tasks, tasks completed during the range, and active habits with their streaks and the days they were done in the range. At most 92 days.

${CONCEPTS}`,
      inputSchema: {
        from: date.describe('First day of the range (YYYY-MM-DD)'),
        to: date.describe('Last day of the range (YYYY-MM-DD), at most 92 days after "from"'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ from, to }) =>
      run(async () => {
        const error = overviewRangeError(from, to);
        if (error) return failure(error);
        // Completion times are UTC; widen by a day so the time-zone date filter is exact.
        const [openTasks, completedTasks, allLists, allHabits] = await Promise.all([
          loadOpenTasks(db, today),
          db
            .select()
            .from(tasks)
            .where(
              and(
                isNotNull(tasks.completedAt),
                gte(tasks.completedAt, `${addDays(from, -1)}T00:00:00.000Z`),
                lte(tasks.completedAt, `${addDays(to, 1)}T23:59:59.999Z`),
              ),
            ),
          loadLists(db),
          loadHabits(db),
        ]);
        return json(
          buildOverview({
            openTasks,
            completedTasks,
            lists: allLists,
            habits: allHabits,
            from,
            to,
            today,
            timeZone,
          }),
        );
      }),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: `List tasks with optional filters. Open tasks are sorted like the app: overdue first, then missed plans, then by deadline. Completed tasks are newest first. Each task includes its id (needed for update_task), list name, priority, deadline, planned date, flag, notes and completion date.

${CONCEPTS}`,
      inputSchema: {
        status: z
          .enum(['open', 'completed'])
          .optional()
          .describe('"open" (default) or "completed"'),
        listName: z
          .string()
          .optional()
          .describe('Only tasks in this list (name, case-insensitive)'),
        withoutList: z.boolean().optional().describe('true = only tasks that have no list'),
        deadlineFrom: date.optional().describe('Only tasks with a deadline on or after this date'),
        deadlineTo: date.optional().describe('Only tasks with a deadline on or before this date'),
        flag: z
          .enum(['overdue', 'missed_plan', 'none'])
          .optional()
          .describe('Only tasks with this flag ("none" = on track)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        if (input.listName && input.withoutList) {
          return failure('Use either listName or withoutList, not both');
        }
        const listId = input.withoutList ? null : await resolveList(input.listName);
        const allLists = await loadLists(db);
        const source =
          input.status === 'completed'
            ? await db
                .select()
                .from(tasks)
                .where(isNotNull(tasks.completedAt))
                .orderBy(desc(tasks.completedAt))
            : await loadOpenTasks(db, today);
        const result = filterTasks(source, input, listId, today);
        return json({
          today,
          timeZone,
          count: result.length,
          tasks: result.map((task) => view(task, allLists)),
        });
      }),
  );

  server.registerTool(
    'list_lists',
    {
      title: 'List lists',
      description:
        'The user’s task lists in their order, with the number of open tasks in each. Use these names for listName in other tools.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const [allLists, open] = await Promise.all([loadLists(db), loadOpenTasks(db, today)]);
        return json({
          lists: allLists.map((list) => ({
            name: list.name,
            openTasks: open.filter((task) => task.listId === list.id).length,
          })),
          openTasksWithoutList: open.filter((task) => task.listId === null).length,
        });
      }),
  );

  server.registerTool(
    'list_habits',
    {
      title: 'List habits',
      description: `The user’s habits with their frequency, current and best streak, whether they are due or done today, and weekly / monthly progress. Streaks count scheduled days (daily / set days), weeks (X× per week) or months (X× per month); a period that isn't finished yet doesn't break a streak. Archived habits are included with archived: true. Habits can't be ticked through this connector.`,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      run(async () => {
        const allHabits = await loadHabits(db);
        return json({
          today,
          habits: allHabits.map((habit) => assistantHabit(habit, today)),
        });
      }),
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create a task',
      description: `Create a task, following the app's rules: a deadline is required and can't be in the past; the task stays unplanned unless plannedDate is given (also not in the past). listName must match an existing list (case-insensitive); if it doesn't, the error lists the valid names. Omit listName for a task without a list.

${CONCEPTS}`,
      inputSchema: {
        title: z.string().trim().min(1).max(500).describe('What to do'),
        deadline: date.describe('Day it must be done by (YYYY-MM-DD, today or later)'),
        listName: z.string().optional().describe('Name of an existing list'),
        priority: priority.optional(),
        plannedDate: date
          .optional()
          .describe(
            'Day the user plans to work on it (YYYY-MM-DD, today or later); omit to leave unplanned',
          ),
        notes: z.string().max(20_000).optional().describe('Optional notes'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const listId = await resolveList(input.listName);
        const task = await createTask(db, today, {
          title: input.title,
          deadline: input.deadline,
          listId: listId ?? null,
          priority: input.priority,
          plannedDate: input.plannedDate,
          notes: input.notes,
        });
        return json({ today, created: view(task, await loadLists(db)) });
      }),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Edit a task',
      description: `Edit an open task by its id (from list_tasks or get_overview). Only the fields you pass change. A new deadline or planned date can't be in the past (an existing past date may stay as it is). Set plannedDate to null to unplan the task, listName to null to remove it from its list. Completed tasks can't be edited, and tasks can't be completed or deleted through this connector.

${CONCEPTS}`,
      inputSchema: {
        id: z.string().describe('The task id'),
        title: z.string().trim().min(1).max(500).optional(),
        notes: z.string().max(20_000).nullable().optional().describe('New notes; null clears them'),
        priority: priority.optional(),
        deadline: date.optional().describe('New deadline (YYYY-MM-DD, today or later)'),
        plannedDate: date
          .nullable()
          .optional()
          .describe('New planned date (YYYY-MM-DD, today or later); null = unplan'),
        listName: z
          .string()
          .nullable()
          .optional()
          .describe('Name of an existing list; null = no list'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ id, listName, ...fields }) =>
      run(async () => {
        const changes: TaskUpdateInput = { ...fields };
        const listId = await resolveList(listName);
        if (listId !== undefined) changes.listId = listId;
        if (Object.keys(changes).length === 0) return failure('Nothing to change');
        const task = await updateTask(db, today, id, changes);
        return json({ today, updated: view(task, await loadLists(db)) });
      }),
  );

  return server;
}

/** Handles /mcp once the OAuth provider has checked the access token. */
export const mcpHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB, { schema });
    const today = dateInZone(new Date(), env.TIMEZONE);
    const server = buildServer(db, today, env.TIMEZONE);
    // Stateless: a fresh server and transport per request, JSON responses.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
