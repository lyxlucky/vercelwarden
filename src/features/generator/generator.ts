import { EFFLongWordList } from "@/features/generator/eff-word-list";

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  special: boolean;
  minimumUppercase: number;
  minimumLowercase: number;
  minimumNumbers: number;
  minimumSpecial: number;
  avoidAmbiguous: boolean;
}

export interface PassphraseGeneratorOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

const AMBIGUOUS = new Set("Il1O0o|`'\"".split(""));
const GROUPS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  special: "!@#$%^&*()-_=+[]{};:,.?/",
};

function randomIndex(length: number) {
  if (!Number.isInteger(length) || length <= 0) throw new Error("Random source cannot be empty.");
  const maximum = 0x1_0000_0000 - (0x1_0000_0000 % length);
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0]! >= maximum);
  return buffer[0]! % length;
}

function pick(source: string) {
  return source[randomIndex(source.length)]!;
}

function shuffle(values: string[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
  return values;
}

function charset(source: string, avoidAmbiguous: boolean) {
  return avoidAmbiguous ? [...source].filter((character) => !AMBIGUOUS.has(character)).join("") : source;
}

export function generatePassword(options: PasswordGeneratorOptions) {
  if (!Number.isInteger(options.length) || options.length < 5 || options.length > 256) throw new Error("Password length must be between 5 and 256.");
  const enabled = (["uppercase", "lowercase", "numbers", "special"] as const).filter((group) => options[group]);
  if (enabled.length === 0) throw new Error("Enable at least one character group.");
  const minimums = {
    uppercase: options.minimumUppercase,
    lowercase: options.minimumLowercase,
    numbers: options.minimumNumbers,
    special: options.minimumSpecial,
  };
  for (const minimum of Object.values(minimums)) if (!Number.isInteger(minimum) || minimum < 0) throw new Error("Minimum counts cannot be negative.");
  const required = enabled.reduce((total, group) => total + minimums[group], 0);
  if (required > options.length) throw new Error("Minimum character counts exceed password length.");
  const pools = Object.fromEntries(enabled.map((group) => [group, charset(GROUPS[group], options.avoidAmbiguous)])) as Partial<Record<typeof enabled[number], string>>;
  const all = enabled.map((group) => pools[group]!).join("");
  const result: string[] = [];
  for (const group of enabled) for (let count = 0; count < minimums[group]; count += 1) result.push(pick(pools[group]!));
  while (result.length < options.length) result.push(pick(all));
  return shuffle(result).join("");
}

export function generatePassphrase(options: PassphraseGeneratorOptions) {
  if (!Number.isInteger(options.words) || options.words < 3 || options.words > 20) throw new Error("Passphrase word count must be between 3 and 20.");
  if ([...options.separator].length > 1) throw new Error("Passphrase separator must be one character or empty.");
  const words = Array.from({ length: options.words }, () => EFFLongWordList[randomIndex(EFFLongWordList.length)]!);
  if (options.capitalize) for (let index = 0; index < words.length; index += 1) words[index] = words[index]![0]!.toUpperCase() + words[index]!.slice(1);
  if (options.includeNumber) {
    const index = randomIndex(words.length);
    words[index] = `${words[index]}${randomIndex(10)}`;
  }
  return words.join(options.separator);
}

export function passwordStrength(value: string, alphabetSize?: number) {
  const inferred = alphabetSize ?? [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].reduce((total, pattern, index) => total + (pattern.test(value) ? [26, 26, 10, 32][index]! : 0), 0);
  const entropy = value.length * Math.log2(Math.max(inferred, 1));
  const score = entropy < 40 ? 0 : entropy < 60 ? 1 : entropy < 80 ? 2 : 3;
  return { entropy, score, label: (["弱", "一般", "良好", "强"] as const)[score]! };
}

export const defaultPasswordOptions: PasswordGeneratorOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  special: true,
  minimumUppercase: 1,
  minimumLowercase: 1,
  minimumNumbers: 1,
  minimumSpecial: 1,
  avoidAmbiguous: true,
};

export const defaultPassphraseOptions: PassphraseGeneratorOptions = {
  words: 6,
  separator: "-",
  capitalize: false,
  includeNumber: true,
};
