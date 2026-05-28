import { cn } from "@/lib/utils";

const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const exactUrlPattern = /^(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)$/i;
const trailingPunctuationPattern = /[),.!?;:]+$/;

const splitTrailingPunctuation = (value: string) => {
  const match = value.match(trailingPunctuationPattern);
  if (!match) return { url: value, trailing: "" };
  const trailing = match[0];
  return { url: value.slice(0, -trailing.length), trailing };
};

export const LinkifiedText = ({
  text,
  className,
  linkClassName,
  pending = false,
  stopPropagation = true,
}: {
  text?: string;
  className?: string;
  linkClassName?: string;
  pending?: boolean;
  stopPropagation?: boolean;
}) => {
  const safeText = text ?? "";
  const parts = safeText.split(urlPattern);

  return (
    <span className={cn("whitespace-pre-wrap break-words", pending && "italic opacity-70", className)}>
      {parts.map((part, index) => {
        if (!exactUrlPattern.test(part)) return <span key={`${part}-${index}`}>{part}</span>;
        const { url, trailing } = splitTrailingPunctuation(part);
        const href = url.startsWith("http") ? url : `https://${url}`;
        return (
          <span key={`${part}-${index}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("font-bold underline underline-offset-2", linkClassName)}
              onClick={(event) => {
                if (stopPropagation) event.stopPropagation();
              }}
            >
              {url}
            </a>
            {trailing}
          </span>
        );
      })}
    </span>
  );
};

export default LinkifiedText;
