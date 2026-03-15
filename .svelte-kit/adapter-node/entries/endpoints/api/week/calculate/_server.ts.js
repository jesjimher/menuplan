import { json } from "@sveltejs/kit";
import { a as getWeekData } from "../../../../../chunks/weekplan.js";
import { c as calculatePlan } from "../../../../../chunks/planner.js";
import { g as getWeekKey } from "../../../../../chunks/dates.js";
async function POST({ request }) {
  const body = await request.json();
  const weekKey = body.weekKey || getWeekKey();
  const weekData = getWeekData(weekKey);
  const slotsToFill = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const config = weekData.configs[weekday];
    for (const mealType of ["comida", "cena"]) {
      const mealConfig = config[mealType];
      for (let slotIdx = 0; slotIdx < mealConfig.recipe_count; slotIdx++) {
        const existing = weekData.slots.find(
          (s) => s.weekday === weekday && s.meal_type === mealType && s.slot_index === slotIdx && s.is_accompaniment === 0
        );
        if (!existing || !existing.recipe) {
          slotsToFill.push({ weekday, meal_type: mealType, slot_index: slotIdx, is_accompaniment: 0, member_id: null });
        }
        if (mealConfig.accompaniment_per_recipe > 0) {
          for (let aIdx = 0; aIdx < mealConfig.accompaniment_per_recipe; aIdx++) {
            const existingAcc = weekData.slots.find(
              (s) => s.weekday === weekday && s.meal_type === mealType && s.slot_index === slotIdx * mealConfig.accompaniment_per_recipe + aIdx && s.is_accompaniment === 1
            );
            if (!existingAcc || !existingAcc.recipe) {
              slotsToFill.push({
                weekday,
                meal_type: mealType,
                slot_index: slotIdx * mealConfig.accompaniment_per_recipe + aIdx,
                is_accompaniment: 1,
                member_id: null
              });
            }
          }
        }
      }
      if (mealConfig.accompaniment_per_slot > 0) {
        for (let aIdx = 0; aIdx < mealConfig.accompaniment_per_slot; aIdx++) {
          const existingAcc = weekData.slots.find(
            (s) => s.weekday === weekday && s.meal_type === mealType && s.slot_index === aIdx && s.is_accompaniment === 1
          );
          if (!existingAcc || !existingAcc.recipe) {
            slotsToFill.push({ weekday, meal_type: mealType, slot_index: aIdx, is_accompaniment: 1, member_id: null });
          }
        }
      }
    }
  }
  calculatePlan(weekKey, slotsToFill, weekData.slots);
  return json(getWeekData(weekKey));
}
export {
  POST
};
