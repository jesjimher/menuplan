import { json } from "@sveltejs/kit";
import { c as clearWeek } from "../../../../../chunks/weekplan.js";
import { g as getWeekKey } from "../../../../../chunks/dates.js";
async function POST({ request }) {
  const body = await request.json();
  const weekKey = body.weekKey || getWeekKey();
  clearWeek(weekKey);
  return json({ ok: true });
}
export {
  POST
};
