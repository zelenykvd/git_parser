import Icon from "./Icon";

/**
 * Which provider/model translated the post, e.g. "voidai/gpt-5.1".
 * Renders nothing for posts translated before the field existed.
 */
export default function ModelBadge({ model, className = "" }: { model?: string | null; className?: string }) {
  if (!model) return null;

  return (
    <span
      title={`Модель перекладу: ${model}`}
      className={`inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-elev border border-line text-muted text-[10px] font-medium max-w-full animate-popIn ${className}`}
    >
      <Icon name="smart_toy" size={11} className="shrink-0 text-brand" />
      <span className="truncate">{model}</span>
    </span>
  );
}
