interface Entry { rank: number; nickname: string; score: number; }

interface Props {
  entries: Entry[];
  highlight?: string;
}

const RANK_STYLES = ["text-yellow-400", "text-gray-300", "text-amber-600"];
const RANK_ICONS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({ entries, highlight }: Props) {
  if (!entries || entries.length === 0) {
    return <p className="text-gray-500 text-sm text-center">No scores yet</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div
          key={e.nickname}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
            e.nickname === highlight
              ? "bg-indigo-600/40 border border-indigo-500"
              : "bg-[#0f3460]/60"
          }`}
        >
          <span className={`text-3xl w-10 text-center ${RANK_STYLES[e.rank - 1] ?? "text-gray-400"}`}>
            {RANK_ICONS[e.rank - 1] ?? <span className="text-base font-bold">{`#${e.rank}`}</span>}
          </span>
          <span className="flex-1 text-white font-semibold truncate">
            {e.nickname}
            {e.nickname === highlight && <span className="text-indigo-300 text-xs ml-2">(you)</span>}
          </span>
          <span className="text-yellow-400 font-bold">{e.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
