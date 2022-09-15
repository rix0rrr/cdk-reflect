export class Histogram<A> {
  private readonly histo = new Map<A, number>();
  private max = 0;

  public add(x: A, n = 1) {
    const cur = this.histo.get(x);
    const newC = (cur ?? 0) + n;
    this.histo.set(x, newC);

    if (newC > this.max) { this.max = newC; }
  }

  public print(topN?: number) {
    const entries = Array.from(this.histo.entries()).map(([a, n]) => [`${a}`, n] as const);
    entries.sort((a, b) => b[1] - a[1]);

    if (topN) {
      const elided = entries.splice(topN, entries.length - topN);
      const sum = elided.reduce((a, [_, n]) => a + n, 0);
      entries.push(['...', sum]);
    }

    const charWidth = `${this.max}`.length;

    const H_WIDTH = 10;
    const frac = H_WIDTH / this.max;
    return entries.map(([message, x]) => ` ${leftpad(x, charWidth)} ${makeBar(frac * x, H_WIDTH)} ${message}`).join('\n');
  }
}

const FULL_BAR_CHAR = '█';
const BAR_CHARS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

function makeBar(w: number, maxWidth: number) {
  const fb = Math.floor(w);
  const ws = maxWidth - Math.ceil(w);
  const decimal = (w - fb); // in [0, 1)
  return FULL_BAR_CHAR.repeat(fb) + (decimal > 0 ? BAR_CHARS[Math.floor(decimal * BAR_CHARS.length)] : '') + ' '.repeat(ws);
}

function leftpad(n: number, w: number) {
  const x = `${n}`;
  return ' '.repeat(Math.max(0, w - x.length)) + x;
}