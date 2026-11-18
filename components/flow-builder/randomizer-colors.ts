/** Variation letter colours exactly as ManyChat's Aleatorizador uses them (A, B, C…). */
export const RANDOMIZER_COLORS = [
  "rgb(127, 83, 224)",
  "rgb(187, 79, 0)",
  "rgb(171, 62, 193)",
  "rgb(3, 126, 103)",
  "rgb(0, 107, 226)",
  "rgb(213, 43, 13)",
  "rgb(90, 122, 3)",
  "rgb(171, 62, 193)",
  "rgb(12, 129, 67)",
  "rgb(0, 107, 226)",
  "rgb(22, 122, 143)",
];

export const randomizerColor = (i: number) => RANDOMIZER_COLORS[i % RANDOMIZER_COLORS.length];
export const randomizerLetter = (i: number) => String.fromCharCode(65 + (i % 26));
