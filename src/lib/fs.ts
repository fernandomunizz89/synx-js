import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeTextAtomicInternal(filePath: string, value: string): Promise<void> {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const tempPath = path.join(dirPath, `.${baseName}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, value, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.copyFile(tempPath, filePath);
    await fs.unlink(tempPath).catch(() => undefined);
    if (error && typeof error === "object" && "code" in error) {
      const code = String((error as { code?: unknown }).code || "");
      if (code) return;
    }
    return;
  }
}

export async function writeText(filePath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeTextAtomicInternal(filePath, value);
}

export async function appendText(filePath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, value, "utf8");
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomicInternal(filePath, JSON.stringify(value, null, 2) + "\n");
}

export async function listDirectories(rootPath: string): Promise<string[]> {
  const items = await fs.readdir(rootPath, { withFileTypes: true });
  return items.filter((x) => x.isDirectory()).map((x) => x.name).sort();
}

export async function listFiles(rootPath: string): Promise<string[]> {
  const items = await fs.readdir(rootPath, { withFileTypes: true });
  return items.filter((x) => x.isFile()).map((x) => x.name).sort();
}

export async function moveFile(fromPath: string, toPath: string): Promise<void> {
  await ensureDir(path.dirname(toPath));
  await fs.rename(fromPath, toPath);
}

export async function statSafe(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}
