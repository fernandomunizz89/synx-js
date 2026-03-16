import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { synxCyan, synxPurple, synxSuccess, themedPromptMessage } from "./synx-ui.js";

export interface SelectOption<T> {
  value: T;
  label: string;
  description?: string;
}

function inInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

const SYNX_PROMPT_THEME: Record<string, unknown> = {
  icon: {
    cursor: synxCyan("▸"),
    checked: synxSuccess("●"),
    unchecked: synxPurple("○"),
  },
};

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
    message: themedPromptMessage(message),
    theme: SYNX_PROMPT_THEME as never,
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
    message: themedPromptMessage(message),
    theme: SYNX_PROMPT_THEME as never,
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
    const value = (await input({ message: themedPromptMessage(message), theme: SYNX_PROMPT_THEME as never })).trim();
    if (value) return value;
    console.log(synxCyan("Please enter a value to continue."));
  }
}

export async function promptTextWithDefault(message: string, defaultValue: string, fallbackValue?: string): Promise<string> {
  if (!inInteractiveTerminal()) {
    if (fallbackValue?.trim()) return fallbackValue.trim();
    if (defaultValue.trim()) return defaultValue.trim();
    throw new Error(`${message} requires an interactive terminal. Please pass explicit command options instead.`);
  }

  const value = (await input({
    message: themedPromptMessage(message),
    default: defaultValue,
    theme: SYNX_PROMPT_THEME as never,
  })).trim();
  return value || defaultValue.trim();
}

export async function confirmAction(message: string, defaultValue = false): Promise<boolean> {
  if (!inInteractiveTerminal()) return defaultValue;
  return confirm({ message: themedPromptMessage(message), default: defaultValue, theme: SYNX_PROMPT_THEME as never });
}

export function canPromptInteractively(): boolean {
  return inInteractiveTerminal();
}
