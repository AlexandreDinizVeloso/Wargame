const goldFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const manpowerFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
export const goldNumber = (value: number) => goldFormat.format(Number.isFinite(value) ? value : 0);
export const manpowerNumber = (value: number) =>
  manpowerFormat.format(Number.isFinite(value) ? value : 0);
