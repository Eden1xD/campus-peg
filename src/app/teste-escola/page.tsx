import type { Metadata } from "next";
import GameShell from "@/game/ui/GameShell";

export const metadata: Metadata = {
  title: "PEG — Minha Escola | Protótipo 3D",
  description:
    "Protótipo isolado do jogo 3D de administração escolar do PEG: rua detalhada, entrada, sala de aula, cantina, alunos com rotina, obras, economia e missões em primeira pessoa.",
};

export default function TestSchoolPage() {
  return <GameShell />;
}
