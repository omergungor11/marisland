/** Click vs drag filter (TASK-162): moved < 6 px and held < 300 ms. */
export const CLICK_MAX_MOVE_PX = 6;
export const CLICK_MAX_MS = 300;

export function isClick(
  downX: number,
  downY: number,
  upX: number,
  upY: number,
  dtMs: number,
): boolean {
  return Math.hypot(upX - downX, upY - downY) < CLICK_MAX_MOVE_PX && dtMs < CLICK_MAX_MS;
}
