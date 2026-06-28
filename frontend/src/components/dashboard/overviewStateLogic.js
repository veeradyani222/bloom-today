export function getMomOverviewState(data) {
  return data?.current ? 'content' : 'empty';
}
