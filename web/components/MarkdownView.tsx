"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownView({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
  );
}
