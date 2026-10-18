const PATH = "M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z";

export function Star({ lit }: { lit: boolean }) {
  return (
    <svg className={`star ${lit ? "lit" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeWidth="1.5" d={PATH} />
    </svg>
  );
}

export function StarRow({ lit, total }: { lit: number; total: number }) {
  return (
    <div className="stars" role="img" aria-label={`Звёзд сегодня: ${lit}`}>
      {Array.from({ length: Math.max(total, lit) }, (_, i) => <Star key={i} lit={i < lit} />)}
    </div>
  );
}
