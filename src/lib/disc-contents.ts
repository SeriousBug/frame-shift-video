import type { DiscContents } from '@/types/discs';

/** The words for the Filed list: "Movie · 3 trailers · 2 featurettes", or "" when there is nothing. */
export function describeContents(contents: DiscContents): string {
  const part = (count: number, one: string, many: string) =>
    count > 0 ? [`${count} ${count === 1 ? one : many}`] : [];
  return [
    ...(contents.movie ? ['Movie'] : []),
    ...part(contents.episodes, 'episode', 'episodes'),
    ...part(
      contents.alternates,
      'other version of the movie',
      'other versions of the movie',
    ),
    ...part(contents.trailers, 'trailer', 'trailers'),
    ...part(contents.featurettes, 'featurette', 'featurettes'),
    ...part(contents.extras, 'other extra', 'other extras'),
    ...part(
      contents.copies,
      'copy of the movie left out',
      'copies of the movie left out',
    ),
  ].join(' · ');
}
