import Link from "next/link";

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-${i++}`} className="font-semibold">
          {m[2]}
        </strong>
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-${i++}`} className="italic">
          {m[3]}
        </em>
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-${i++}`} className="rounded bg-muted px-1 py-0.5 text-sm">
          {m[4]}
        </code>
      );
    } else if (m[5] !== undefined) {
      const href = m[6];
      const external = /^https?:\/\//.test(href);
      nodes.push(
        external ? (
          <a
            key={`${keyPrefix}-${i++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4"
          >
            {m[5]}
          </a>
        ) : (
          <Link key={`${keyPrefix}-${i++}`} href={href} className="text-primary underline underline-offset-4">
            {m[5]}
          </Link>
        )
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuf: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!listBuf) return null;
    const { type, items } = listBuf;
    listBuf = null;
    return type === "ul" ? (
      <ul key={key} className="my-3 list-disc space-y-1 pl-6">
        {items.map((it, idx) => (
          <li key={idx}>{inline(it, `li-${idx}`)}</li>
        ))}
      </ul>
    ) : (
      <ol key={key} className="my-3 list-decimal space-y-1 pl-6">
        {items.map((it, idx) => (
          <li key={idx}>{inline(it, `li-${idx}`)}</li>
        ))}
      </ol>
    );
  };

  let buf: string[] = [];
  const flush = (key: string) => {
    if (buf.length === 0) return null;
    const text = buf.join("\n");
    buf = [];
    return (
      <p key={key} className="my-4 leading-7">
        {inline(text, `p-${key}`)}
      </p>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    const key = `b-${i}`;
    if (line.startsWith("### ")) {
      blocks.push(flushList(key), flush(key));
      blocks.push(
        <h3 key={key} className="mt-8 mb-2 text-xl font-bold">
          {inline(line.slice(4), key)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      blocks.push(flushList(key), flush(key));
      blocks.push(
        <h2 key={key} className="mt-10 mb-3 text-2xl font-bold">
          {inline(line.slice(3), key)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      blocks.push(flushList(key), flush(key));
      blocks.push(
        <h1 key={key} className="mt-10 mb-4 text-3xl font-bold">
          {inline(line.slice(2), key)}
        </h1>
      );
    } else if (/^[-*] /.test(line)) {
      blocks.push(flush(key));
      if (!listBuf || listBuf.type !== "ul") {
        blocks.push(flushList(key));
        listBuf = { type: "ul", items: [] };
      }
      listBuf.items.push(line.replace(/^[-*] /, ""));
    } else if (/^\d+\. /.test(line)) {
      blocks.push(flush(key));
      if (!listBuf || listBuf.type !== "ol") {
        blocks.push(flushList(key));
        listBuf = { type: "ol", items: [] };
      }
      listBuf.items.push(line.replace(/^\d+\. /, ""));
    } else if (line.startsWith("> ")) {
      blocks.push(flushList(key), flush(key));
      blocks.push(
        <blockquote key={key} className="my-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground">
          {inline(line.slice(2), key)}
        </blockquote>
      );
    } else if (line.startsWith("```")) {
      blocks.push(flushList(key), flush(key));
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre key={key} className="my-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
    } else if (line.trim() === "") {
      blocks.push(flushList(key), flush(key));
    } else {
      if (listBuf) {
        blocks.push(flushList(key));
      }
      buf.push(line);
    }
    i++;
  }
  blocks.push(flushList("end"), flush("end"));
  return <div className="prose prose-neutral dark:prose-invert max-w-none">{blocks}</div>;
}
