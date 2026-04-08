interface PixelAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function PixelAvatar({ name, size = "md", className = "" }: PixelAvatarProps) {
  const getColorFromName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = [
      { from: "#8b5cf6", to: "#ec4899" },
      { from: "#06b6d4", to: "#3b82f6" },
      { from: "#10b981", to: "#059669" },
      { from: "#f59e0b", to: "#ef4444" },
      { from: "#6366f1", to: "#8b5cf6" },
      { from: "#ec4899", to: "#f97316" },
      { from: "#14b8a6", to: "#06b6d4" },
    ];

    return colors[Math.abs(hash) % colors.length];
  };

  const sizeMap = {
    sm: { container: "w-6 h-6", text: "text-[8px]" },
    md: { container: "w-10 h-10", text: "text-xs" },
    lg: { container: "w-12 h-12", text: "text-sm" },
    xl: { container: "w-16 h-16", text: "text-base" },
  };

  const { container, text } = sizeMap[size];
  const color = getColorFromName(name);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`${container} rounded relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`${text} font-bold text-white drop-shadow-lg`}
          style={{
            textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
            fontFamily: "monospace",
          }}
        >
          {initial}
        </span>
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `
            inset 1px 1px 0 rgba(255,255,255,0.3),
            inset -1px -1px 0 rgba(0,0,0,0.3)
          `,
        }}
      />
    </div>
  );
}
