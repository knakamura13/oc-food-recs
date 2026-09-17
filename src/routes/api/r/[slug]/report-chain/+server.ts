import { json } from '@sveltejs/kit';
import { reportRestaurantAsChain } from '$lib/server/restaurants/admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const result = await reportRestaurantAsChain(params.slug ?? '');
	if (result === 'not_found') {
		return json({ result }, { status: 404 });
	}
	return json({ result });
};
