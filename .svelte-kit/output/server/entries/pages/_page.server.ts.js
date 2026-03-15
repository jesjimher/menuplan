import { redirect } from "@sveltejs/kit";
function load() {
  throw redirect(302, "/week");
}
export {
  load
};
