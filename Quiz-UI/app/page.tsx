import Link from "next/link";
import Logo from "@/components/Logo";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <Logo size="xl" />
        <p className="text-gray-400 text-lg mt-3">Real-time quiz battles for up to 30 players</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-4">
        <Link
          href="/host"
          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xl transition-all shadow-lg shadow-indigo-900"
        >
          Host a Quiz
        </Link>
        <Link
          href="/play"
          className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-2xl text-xl transition-all shadow-lg shadow-yellow-900"
        >
          Join a Game
        </Link>
      </div>
    </main>
  );
}
