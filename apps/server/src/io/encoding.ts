import chardet from 'chardet';
import iconv from 'iconv-lite';

/**
 * 编码检测与转码（readme.md 4.1）：服务端收到原始字节后用 chardet 检测编码，
 * 用 iconv-lite 转为 UTF-8，并记录原编码、是否带 BOM。
 */
export interface DecodeResult {
  text: string; // UTF-8 解码后的文本，已去除 BOM
  sourceEncoding: string;
  hasBom: boolean;
}

export function detectAndDecode(buffer: Buffer): DecodeResult {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf8'), sourceEncoding: 'UTF-8', hasBom: true };
  }

  const detected = chardet.detect(buffer) ?? 'UTF-8';
  const text = iconv.decode(buffer, detected);
  return { text, sourceEncoding: detected, hasBom: false };
}

/** 用指定编码重新解码，供任务详情页"手动指定编码后重新解析"使用（readme.md 4.1）。 */
export function decodeWith(buffer: Buffer, encoding: string): string {
  if (/^utf-?8$/i.test(encoding)) {
    const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    return (hasBom ? buffer.subarray(3) : buffer).toString('utf8');
  }
  return iconv.decode(buffer, encoding);
}
