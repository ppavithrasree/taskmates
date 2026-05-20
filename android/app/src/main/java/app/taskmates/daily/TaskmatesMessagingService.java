package app.taskmates.daily;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public class TaskmatesMessagingService extends MessagingService {
    private static final String CHANNEL_ID = "taskmates_alerts_v2";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (isAppInForeground()) {
            super.onMessageReceived(remoteMessage);
            return;
        }
        markDelivered(data);
        showNotification(data);
    }

    private void markDelivered(Map<String, String> data) {
        if (!"group_message".equals(data.get("type"))) return;
        String messageId = data.get("messageId");
        String recipientId = data.get("recipientId");
        if (messageId == null || messageId.isEmpty() || recipientId == null || recipientId.isEmpty()) return;
        if (BuildConfig.FCM_SERVER_URL.isEmpty()) return;

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(BuildConfig.FCM_SERVER_URL + "/api/mark-message-delivered");
                JSONObject body = new JSONObject();
                body.put("messageId", messageId);
                body.put("recipientId", recipientId);

                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                if (!BuildConfig.FCM_API_KEY.isEmpty()) {
                    connection.setRequestProperty("x-api-key", BuildConfig.FCM_API_KEY);
                }

                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream stream = connection.getOutputStream()) {
                    stream.write(payload);
                }
                connection.getInputStream().close();
            } catch (Exception ignored) {
                // Best effort: the next foreground sync can still write the same receipt.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void showNotification(Map<String, String> data) {
        if ("true".equals(data.get("silent"))) return;
        if (isAppInForeground()) return;
        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.isEmpty() || body == null || body.isEmpty()) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Taskmates alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", data.getOrDefault("messageId", String.valueOf((title + body).hashCode())));
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        String link = data.get("link");
        if (link != null) intent.putExtra("link", link);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            Math.abs((data.getOrDefault("messageId", "") + body).hashCode()),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_taskmates)
            .setColor(ContextCompat.getColor(this, R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent);

        manager.notify(Math.abs((data.getOrDefault("messageId", "") + title).hashCode()), builder.build());
    }

    private boolean isAppInForeground() {
        android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        java.util.List<android.app.ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
        if (processes == null) return false;
        String packageName = getPackageName();
        for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
            if (
                packageName.equals(process.processName) &&
                process.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            ) {
                return true;
            }
        }
        return false;
    }
}
