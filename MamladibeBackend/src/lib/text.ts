export function hasLink(value: string) {
  return /(https?:\/\/|www\.|\.[a-z]{2,}\/)/i.test(value);
}

export function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function changeRatio(left: string, right: string) {
  if (left === right) return 0;
  const longest = Math.max(left.length, right.length);
  if (!longest) return 0;
  return levenshteinDistance(left, right) / longest;
}

export function combineEditableText(value: {
  title: string;
  description: string;
  safetyTip?: string | undefined;
}) {
  return `${value.title}\n${value.description}\n${value.safetyTip ?? ""}`;
}
