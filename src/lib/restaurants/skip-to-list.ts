/**
 * Skip-to-list can fire while the streamed skeleton still owns `#main-content`.
 * Remember the request so RestaurantList can focus the real scroller on mount.
 */
let pendingSkipToList = false;

export function requestSkipToList() {
  pendingSkipToList = true;
}

export function consumeSkipToList(): boolean {
  const pending = pendingSkipToList;
  pendingSkipToList = false;
  return pending;
}
