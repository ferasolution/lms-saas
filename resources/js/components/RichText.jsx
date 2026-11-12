// Renders teacher-written lesson text safely: plain text with a few line
// conventions ("# " heading, "- " list, blank line = new paragraph).
// No HTML is ever injected.
export default function RichText({ text, className = '' }) {
    if (!text) return null;
    const blocks = [];
    let list = null;

    text.replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
        const line = raw.trimEnd();
        if (/^\s*[-*•]\s+/.test(line)) {
            if (!list) { list = []; blocks.push({ type: 'ul', items: list }); }
            list.push(line.replace(/^\s*[-*•]\s+/, ''));
            return;
        }
        list = null;
        if (!line.trim()) { blocks.push({ type: 'gap' }); return; }
        if (/^#{1,3}\s+/.test(line)) { blocks.push({ type: 'h', text: line.replace(/^#{1,3}\s+/, '') }); return; }
        const last = blocks[blocks.length - 1];
        if (last?.type === 'p') last.lines.push(line);
        else blocks.push({ type: 'p', lines: [line] });
    });

    return (
        <div className={`space-y-4 text-[17px] leading-8 text-graphite ${className}`}>
            {blocks.map((b, i) => {
                if (b.type === 'gap') return null;
                if (b.type === 'h') return <h3 key={i} className="pt-2 text-xl font-bold">{b.text}</h3>;
                if (b.type === 'ul') {
                    return (
                        <ul key={i} className="space-y-1.5 pl-1">
                            {b.items.map((item, j) => (
                                <li key={j} className="flex gap-3"><span className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />{item}</li>
                            ))}
                        </ul>
                    );
                }
                return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{l}</span>)}</p>;
            })}
        </div>
    );
}
