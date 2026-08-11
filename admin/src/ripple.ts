/**
 * Spawns a Telegram-style ripple from the pointer position.
 * Attach to any element carrying the `ripple-host` class:
 *   <div className="ripple-host" onPointerDown={spawnRipple}>
 */
export function spawnRipple(e: React.PointerEvent<HTMLElement>): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const host = e.currentTarget;
  const rect = host.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;

  const ink = document.createElement("span");
  ink.className = "ripple-ink";
  ink.style.width = ink.style.height = `${size}px`;
  ink.style.left = `${e.clientX - rect.left - size / 2}px`;
  ink.style.top = `${e.clientY - rect.top - size / 2}px`;

  host.appendChild(ink);
  ink.addEventListener("animationend", () => ink.remove());
}
