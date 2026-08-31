"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  roomId: string;
  roomName: string;
  read: boolean;
};

const POLL_INTERVAL_MS = 45_000;

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

type PanelCoords = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    try {
      const response = await fetch("/api/v1/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silencioso: un fallo de red no debe romper la navegacion.
    }
  }

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // El panel se renderiza en un portal a document.body (position: fixed, coordenadas
  // en pixeles de viewport) en vez de quedar anidado en el header/sidebar: asi evita
  // que un ancestro con overflow:hidden (el header movil, position:fixed y overflow
  // hidden por diseno) lo recorte, que era la causa de que no se viera en mobile.
  // Se abre hacia el lado y el sentido donde hay espacio real disponible, y si ni
  // arriba ni abajo alcanza el alto habitual (420px) recorta al espacio disponible
  // (la lista interna ya tiene scroll propio).
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;

    function computeCoords() {
      const rect = containerRef.current!.getBoundingClientRect();
      const gap = 10;
      const desiredHeight = 420;
      const panelWidth = Math.min(340, window.innerWidth * 0.88);

      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      const next: PanelCoords = { maxHeight: desiredHeight };

      if (spaceRight >= panelWidth) {
        next.left = rect.left;
      } else if (spaceLeft >= panelWidth) {
        next.right = spaceRight;
      } else if (spaceRight >= spaceLeft) {
        next.left = Math.max(gap, window.innerWidth - panelWidth - gap);
      } else {
        next.right = Math.max(gap, spaceRight);
      }

      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      if (spaceBelow >= desiredHeight) {
        next.top = rect.bottom + gap;
        next.maxHeight = desiredHeight;
      } else if (spaceAbove >= desiredHeight) {
        next.bottom = window.innerHeight - rect.top + gap;
        next.maxHeight = desiredHeight;
      } else if (spaceBelow >= spaceAbove) {
        next.top = rect.bottom + gap;
        next.maxHeight = Math.max(160, spaceBelow);
      } else {
        next.bottom = window.innerHeight - rect.top + gap;
        next.maxHeight = Math.max(160, spaceAbove);
      }

      setCoords(next);
    }

    computeCoords();
    window.addEventListener("resize", computeCoords);
    return () => window.removeEventListener("resize", computeCoords);
  }, [open]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Ignorar: la siguiente sincronizacion corrige el estado si algo fallo.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/v1/notifications/read-all", { method: "POST" });
    } catch {
      // Ignorar: la siguiente sincronizacion corrige el estado si algo fallo.
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        title="Notificaciones"
      >
        <Bell size={16} />
        {unreadCount > 0 ? <span className="notification-bell-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              className="notification-bell-panel"
              style={{
                position: "fixed",
                top: coords.top ?? "auto",
                bottom: coords.bottom ?? "auto",
                left: coords.left ?? "auto",
                right: coords.right ?? "auto",
                maxHeight: coords.maxHeight,
              }}
            >
              <div className="notification-bell-panel-head">
                <strong>Notificaciones</strong>
                {unreadCount > 0 ? (
                  <button type="button" className="notification-bell-mark-all" onClick={markAllRead}>
                    Marcar todas como leidas
                  </button>
                ) : null}
              </div>
              <div className="notification-bell-list">
                {notifications.length === 0 ? (
                  <p className="notification-bell-empty">Sin notificaciones por ahora.</p>
                ) : (
                  notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={`/rooms/${notification.roomId}/leaderboard`}
                      className={`notification-bell-item${notification.read ? "" : " unread"}`}
                      onClick={() => {
                        if (!notification.read) markRead(notification.id);
                        setOpen(false);
                      }}
                    >
                      <div className="notification-bell-item-head">
                        <span>{notification.title}</span>
                        <small>{relativeTime(notification.createdAt)}</small>
                      </div>
                      <p>{notification.body}</p>
                      <small className="notification-bell-room">{notification.roomName}</small>
                    </Link>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
