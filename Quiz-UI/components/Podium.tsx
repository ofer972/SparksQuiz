"use client";

interface Entry { rank: number; nickname: string; score: number; }

interface Props {
  entries: Entry[];
  highlight?: string;
}

export default function Podium({ entries, highlight }: Props) {
  const top3 = entries.slice(0, 3);
  const first = top3.find((e) => e.rank === 1);
  const second = top3.find((e) => e.rank === 2);
  const third = top3.find((e) => e.rank === 3);

  const PodiumBlock = ({
    entry,
    height,
    crown,
    color,
  }: {
    entry?: Entry;
    height: string;
    crown: string;
    color: string;
  }) => (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div className="flex flex-col items-center justify-end min-h-[100px] sm:min-h-[140px] gap-1 pb-2">
        {entry ? (
          <>
            <span className="text-4xl sm:text-6xl leading-none">{crown}</span>
            <div
              className={`text-xs sm:text-sm font-bold text-center px-1.5 sm:px-2 py-1 rounded-lg max-w-[70px] sm:max-w-[90px] truncate ${
                entry.nickname === highlight ? "bg-indigo-500 text-white" : "text-white"
              }`}
            >
              {entry.nickname}
            </div>
            <div className="text-yellow-400 font-bold text-xs sm:text-sm">{entry.score.toLocaleString()}</div>
          </>
        ) : null}
      </div>
      <div
        className={`w-full ${height} ${color} rounded-t-xl flex items-center justify-center text-white text-3xl sm:text-5xl font-extrabold shadow-lg`}
      >
        {entry?.rank ?? "–"}
      </div>
    </div>
  );

  return (
    <div className="flex items-end gap-2 sm:gap-3 px-2 sm:px-4 pt-4">
      <PodiumBlock entry={second} height="h-24 sm:h-32" crown="🥈" color="bg-gray-500" />
      <PodiumBlock entry={first} height="h-36 sm:h-48" crown="🥇" color="bg-yellow-500" />
      <PodiumBlock entry={third} height="h-20 sm:h-24" crown="🥉" color="bg-amber-700" />
    </div>
  );
}
