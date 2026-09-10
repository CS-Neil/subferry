import type { BatchItem, BatchRequest } from '../services/types.js';

/**
 * 默认提示词模板，原样落地 readme.md 第 5 章（第 345-391 行）。使用 $变量 语法，带版本号；
 * M2 允许管理员在服务实例中覆盖此模板，M1 只使用这一份默认模板。
 */
export const PROMPT_VERSION = 1;

export const DEFAULT_SYSTEM_PROMPT = `你是一名资深影视字幕译者，负责把$from字幕翻译成$to。

【影片信息】
$synopsis

【术语表，必须严格使用以下译名】
$glossary

【翻译要求】
1. 译文口语化、自然流畅，符合中文影视字幕习惯，意译优先，避免翻译腔。
2. 根据说话人身份和人物关系选择语气与称呼（如韩语敬语/半语、意大利语 Lei/tu）。
3. 俚语、脏话、玩笑按中文的自然说法处理，保留原有的情绪强度。
4. 一句话跨多条字幕时，可以在相邻条目之间调整语序，但每个 id 都必须有译文，不得合并、拆分或留空。
5. 形如 ⟨1⟩ 的占位符必须原样保留在译文中对应的位置。
6. 以 "- " 开头的多人对白，保留每行开头的 "- "，行与行之间用 \\n 分隔。
7. 只翻译，不解释，不添加原文没有的信息。

【输出格式】
只输出一个 JSON 对象，键为 id，值为译文，例如 {"12": "译文", "13": "译文"}。
不要输出任何其他内容。`;

export const DEFAULT_USER_TEMPLATE = `【上文，仅供参考，不要翻译】
$context_before

【待翻译】
$items

【下文，仅供参考，不要翻译】
$context_after`;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$(\w+)/g, (whole, key: string) => (key in vars ? vars[key] : whole));
}

/** `$items` 按每行一条渲染，例如 `12 [민수]: 어디 가?`（有 speaker 时）或 `12: 어디 가?`（无 speaker 时）。 */
export function renderItems(items: BatchItem[]): string {
  return items
    .map((item) => (item.speaker ? `${item.id} [${item.speaker}]: ${item.text}` : `${item.id}: ${item.text}`))
    .join('\n');
}

export interface RenderedPrompt {
  system: string;
  user: string;
}

export function renderPrompt(req: BatchRequest): RenderedPrompt {
  const system = renderTemplate(DEFAULT_SYSTEM_PROMPT, {
    from: req.from,
    to: req.to,
    synopsis: req.synopsis?.trim() ? req.synopsis : '（无）',
    glossary: req.glossary?.trim() ? req.glossary : '（无）',
  });

  let user = renderTemplate(DEFAULT_USER_TEMPLATE, {
    context_before: req.contextBefore.length ? renderItems(req.contextBefore) : '（无）',
    items: renderItems(req.items),
    context_after: req.contextAfter.length ? renderItems(req.contextAfter) : '（无）',
  });

  if (req.retryNote) {
    user = `【上次翻译的问题，请修正后重新给出这些 id 的完整译文】\n${req.retryNote}\n\n${user}`;
  }

  return { system, user };
}
