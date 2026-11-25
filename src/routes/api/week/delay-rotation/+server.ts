import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { slotTarget } from '$lib/server/mealSlots.js';
import { delayScheduleRotation } from '$lib/server/scheduleFreeze.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { weekKeySchema, slotIdSchema } from '$lib/schemas/index.js';

const bodySchema = z.object({ weekKey: weekKeySchema, slot_id: slotIdSchema });

// Un día consolidado en el que no se comió lo programado: retrasa una semana la rotación
// de esa comida para que la receta que tocaba pase a la semana siguiente
export async function POST({ request }) {
	const body = await parseBody(request, bodySchema);
	const target = slotTarget(body.slot_id);
	if (!target) throw error(400, 'Hueco desconocido');
	delayScheduleRotation(body.weekKey, target.weekday, target.meal_type, target.is_accompaniment);
	return json({ ok: true });
}
