import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
      components={{
        a: ({ node, ...props }) => {
          void node;
          return <a {...props} target="_blank" rel="noopener noreferrer" />;
        },
        img: ({ node, ...props }) => {
          void node;
          return <img {...props} alt={props.alt ?? ""} loading="lazy" />;
        },
        table: ({ node, ...props }) => {
          void node;
          return (
            <div className="my-4 overflow-x-auto">
              <table {...props} />
            </div>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
