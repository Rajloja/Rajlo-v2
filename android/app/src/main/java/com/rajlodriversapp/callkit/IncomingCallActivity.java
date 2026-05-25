package com.rajlodriversapp.callkit;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.TextUtils;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen incoming-call Activity for self-managed Telecom calls.
 *
 * Self-managed PhoneAccounts (PROPERTY_SELF_MANAGED) DO NOT use the
 * system InCallUI — Telecom routes the call to a non-UI service and
 * expects the app to draw its own incoming-call screen. Without
 * this Activity the call sits in RINGING but the user sees nothing.
 *
 * Visual design mirrors the in-app IncomingCallToast — Rajlo-black
 * background, big pulsing red rings around a circular avatar with
 * the caller's initial, branded uppercase label, large green Accept
 * and red Decline buttons.
 *
 * Lifecycle:
 *   1. RajloMessagingService.onMessageReceived → addNewIncomingCall
 *   2. onCreateIncomingConnection creates a RajloCallConnection in
 *      RINGING state
 *   3. Telecom calls onShowIncomingCallUi which starts this Activity
 *   4. We render the UI, ring + vibrate, and start a 30s no-answer
 *      auto-decline timer
 *   5. Accept → conn.acceptFromUi() + finish
 *      Decline / timeout → conn.declineFromUi() + finish
 */
public class IncomingCallActivity extends Activity {

    private static final String TAG = "IncomingCallActivity";

    /** Extras keys — set by RajloCallConnection.onShowIncomingCallUi. */
    public static final String EXTRA_CALL_ID = "callId";
    public static final String EXTRA_CALLER_NAME = "callerName";

    /** Auto-decline after this many ms with no user response. Mirrors
     *  the in-app ringer + server-side stale-call expiry. */
    private static final long AUTO_DECLINE_MS = 30_000;

    private static final int COLOR_BG = Color.parseColor("#0E0E0E");
    private static final int COLOR_RED = Color.parseColor("#F10100");
    private static final int COLOR_GREEN = Color.parseColor("#10B981");
    private static final int COLOR_FG_MUTED = Color.parseColor("#B3FFFFFF");

    private Ringtone ringtone;
    private Vibrator vibrator;
    private String callId;
    private Handler timeoutHandler;
    private final Runnable autoDeclineTask = this::onAutoDecline;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show over the lockscreen + wake the screen. Without these
        // flags the Activity opens behind the keyguard and the user
        // sees nothing until they manually unlock.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km =
                (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        Intent intent = getIntent();
        callId = intent.getStringExtra(EXTRA_CALL_ID);
        String callerName = intent.getStringExtra(EXTRA_CALLER_NAME);
        if (TextUtils.isEmpty(callerName)) callerName = "Caller";

        setContentView(buildUi(callerName));
        startRingerLoop();
        scheduleAutoDecline();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        callId = intent.getStringExtra(EXTRA_CALL_ID);
        String callerName = intent.getStringExtra(EXTRA_CALLER_NAME);
        if (TextUtils.isEmpty(callerName)) callerName = "Caller";
        setContentView(buildUi(callerName));
        // Restart the timeout window — this is effectively a fresh call.
        cancelAutoDecline();
        scheduleAutoDecline();
    }

    /* ─────────────────── UI ─────────────────── */

