import { json } from "@sveltejs/kit";
import { g as getAllMembers, c as createMember } from "../../../../chunks/members.js";
async function GET() {
  return json(getAllMembers());
}
async function POST({ request }) {
  const body = await request.json();
  const member = createMember({
    name: body.name,
    cannot_eat: body.cannot_eat || "",
    likes: body.likes || "",
    dislikes: body.dislikes || ""
  });
  return json(member, { status: 201 });
}
export {
  GET,
  POST
};
