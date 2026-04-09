const c = (code: number) => (text: string) => `\x1b[${code}m${text}\x1b[0m`;

const primary = c(32);

export const theme = {
  primary,
  error: c(31),
  warning: c(33),
  muted: c(90),
  bold: c(1),
};
