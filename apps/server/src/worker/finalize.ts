import { writeSubtitle, type SubtitleDocument } from '@subferry/core';
import type { DB } from '../db/client.js';
import type { AppConfig } from '../config.js';
import { getJobRow, setJobStatus } from '../db/jobs-repo.js';
import { listCuesForJob, rowToCue } from '../db/cues-repo.js';
import { outputFilePath, saveFile } from '../io/storage.js';

function defaultOutputName(fileName: string, template: string, ext: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  return template.replace('{name}', base).replace('{ext}', ext);
}

/**
 * 用数据库里当前的 cues 状态重新生成输出文件（readme.md 4.9）。job-runner 翻译刚完成时调用一次；
 * 用户在校对页编辑过条目、或点击"确认完成"把 awaiting_review 推进到 done 时，需要重新调用一次
 * 才能让下载内容反映最新的编辑——这就是为什么这段逻辑单独抽出来，而不是内联在 job-runner 里。
 */
export function writeJobOutput(db: DB, config: AppConfig, jobId: string): string {
  const jobRow = getJobRow(db, jobId);
  if (!jobRow) throw new Error(`job ${jobId} 不存在`);

  const cueRows = listCuesForJob(db, jobId);
  const doc: SubtitleDocument = {
    format: jobRow.format as SubtitleDocument['format'],
    sourceEncoding: jobRow.encoding ?? 'UTF-8',
    eol: (jobRow.eol as SubtitleDocument['eol']) ?? '\n',
    header: jobRow.header,
    cues: cueRows.map(rowToCue),
  };

  const options = JSON.parse(jobRow.optionsJson) as { outputNameTemplate?: string };
  const outputName = defaultOutputName(
    jobRow.fileName,
    options.outputNameTemplate ?? '{name}.zh.{ext}',
    jobRow.format,
  );
  const outPath = outputFilePath(config.dataDir, jobId, outputName);
  saveFile(outPath, writeSubtitle(doc));
  return outPath;
}

/** awaiting_review → done：重新生成一次输出文件（拿到用户在校对页的最新编辑），标记完成。 */
export function confirmJobDone(db: DB, config: AppConfig, jobId: string): string {
  const outPath = writeJobOutput(db, config, jobId);
  setJobStatus(db, jobId, 'done', { outputPath: outPath, finishedAt: new Date().toISOString() });
  return outPath;
}
