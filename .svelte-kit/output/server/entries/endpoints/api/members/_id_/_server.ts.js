import { json, error } from "@sveltejs/kit";
import { d as deleteMember, a as getMemberById, u as updateMember } from "../../../../../chunks/members.js";
async function GET({ params }) {
  const member = getMemberById(parseInt(params.id));
  if (!member) throw error(404, "Member not found");
  return json(member);
}
async function PUT({ params, request }) {
  const body = await request.json();
  const member = updateMember(parseInt(params.id), body);
  if (!member) throw error(404, "Member not found");
  return json(member);
}
async function DELETE({ params }) {
  deleteMember(parseInt(params.id));
  return json({ ok: true });
}
export {
  DELETE,
  GET,
  PUT
};
