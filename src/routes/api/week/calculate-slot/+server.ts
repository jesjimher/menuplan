import { json, error } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan } from '$lib/server/planner.js';
import { resolveSlotId, getSlotVersion } from '$lib/server/mealSlots.js';
import { parseTags } from '$lib/utils/parseTags.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { calculateSlotBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, calculateSlotBodySchema);
	const { weekKey } = body;

	const slotId = resolveSlotId(weekKey, body.slot_id);
	const version = getSlotVersion(slotId, weekKey);
	if (!version) throw error(400, 'El hueco no existe esa semana');

	const weekData = getWeekData(weekKey);
	const isAcc = version.kind === 'acc' ? 1 : 0;
	calculatePlan(weekKey, [{
		weekday: version.weekday,
		meal_type: version.meal_type,
		slot_id: slotId,
		is_accompaniment: isAcc,
		required_tags: parseTags(version.tags)
	}], weekData.slots);

	const filledSlot = getWeekData(weekKey).slots.find(s => s.slot_id === slotId);
	return json({ recipe: filledSlot?.recipe ?? null, slot_id: slotId });
}
