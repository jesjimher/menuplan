import { json } from "@sveltejs/kit";
import { g as getOptions, s as setOptions } from "../../../../chunks/options.js";
async function GET() {
  return json(getOptions());
}
async function PUT({ request }) {
  const body = await request.json();
  return json(setOptions(body));
}
export {
  GET,
  PUT
};
