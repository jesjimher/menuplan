import { exportPlantoeatRecipes } from '$lib/server/recipes.js';

export async function GET() {
	const date = new Date().toISOString().slice(0, 10);
	return new Response(exportPlantoeatRecipes(), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Content-Disposition': `attachment; filename="recetas-plantoeat-${date}.txt"`
		}
	});
}
