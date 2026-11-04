export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("This browser does not support desktop notifications.")
    return false
  }

  if (Notification.permission === "granted") {
    return true
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission()
    return permission === "granted"
  }

  return false
}

export async function showNotification(title: string, options?: NotificationOptions) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  const notificationOptions: NotificationOptions = {
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    ...options,
  }

  // If a Service Worker is registered (e.g., PWA/production build), use showNotification for background support
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration && registration.showNotification) {
        await registration.showNotification(title, notificationOptions)
        return
      }
    } catch {
      // Fallback to standard window Notification
    }
  }

  // Standard Desktop Notification fallback
  try {
    new Notification(title, notificationOptions)
  } catch (err) {
    console.error("Failed to construct desktop Notification:", err)
  }
}
