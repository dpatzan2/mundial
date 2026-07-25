"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#4285f4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34a853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z" />
      <path fill="#fbbc05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l4-3.1z" />
      <path fill="#ea4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

function OutlookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#0078d4" d="M13 4h9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-9V4z" />
      <path fill="#0078d4" opacity=".6" d="M13 7.5h10v2.2L13 12V7.5zM13 13l10-2.2V16l-10 1.8V13z" />
      <path fill="#0364b8" d="M1 5.6 12 3.5v17L1 18.4V5.6z" />
      <ellipse cx="6.5" cy="12" rx="3.1" ry="3.6" fill="none" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
      <path d="M17.05 12.5c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2-.1 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-.9-2.5-3.6zM14.9 5.7c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2.1-.5 2.8-1.2z" />
    </svg>
  );
}

export function CalendarSyncButtons({
  competitionId,
  competitionName,
}: {
  competitionId: string;
  competitionName: string;
}) {
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  // Google/Outlook exigen el esquema webcal:// (sin codificar) en el cid/url; con https dan "verifica la URL".
  const webcalUrl = `webcal://${host}/api/calendar/${competitionId}`;

  return (
    <div className="cal-sync-buttons">
      <a
        href={`https://calendar.google.com/calendar/r?cid=${webcalUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="cal-sync-btn"
        aria-disabled={!host}
        tabIndex={host ? undefined : -1}
      >
        <GoogleIcon />
        Google Calendar
      </a>
      <a
        href={`https://outlook.live.com/calendar/0/addfromweb?url=${webcalUrl}&name=${encodeURIComponent(competitionName)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="cal-sync-btn"
        aria-disabled={!host}
        tabIndex={host ? undefined : -1}
      >
        <OutlookIcon />
        Outlook
      </a>
      <a
        href={`webcal://${host}/api/calendar/${competitionId}`}
        className="cal-sync-btn"
        aria-disabled={!host}
        tabIndex={host ? undefined : -1}
      >
        <AppleIcon />
        Apple / iCal
      </a>
      <a
        href={`/api/calendar/${competitionId}`}
        download={`${competitionName}.ics`}
        className="cal-sync-btn"
      >
        <Download size={15} />
        Descargar .ics
      </a>
    </div>
  );
}
