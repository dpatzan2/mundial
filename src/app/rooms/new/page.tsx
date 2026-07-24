import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NewRoomForm } from "@/components/NewRoomForm";
import { prisma } from "@/lib/db";

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  const competitions = await prisma.competition.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, season: true },
  });

  return (
    <div className="page narrow-page">
      <Link className="back-link" href="/rooms">
        <ArrowLeft size={16} />
        Volver a salas
      </Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">Nueva sala</span>
          <h1>Crear quiniela</h1>
        </div>
      </header>

      <NewRoomForm competitions={competitions} error={error} />
    </div>
  );
}
