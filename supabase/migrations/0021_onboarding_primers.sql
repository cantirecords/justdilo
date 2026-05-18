-- Onboarding primer cards: mic permission, push notifications, PWA install
insert into public.feature_flags (key, description, rollout) values
  ('mic_primer',     'Card prompting mic permission with context before browser ask',         'admin'),
  ('push_primer',    'Card prompting push notification subscription after first task',        'admin'),
  ('install_primer', 'Card prompting PWA install when beforeinstallprompt fires',             'admin')
on conflict (key) do nothing;

update public.feature_flags
   set category   = 'Activation',
       how_to_use  = 'Appears above the WelcomeCard when the user has never granted/denied mic permission. Explains "we only listen when you tap" before triggering the browser prompt. Click "Enable microphone" calls getUserMedia and immediately stops the track. Dismissed in localStorage if user picks "Maybe later".',
       impact      = 'Voice-first apps die when the mic permission gets denied. Priming with context lifts grant rate dramatically. Test on a fresh device or revoke mic permission in browser settings to preview.',
       location    = 'Dashboard sidebar above WelcomeCard (MicPrimer)'
 where key = 'mic_primer';

update public.feature_flags
   set category   = 'Activation',
       how_to_use  = 'Appears below the mic when user has at least 1 task AND is not subscribed to push (or, in Electron, has not granted Notification permission). Click "Enable reminders" dispatches a custom event that triggers the existing PushNotificationButton subscribe flow. Dismissed in localStorage if user picks "Not now".',
       impact      = 'Daily reminders are the retention loop. Users who subscribe come back more — but they won''t click the small bell icon unless prompted. This card converts active users into reminded users.',
       location    = 'Dashboard sidebar below WelcomeCard (PushPrimer)'
 where key = 'push_primer';

update public.feature_flags
   set category   = 'Activation',
       how_to_use  = 'Captures the browser''s beforeinstallprompt event and shows a card offering to install JustDilo as a PWA. Auto-hides if the user is already in standalone mode, in Electron, or after appinstalled fires. Click "Install" calls the saved prompt; "Maybe later" persists dismiss in localStorage.',
       impact      = 'PWA-installed users have ~3x higher retention than browser-tab users (industry standard). Most users never know they can install — this surfaces the option at the right moment.',
       location    = 'Dashboard sidebar bottom of primer stack (InstallPrimer)'
 where key = 'install_primer';
