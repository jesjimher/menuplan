import { json } from "@sveltejs/kit";
import { d as copyPreviousWeek } from "../../../../../chunks/weekplan.js";
import { g as getWeekKey, a as getPreviousWeekKey } from "../../../../../chunks/dates.js";
async function POST({ request }) {
  const body = await request.json();
  const weekKey = body.weekKey || getWeekKey();
  const previousWeekKey = getPreviousWeekKey(weekKey);
  copyPreviousWeek(weekKey, previousWeekKey);
  return json({ ok: true });
}
export {
  POST
};
