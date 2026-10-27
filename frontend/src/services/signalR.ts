import * as signalR from "@microsoft/signalr"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

let connection: signalR.HubConnection | null = null

export const startSignalRConnection = async (
  onStatusUpdate: (data: {
    jobId: string
    status: string
    transcript?: string
  }) => void
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    return connection
  }

  // Passing the base API url automatically triggers /negotiate
  connection = new signalR.HubConnectionBuilder()
    .withUrl(API_BASE_URL.replace(/\/$/, "")) // Strips trailing slash
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .configureLogging(signalR.LogLevel.Information)
    .build()

  connection.on("jobStatusUpdated", (payload) => {
    console.log("Real-time event received:", payload)
    onStatusUpdate(payload)
  })

  try {
    await connection.start()
    console.log("SignalR Connected successfully.")
  } catch (err) {
    console.error("SignalR Connection Error: ", err)
  }

  return connection
}
