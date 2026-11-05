/** Independent of render/picking: a completed pinch or drag can never become a tap. */
export class SelectionGesture {
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = false;
  private startTime = 0;
  private accepted = false;
  down(id: number, x: number, y: number, now: number) {
    if (!this.pointers.size) {
      this.moved = false;
      this.startTime = now;
      this.accepted = false;
    }
    this.pointers.set(id, { x, y });
    if (this.pointers.size > 1) this.moved = true;
  }
  move(id: number, x: number, y: number) {
    const start = this.pointers.get(id);
    if (start && Math.hypot(x - start.x, y - start.y) > 7) this.moved = true;
  }
  up(id: number, now: number) {
    this.accepted = this.pointers.size === 1 && !this.moved && now - this.startTime < 700;
    this.pointers.delete(id);
  }
  cancel() {
    this.pointers.clear();
    this.moved = true;
    this.accepted = false;
  }
  consume() {
    const accepted = this.accepted;
    this.accepted = false;
    return accepted;
  }
}
