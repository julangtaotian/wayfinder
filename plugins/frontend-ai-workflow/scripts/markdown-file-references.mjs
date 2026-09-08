// 保留匹配位置，调用方可以原位改写目标而不重排 Markdown 或换行。
const REFERENCE_TOKENS = new RegExp([
  String.raw`https?:\/\/[^\s\x60<>]+`,
  String.raw`\x60(?<code>[^\x60\r\n]+)\x60`,
  String.raw`!?\[[^\]\r\n]*\]\([ \t]*(?:<(?<angle>[^>\r\n]+)>|(?<link>[^\s()]+))(?:[ \t]+["'][^\r\n]*?["'])?[ \t]*\)`,
  String.raw`^[ \t]*\[[^\]\r\n]+\]:[ \t]*(?:<(?<definitionAngle>[^>\r\n]+)>|(?<definition>[^\s]+))`,
].join('|'), 'dgmu');

// 只提取明确的文件引用，不把链接标题、远程 URL 内的路径或模板文字当作本地文件。
export function findMarkdownFileReferences(content, { barePrefixes = [] } = {}) {
  const text = String(content || '');
  const references = [];
  const occupied = [];
  for (const match of text.matchAll(REFERENCE_TOKENS)) {
    occupied.push([match.index, match.index + match[0].length]);
    for (const [kind, range] of Object.entries(match.indices.groups)) {
      if (!range) continue;
      const candidate = text.slice(...range);
      // 盘符不是 URL 协议，必须交给路径安全层拒绝，不能漏掉绝对证据路径。
      const windowsDrive = /^[a-z]:[\\/]/iu.test(candidate);
      if ((!windowsDrive && /^[a-z][a-z\d+.-]*:/iu.test(candidate))
        || (kind !== 'code' && candidate.startsWith('//'))) continue;
      references.push({ path: candidate, index: range[0], length: range[1] - range[0], kind });
    }
  }
  if (barePrefixes.length) {
    const prefixes = barePrefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
    // 裸路径只接受调用方声明的仓库前缀；标点作为边界，避免改写 URL 查询参数和相似路径。
    const bare = new RegExp(`(?<![\\p{L}\\p{N}_./\\\\?=&%#-])(?:${prefixes.join('|')})[^\\s\x60<>"'|()\\[\\]，。；、！？]+`, 'gu');
    for (const match of text.matchAll(bare)) {
      if (occupied.some(([start, end]) => match.index >= start && match.index < end)) continue;
      const candidate = match[0].replace(/[.,;:!?]+$/u, '');
      references.push({ path: candidate, index: match.index, length: candidate.length, kind: 'bare' });
    }
  }
  return references.sort((left, right) => left.index - right.index);
}
