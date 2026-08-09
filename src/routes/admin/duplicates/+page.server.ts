import { fail } from "@sveltejs/kit";
import {
  dismissDuplicateCandidate,
  loadDuplicateQueue,
  mergeRestaurants,
} from "$lib/server/restaurants/admin";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const duplicates = await loadDuplicateQueue(200);
  return { duplicates };
};

export const actions: Actions = {
  mergeRestaurants: async ({ request }) => {
    const form = await request.formData();
    const winnerId = Number(form.get("winnerId"));
    const loserId = Number(form.get("loserId"));
    if (
      !Number.isFinite(winnerId) ||
      winnerId <= 0 ||
      !Number.isFinite(loserId) ||
      loserId <= 0
    ) {
      return fail(400, {
        error: "Invalid restaurant ids.",
        action: "mergeRestaurants",
      });
    }
    try {
      await mergeRestaurants(winnerId, loserId);
      return {
        success: true,
        action: "mergeRestaurants",
        message: "Restaurants merged.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Merge failed.";
      return fail(400, { error: message, action: "mergeRestaurants" });
    }
  },

  keepSeparate: async ({ request }) => {
    const form = await request.formData();
    const restaurantId = Number(form.get("restaurantId"));
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
      return fail(400, {
        error: "Invalid restaurant id.",
        action: "keepSeparate",
      });
    }
    try {
      await dismissDuplicateCandidate(restaurantId);
      return {
        success: true,
        action: "keepSeparate",
        message: "Restaurant restored to the public site.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restore failed.";
      return fail(400, { error: message, action: "keepSeparate" });
    }
  },
};
