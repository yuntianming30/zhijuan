import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default function MarkdownContent({ children }: { children: string }) {
  const normalized = children
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression) => `$$${expression}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression) => `$${expression}$`);
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
