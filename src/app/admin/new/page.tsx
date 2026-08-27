import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createCompetitionAction } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";

const competitionStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  ARCHIVED: "Archivada",
};

export default async function NewCompetitionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <div className="page narrow-page">
      <Link className="back-link" href="/admin">
        <ArrowLeft size={16} />
        Volver a competiciones
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Administracion</span>
          <h1>Nueva competencia</h1>
        </div>
      </header>

      <form action={createCompetitionAction} className="panel stack-form room-form">
        {error ? (
          <p className="form-error">Revisa los datos antes de continuar.</p>
        ) : null}

        <label>
          Nombre de la competencia
          <input
            name="name"
            placeholder="Ej. Champions League, La Liga, Premier League"
            required
            minLength={2}
          />
        </label>

        <label>
          Temporada
          <input name="season" placeholder="Ej. 2026/27" />
        </label>

        <div className="scoring-rules-grid">
          <label>
            Pais o region
            <input name="countryCode" placeholder="Ej. GT, UEFA, FIFA" />
          </label>
          <label>
            URL del logo
            <input name="logoUrl" type="url" placeholder="https://..." />
          </label>
        </div>

        <label>
          URL de portada
          <input name="bannerUrl" type="url" placeholder="https://..." />
        </label>

        <label>
          Habilitar automatización de resultados
          <input name="apiFootballLeagueId" type="number" placeholder="Ej. 1 (cualquier número habilita)" />
          <small>Cualquier valor numérico habilita la actualización automática de resultados vía n8n para esta competencia.</small>
        </label>

        <label>
          Estado
          <select name="status" defaultValue="DRAFT">
            {competitionStatuses.map((status) => (
              <option value={status} key={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <div className="scoring-rules-grid">
          <label>
            Fecha de inicio
            <input type="datetime-local" name="startsAt" />
          </label>
          <label>
            Fecha de fin
            <input type="datetime-local" name="endsAt" />
          </label>
        </div>

        <SubmitButton className="primary-button" pendingText="Creando...">
          Crear competencia
        </SubmitButton>
      </form>
    </div>
  );
}
