import { json } from "@sveltejs/kit";
import { a as getWeekData } from "../../../../chunks/weekplan.js";
import { g as getWeekKey } from "../../../../chunks/dates.js";
async function GET({ url }) {
  const weekKey = url.searchParams.get("weekKey") || getWeekKey();
  return json(getWeekData(weekKey));
}
export {
  GET
};
