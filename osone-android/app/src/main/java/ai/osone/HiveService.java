package ai.osone;

import android.app.*;
import android.content.Intent;
import android.os.*;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class HiveService extends Service {

    private static final String TAG = "OSONE-Hive";
    private static final String CHANNEL_ID = "osone_hive";
    private static final String COMMANDER_HOST = "100.104.30.60";
    private static final int COMMANDER_PORT = 8000;
    private static final int HEARTBEAT_INTERVAL = 30; // seconds

    private ScheduledExecutorService scheduler;
    private boolean running = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1, buildNotification("Joining the Hive...", 0));
        startHiveLoop();
        return START_STICKY; // restart if killed
    }

    private void startHiveLoop() {
        running = true;
        scheduler = Executors.newScheduledThreadPool(2);

        // Heartbeat — ping commander every 30s
        scheduler.scheduleAtFixedRate(() -> {
            try {
                sendHeartbeat();
            } catch (Exception e) {
                Log.w(TAG, "Heartbeat failed: " + e.getMessage());
            }
        }, 0, HEARTBEAT_INTERVAL, TimeUnit.SECONDS);

        // Task poller — check for work every 60s
        scheduler.scheduleAtFixedRate(() -> {
            try {
                pollForTasks();
            } catch (Exception e) {
                Log.w(TAG, "Poll failed: " + e.getMessage());
            }
        }, 5, 60, TimeUnit.SECONDS);
    }

    private void sendHeartbeat() throws Exception {
        String nodeId = Build.MODEL.replaceAll("[^a-zA-Z0-9]", "_");
        String json = "{\"node\":\"" + nodeId + "\",\"type\":\"android\",\"status\":\"active\"}";
        postJson("/api/hive/heartbeat", json);
        updateNotification("Active node · " + nodeId, 1);
    }

    private void pollForTasks() throws Exception {
        String nodeId = Build.MODEL.replaceAll("[^a-zA-Z0-9]", "_");
        String response = postJson("/api/hive/tasks?node=" + nodeId, "{}");
        if (response != null && response.contains("\"task\"")) {
            Log.i(TAG, "Got task from hive: " + response);
            // Future: execute lightweight compute tasks here
        }
    }

    private String postJson(String path, String body) throws Exception {
        URL url = new URL("http://" + COMMANDER_HOST + ":" + COMMANDER_PORT + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes());
        }

        int code = conn.getResponseCode();
        if (code == 200) {
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            return sb.toString();
        }
        return null;
    }

    private void updateNotification(String text, int nodeCount) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(1, buildNotification(text, nodeCount));
    }

    private Notification buildNotification(String text, int nodes) {
        Intent tapIntent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("⬡ OSONE Hive")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "OSONE Hive Node",
                NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("Keeps your device connected to the OSONE compute hive");
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (scheduler != null) scheduler.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
