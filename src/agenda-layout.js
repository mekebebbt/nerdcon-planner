export const isOfficeHours = stage => stage?.name?.trim().toLowerCase() === 'office hours';

// Bonus events have their own section and must retain their stage for the public feed.
export const isTimetableStage = stage => stage.display_group !== 'bonus';

export function parallelTimeBlocks(stage) {
  if (!isOfficeHours(stage)) {
    return [735, 780, 825, 870, 915].map((start, i) => ({
      start, end: start + 40, label: `Block ${i + 1}`,
    }));
  }
  const minutes = time => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };
  const open = minutes(stage.open_from);
  const close = minutes(stage.open_until);
  return Array.from({ length: Math.max(0, Math.floor((close - open) / 60)) }, (_, i) => ({
    start: open + i * 60, end: open + (i + 1) * 60, label: `Block ${i + 1}`,
  }));
}
