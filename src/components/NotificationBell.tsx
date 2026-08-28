"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    horizontal: "left" | "right";
    vertical: "down" | "up";
    maxHeight: number;
  }>({ horizontal: "right", vertical: "down", maxHeight: 420 });
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // El panel se abre hacia el lado y el sentido donde hay espacio: si la campana
  // esta pegada al borde derecho (header movil) abre hacia la izquierda, si esta
  // pegada al borde izquierdo (sidebar) abre hacia la derecha; si no hay lugar
  // debajo (campana cerca del borde inferior) abre hacia arriba, y si tampoco
  // alcanza el alto habitual, lo recorta al espacio real disponible (la lista
  // interna ya tiene scroll propio).
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const gap = 10;
    const desiredHeight = 420;

    const panelWidth = Math.min(340, window.innerWidth * 0.88);
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    const horizontal: "left" | "right" =
      spaceRight >= panelWidth ? "left" : spaceLeft >= panelWidth ? "right" : spaceRight >= spaceLeft ? "left" : "right";

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let vertical: "down" | "up";
    let maxHeight: number;
    if (spaceBelow >= desiredHeight) {
      vertical = "down";
      maxHeight = desiredHeight;
    } else if (spaceAbove >= desiredHeight) {
      vertical = "up";
      maxHeight = desiredHeight;
    } else if (spaceBelow >= spaceAbove) {
      vertical = "down";
      maxHeight = Math.max(160, spaceBelow);
    } else {
      vertical = "up";
      maxHeight = Math.max(160, spaceAbove);
    }

    setPlacement({ horizontal, vertical, maxHeight });
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

      {open ? (
        <div
          className="notification-bell-panel"
          style={{
            left: placement.horizontal === "left" ? 0 : "auto",
            right: placement.horizontal === "right" ? 0 : "auto",
            top: placement.vertical === "down" ? "calc(100% + 10px)" : "auto",
            bottom: placement.vertical === "up" ? "calc(100% + 10px)" : "auto",
            maxHeight: placement.maxHeight,
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
        </div>
      ) : null}
    </div>
  );
}
