// Whether the child's background sound plays right now, shared by the player and the focus timer on one page.
// Browser-only state; the timer stores it with each self-check, so the experiment compares like with like.
let playing = false;
export const setNoisePlaying = (on: boolean) => {
  playing = on;
};
export const isNoisePlaying = () => playing;
