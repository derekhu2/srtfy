export interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  const [h, m, rest] = ts.split(":");
  const [s, ms] = rest.split(",");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

export function parseSRT(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.trim().replace(/\r\n/g, "\n").split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!match) continue;

    cues.push({
      start: parseTimestamp(match[1]),
      end: parseTimestamp(match[2]),
      text: lines.slice(2).join("\n"),
    });
  }

  return cues;
}
