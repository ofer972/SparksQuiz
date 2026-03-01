"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinSession } from "@/lib/api";

export default function JoinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    setError("");
    const cleanPin = pin.trim();
    const cleanNick = nickname.trim();
    if (cleanPin.length !== 5 || !/^\d{5}$/.test(cleanPin)) {
      return setError("PIN must be exactly 5 digits");
    }
    if (!cleanNick) return setError("Nickname is required");
    if (cleanNick.length > 20) return setError("Nickname max 20 characters");

    setLoading(true);
    try {
      await joinSession(cleanPin, cleanNick);
      router.push(`/play/${cleanPin}?nickname=${encodeURIComponent(cleanNick)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join. Check the PIN and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-5xl font-extrabold text-center text-white mb-8">
          Sparks<span className="text-yellow-400">Quiz</span>
        </h1>

        <div className="bg-[#16213e] rounded-3xl p-8 shadow-xl space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Game PIN</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={5}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="12345"
              className="w-full bg-[#0f3460] text-white text-3xl font-bold text-center rounded-xl px-4 py-4 tracking-[0.5em] placeholder-gray-600 outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Your nickname</label>
            <input
              type="text"
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="CoolPlayer"
              className="w-full bg-[#0f3460] text-white text-xl font-semibold text-center rounded-xl px-4 py-3 placeholder-gray-600 outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black text-xl font-extrabold rounded-2xl transition-all shadow-lg"
          >
            {loading ? "Joining..." : "Join!"}
          </button>
        </div>
      </div>
    </main>
  );
}
