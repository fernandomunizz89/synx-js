import { checkbox, confirm, input, select } from "@inquirer/prompts";

export interface SelectOption<T> {
  value: T;
  label: string;
  description?: string;
}

function inInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function selectOption<T>(
  message: string,
  options: SelectOption<T>[],
  fallbackValue?: T
): Promise<T> {
  if (!inInteractiveTerminal()) {
    if (fallbackValue !== undefined) return fallbackValue;
    throw new Error(`${message} requires an interactive terminal. Please rerun this command in a terminal session.`);
  }

  return select<T>({
    message,
    choices: options.map((option) => ({
      value: option.value,
      name: option.label,
      description: option.description,
    })),
  });
}

export async function selectMany<T>(
  message: string,
  options: SelectOption<T>[],
  fallbackValues: T[] = []
): Promise<T[]> {
  if (!inInteractiveTerminal()) return fallbackValues;

  const selected = await checkbox<T>({
    message,
    choices: options.map((option) => ({
      value: option.value,
      name: option.label,
      description: option.description,
      checked: fallbackValues.includes(option.value),
    })),
    required: true,
  });

  return selected;
}

export async function promptRequiredText(message: string, fallbackValue?: string): Promise<string> {
  if (!inInteractiveTerminal()) {
    if (fallbackValue?.trim()) return fallbackValue.trim();
    throw new Error(`${message} requires an interactive terminal. Please pass explicit command options instead.`);
  }

  while (true) {
    const value = (await input({ message })).trim();
    if (value) return value;
    console.log("Please enter a value to continue.");
  }
}

export async function promptTextWithDefault(message: string, defaultValue: string, fallbackValue?: string): Promise<string> {
  if (!inInteractiveTerminal()) {
    if (fallbackValue?.trim()) return fallbackValue.trim();
    if (defaultValue.trim()) return defaultValue.trim();
    throw new Error(`${message} requires an interactive terminal. Please pass explicit command options instead.`);
  }

  const value = (await input({ message, default: defaultValue })).trim();
  return value || defaultValue.trim();
}

export async function confirmAction(message: string, defaultValue = false): Promise<boolean> {
  if (!inInteractiveTerminal()) return defaultValue;
  return confirm({ message, default: defaultValue });
}

export function canPromptInteractively(): boolean {
  return inInteractiveTerminal();
}
