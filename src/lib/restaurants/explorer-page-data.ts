import type { PageMeta } from "./page-meta";
import type { RestaurantData } from "./types";
import type { UrlStateSnapshot } from "./url-state";

/** Resolved home-page payload after the streamed dataset promise settles. */
export interface ExplorerPageData {
  dataset: RestaurantData;
  urlState: Partial<UrlStateSnapshot>;
  pageMeta: PageMeta;
  pageOrigin: string;
}
