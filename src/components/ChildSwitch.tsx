import Link from "next/link";

export function ChildSwitch({ kids, current, base }: { kids: { id: string; displayName: string }[]; current: string; base: string }) {
  if (kids.length < 2) return null;
  return (
    <nav className="row" aria-label="Ребёнок">
      {kids.map((k) => (
        <Link key={k.id} className={`btn ${k.id === current ? "primary" : ""}`} href={`${base}?child=${k.id}`}>{k.displayName}</Link>
      ))}
    </nav>
  );
}
