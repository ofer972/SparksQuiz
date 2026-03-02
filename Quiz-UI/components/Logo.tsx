import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  iconOnly?: boolean;
}

const sizes = {
  sm: { img: 32,  text: "text-2xl" },
  md: { img: 48,  text: "text-3xl" },
  lg: { img: 72,  text: "text-5xl" },
  xl: { img: 96,  text: "text-6xl" },
  xxl: { img: 128, text: "text-7xl" },
};

export default function Logo({ size = "lg", iconOnly = false }: LogoProps) {
  const s = sizes[size];
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <Image
        src="/logo.png"
        alt="SparksQuiz"
        width={s.img}
        height={s.img}
        priority
      />
      {!iconOnly && (
        <span className={`${s.text} font-extrabold tracking-tight leading-none`}>
          Sparks<span className="text-yellow-400">Quiz</span>
        </span>
      )}
    </div>
  );
}
