// Renders teacher-written lesson text safely: plain text with a few line
// conventions ("# " heading, "- " list, blank line = new paragraph).
// No HTML is ever injected.
export default function RichText({ text, className = '' }) {
    if (!text) return null;
    const blocks = [];
    let list = null;

    text.replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
        const line = raw.trimEnd();
        if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
            if (!list) { list = []; blocks.push({ type: 'ul', items: list }); }
            const num = line.match(/^\s*(\d+)[.)]\s+/);
            list.push((num ? `${num[1]}. ` : '') + line.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
            return;
        }
        list = null;
        if (!line.trim()) { blocks.push({ type: 'gap' }); return; }
        if (/^#{1,4}\s+/.test(line)) { blocks.push({ type: 'h', text: line.replace(/^#{1,4}\s+/, '') }); return; }
        if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { blocks.push({ type: 'gap' }); return; }
        const last = blocks[blocks.length - 1];
        if (last?.type === 'p') last.lines.push(line);
        else blocks.push({ type: 'p', lines: [line] });
    });

    return (
        <div className={`space-y-4 text-[17px] leading-8 text-graphite ${className}`}>
            {blocks.map((b, i) => {
                if (b.type === 'gap') return null;
                if (b.type === 'h') return <h3 key={i} className="pt-2 text-xl font-bold">{inline(b.text)}</h3>;
                if (b.type === 'ul') {
                    return (
                        <ul key={i} className="space-y-1.5 pl-1">
                            {b.items.map((item, j) => (
                                <li key={j} className="flex gap-3"><span className="mt-[13px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" /><span>{inline(item)}</span></li>
                            ))}
                        </ul>
                    );
                }
                return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
            })}
        </div>
    );
}

/** **bold** only — everything else stays plain text. */
function inline(text) {
    const parts = String(text).split(/\*\*(.+?)\*\*/g);
    return parts.length === 1 ? text : parts.map((p, i) => (i % 2 ? <strong key={i} className="font-bold text-ink-deep">{p}</strong> : p));
}
