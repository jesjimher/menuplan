import { json } from "@sveltejs/kit";
import { g as getHistory } from "../../../../chunks/weekplan.js";
async function GET() {
  return json(getHistory());
}
export {
  GET
};