    private View buildUi(String callerName) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_BG);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        // Top spacer pushes the avatar block down to vertical center-ish.
        View topSpacer = new View(this);
        LinearLayout.LayoutParams topSpLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1.2f
        );
        topSpacer.setLayoutParams(topSpLp);
        root.addView(topSpacer);

        // "INCOMING RAJLO CALL" pill
        TextView label = new TextView(this);
        label.setText("INCOMING RAJLO CALL");
        label.setTextColor(COLOR_FG_MUTED);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        label.setLetterSpacing(0.3f);
        label.setTypeface(label.getTypeface(), Typeface.BOLD);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelLp.bottomMargin = dp(24);
        label.setLayoutParams(labelLp);
        root.addView(label);

        // Avatar with pulsing red rings
        FrameLayout avatarHolder = new FrameLayout(this);
        int avatarSize = dp(176);
        LinearLayout.LayoutParams avatarLp = new LinearLayout.LayoutParams(
            avatarSize, avatarSize
        );
        avatarHolder.setLayoutParams(avatarLp);

        // Two pulsing rings — staggered timing for the WhatsApp-style
        // "calling…" pulse.
        addPulseRing(avatarHolder, avatarSize, 0L);
        addPulseRing(avatarHolder, avatarSize, 600L);

        // Solid red avatar circle with the caller's initial in white
        View avatar = new View(this);
        GradientDrawable avatarBg = new GradientDrawable();
        avatarBg.setShape(GradientDrawable.OVAL);
        avatarBg.setColor(COLOR_RED);
        avatar.setBackground(avatarBg);
        int innerSize = dp(128);
        FrameLayout.LayoutParams avatarInnerLp = new FrameLayout.LayoutParams(
            innerSize, innerSize
        );
        avatarInnerLp.gravity = Gravity.CENTER;
        avatarHolder.addView(avatar, avatarInnerLp);

        // Initial letter overlay
        TextView initial = new TextView(this);
        initial.setText(String.valueOf(
            Character.toUpperCase(callerName.charAt(0))
        ));
        initial.setTextColor(Color.WHITE);
        initial.setTextSize(TypedValue.COMPLEX_UNIT_SP, 52f);
        initial.setTypeface(initial.getTypeface(), Typeface.BOLD);
        initial.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams initialLp = new FrameLayout.LayoutParams(
            innerSize, innerSize
        );
        initialLp.gravity = Gravity.CENTER;
        avatarHolder.addView(initial, initialLp);

        root.addView(avatarHolder);

        // Caller name
        TextView nameView = new TextView(this);
        nameView.setText(callerName);
        nameView.setTextColor(Color.WHITE);
        nameView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f);
        nameView.setTypeface(nameView.getTypeface(), Typeface.BOLD);
        nameView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        nameLp.topMargin = dp(28);
        nameLp.leftMargin = dp(32);
        nameLp.rightMargin = dp(32);
        nameView.setLayoutParams(nameLp);
        root.addView(nameView);

        // Subtitle
        TextView sub = new TextView(this);
        sub.setText("Rajlo voice call");
        sub.setTextColor(COLOR_FG_MUTED);
        sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subLp.topMargin = dp(6);
        sub.setLayoutParams(subLp);
        root.addView(sub);

        // Spacer between avatar block and action row
        View midSpacer = new View(this);
        LinearLayout.LayoutParams midSpLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        midSpacer.setLayoutParams(midSpLp);
        root.addView(midSpacer);

        // Action row — Decline (left), Accept (right)
        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams btnRowLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        btnRowLp.bottomMargin = dp(48);
        buttons.setLayoutParams(btnRowLp);

        buttons.addView(makeActionButton("Decline", COLOR_RED, true, this::onDecline));
        // Spacer between buttons
        View spacer = new View(this);
        LinearLayout.LayoutParams spacerLp = new LinearLayout.LayoutParams(
            dp(80),
            1
        );
        spacer.setLayoutParams(spacerLp);
        buttons.addView(spacer);
        buttons.addView(makeActionButton("Accept", COLOR_GREEN, false, this::onAccept));

        root.addView(buttons);
        return root;
    }

    /** A round red/green button with the phone icon drawn inside.
     *  declined=true → red with the "hung up" icon (rotated phone).
     *  declined=false → green with the regular phone receiver icon. */
    private View makeActionButton(
        String label,
        int color,
        boolean declined,
        Runnable onClick
    ) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);

        FrameLayout circle = new FrameLayout(this);
        int size = dp(72);
        LinearLayout.LayoutParams circleLp = new LinearLayout.LayoutParams(size, size);
        circle.setLayoutParams(circleLp);

        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(color);
        circle.setBackground(bg);
        circle.setElevation(dp(8));

        PhoneIconView icon = new PhoneIconView(this, declined);
        FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(
            dp(32), dp(32)
        );
        iconLp.gravity = Gravity.CENTER;
        circle.addView(icon, iconLp);

        circle.setOnClickListener(v -> onClick.run());

        TextView caption = new TextView(this);
        caption.setText(label);
        caption.setTextColor(COLOR_FG_MUTED);
        caption.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        caption.setTypeface(caption.getTypeface(), Typeface.BOLD);
        caption.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        capLp.topMargin = dp(10);
        caption.setLayoutParams(capLp);

        col.addView(circle);
        col.addView(caption);
        return col;
    }

    private void addPulseRing(FrameLayout host, int size, long delayMs) {
        View ring = new View(this);
        GradientDrawable ringBg = new GradientDrawable();
        ringBg.setShape(GradientDrawable.OVAL);
        ringBg.setColor(COLOR_RED);
        ring.setBackground(ringBg);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(size, size);
        lp.gravity = Gravity.CENTER;
        host.addView(ring, lp);
        ring.setAlpha(0.32f);

        ValueAnimator scale = ValueAnimator.ofFloat(0.7f, 1.4f);
        scale.setDuration(1400);
        scale.setRepeatCount(ValueAnimator.INFINITE);
        scale.setInterpolator(new LinearInterpolator());
        scale.addUpdateListener(a -> {
            float s = (float) a.getAnimatedValue();
            ring.setScaleX(s);
            ring.setScaleY(s);
        });

        ValueAnimator fade = ValueAnimator.ofFloat(0.32f, 0f);
        fade.setDuration(1400);
        fade.setRepeatCount(ValueAnimator.INFINITE);
        fade.setInterpolator(new LinearInterpolator());
        fade.addUpdateListener(a -> ring.setAlpha((float) a.getAnimatedValue()));

        ring.postDelayed(() -> {
            scale.start();
            fade.start();
        }, delayMs);
    }

    /** Simple phone icon drawn programmatically so we don't need a
     *  vector drawable resource. Accept = upright receiver, decline =
     *  receiver rotated 135° (universal "end call" icon). */
    private static class PhoneIconView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final boolean declined;

        PhoneIconView(Context ctx, boolean declined) {
            super(ctx);
            this.declined = declined;
            paint.setColor(Color.WHITE);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(8f);
            paint.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth();
            float h = getHeight();
            float cx = w / 2f;
            float cy = h / 2f;
            float r = Math.min(w, h) * 0.30f;

            if (declined) {
                canvas.rotate(135f, cx, cy);
            }

            // Stylized phone receiver — short horizontal handle with
            // earpiece + mouthpiece bumps. Drawn as a single curve.
            // For simplicity, draw two arcs joined by a line.
            canvas.drawLine(cx - r, cy + r * 0.6f, cx + r, cy - r * 0.6f, paint);
            canvas.drawCircle(cx - r, cy + r * 0.6f, r * 0.30f, paint);
            canvas.drawCircle(cx + r, cy - r * 0.6f, r * 0.30f, paint);
        }
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            getResources().getDisplayMetrics()
        );
    }

    /* ─────────────────── Action handlers ─────────────────── */

    private void onAccept() {
        stopRinger();
        cancelAutoDecline();
        RajloCallConnection conn =
            RajloConnectionService.findConnection(callId);
        if (conn != null) conn.acceptFromUi();
        // Bring the main app to the foreground so the WebView resumes
        // and the in-call sheet (with the running duration timer) is
        // visible to the user. The retain-mode "accepted" event the
        // Connection emitted will be picked up by the JS-side listener
        // once JS executes, which fetches LiveKit credentials via
        // /api/calls/[id]/accept and mounts the in-call sheet.
        launchMainApp();
        finish();
    }

    private void onDecline() {
        stopRinger();
        cancelAutoDecline();
        RajloCallConnection conn =
            RajloConnectionService.findConnection(callId);
        if (conn != null) conn.declineFromUi();
        // Tell the server NOW from native — without this the caller
        // (rider) keeps ringing until the JS-side listener picks up
        // the "declined" event, which can be many seconds if the
        // WebView is asleep. Fire-and-forget on a background thread;
        // see CallApi.postDecline.
        CallApi.postDecline(callId);
        finish();
    }

    /** Fired by the no-answer timer. Treat like a manual decline so the
     *  server marks the row as missed (the /api/calls/[id]/decline
     *  handler flips status appropriately) and the caller side stops
     *  ringing. */
    private void onAutoDecline() {
        Log.i(TAG, "auto-declining call after no-answer timeout: " + callId);
        onDecline();
    }

    /** Brings the main Capacitor app to the foreground. Reuses an
     *  existing task if MainActivity is still around (CLEAR_TOP),
     *  otherwise starts a fresh one. */
    private void launchMainApp() {
        try {
            Intent intent = new Intent(
                this,
                Class.forName("com.rajlodriversapp.MainActivity")
            );
            intent.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Failed to launch MainActivity", e);
        }
    }

    private void scheduleAutoDecline() {
        if (timeoutHandler == null) {
            timeoutHandler = new Handler(Looper.getMainLooper());
        }
        timeoutHandler.postDelayed(autoDeclineTask, AUTO_DECLINE_MS);
    }

    private void cancelAutoDecline() {
        if (timeoutHandler != null) {
            timeoutHandler.removeCallbacks(autoDeclineTask);
        }
    }

    /* ─────────────────── Ringer ─────────────────── */

    private void startRingerLoop() {
        try {
            Uri ringUri = RingtoneManager.getDefaultUri(
                RingtoneManager.TYPE_RINGTONE
            );
            ringtone = RingtoneManager.getRingtone(this, ringUri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                );
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    ringtone.setLooping(true);
                }
                ringtone.play();
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to start ringtone", e);
        }
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = { 0, 1000, 1000 };
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to start vibration", e);
        }
    }

    private void stopRinger() {
        try {
            if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        } catch (Exception ignored) { }
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) { }
    }

    @Override
    protected void onDestroy() {
        stopRinger();
        cancelAutoDecline();
        super.onDestroy();
    }
}
