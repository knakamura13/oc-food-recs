import type { RestaurantData } from "./types";
import type { UrlStateSnapshot } from "./url-state";
import type { WireDataset } from "./wire";

/** Resolved home-page payload after the streamed dataset promise settles, decoded for the explorer. */
export interface ExplorerPageData {
  dataset: RestaurantData;
  urlState: Partial<UrlStateSnapshot>;
  pageOrigin: string;
}

/** What the server streams: the compact wire dataset (decoded form also accepted). */
export interface WireExplorerPageData extends Omit<ExplorerPageData, "dataset"> {
  dataset: RestaurantData | WireDataset;
}
