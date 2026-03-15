import { json } from "@sveltejs/kit";
import { g as getAllRules, c as createRule } from "../../../../chunks/rules.js";
async function GET() {
  return json(getAllRules());
}
async function POST({ request }) {
  const body = await request.json();
  const rule = createRule({
    tag: body.tag,
    direction: body.direction,
    times: body.times
  });
  return json(rule, { status: 201 });
}
export {
  GET,
  POST
};
