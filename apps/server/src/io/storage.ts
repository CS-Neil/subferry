import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';

/**
 * 文件存储（readme.md 4.1 / 7.5）：文件名规范化，保存到 /data/uploads/{jobId}/。
 * 上传限制（大小、扩展名）在 routes/jobs.ts 的接收逻辑中校验。
 */
export function normalizeFileName(name: string): string {
  const base = name
    .replace(/[/\\]/g, '_') // 去掉路径分隔符，防止路径穿越
    .replace(/^\.+/, '_') // 去掉开头的点，避免隐藏文件/相对路径歧义
    .trim();
  return base.length > 0 ? base : 'upload';
}

export function uploadFilePath(dataDir: string, jobId: string, fileName: string): string {
  return join(dataDir, 'uploads', jobId, normalizeFileName(fileName));
}

export function outputFilePath(dataDir: string, jobId: string, outputFileName: string): string {
  return join(dataDir, 'outputs', jobId, outputFileName);
}

export function saveFile(path: string, content: Buffer | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/** 读原始字节（不假定编码），用于重新解析等需要拿到原始上传内容的场景。 */
export function readFileBuffer(path: string): Buffer {
  return readFileSync(path);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function fileExtension(fileName: string): string {
  return extname(fileName).replace(/^\./, '').toLowerCase();
}
