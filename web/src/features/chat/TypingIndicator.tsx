/**
 * Typing indicator — shows "Member is typing..." with animated dots.
 * Styled with Tailwind to match the Figma prototype.
 */

type TypingIndicatorProps = {
  /** Member names currently typing. */
  typingMembers: string[];
};

export const TypingIndicator = ({ typingMembers }: TypingIndicatorProps) => {
  if (typingMembers.length === 0) return null;

  const label =
    typingMembers.length === 1
      ? `${typingMembers[0]} is typing`
      : typingMembers.length === 2
        ? `${typingMembers[0]} and ${typingMembers[1]} are typing`
        : `${typingMembers[0]} and ${typingMembers.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2 app-text-muted text-xs italic" aria-live="polite" aria-label={label}>
      <span>{label}</span>
      <div className="flex gap-1">
        <div className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <div className="size-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <div className="size-1 rounded-full bg-current animate-bounce" />
      </div>
    </div>
  );
};
