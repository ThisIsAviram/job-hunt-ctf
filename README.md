# BU Job Lab · ציד משרות CTF

לוח משרות דמה לסדנת שיח אסטרטגי בניצנים (בנתיבי אודי).
30 מודעות אמיתיות, מנוסחות מחדש ומקוצרות: 12 מ-2019–2021 (Hacker News "Who is hiring") ו-18 מ-2026 (Secret Tel Aviv Jobs). התאריכים מוסתרים, ושמונה אתגרים בודקים קריאה של הקשר.

- מצב מנחה: כפתור "מצב מנחה" או `?reveal` בכתובת. מציג את השנים ואת הקישורים למקור.
- הניקוד נשמר בדפדפן של כל צוות. "איפוס" מנקה.

## מולטיפלייר (אופציונלי)
1. פרויקט Supabase חדש → SQL Editor → להריץ את `supabase/schema.sql`.
2. Auth → Providers: להפעיל **Anonymous sign-ins** ואת **GitHub** (OAuth App ב-GitHub, callback מה-Supabase).
3. Auth → URL Configuration: להוסיף את כתובת ה-Pages ל-Redirect URLs.
4. למלא `config.js` (URL + anon key).
- שחקנים: `/?code=051126BU` · לידרבורד: `/leaderboard.html?code=…` · ניהול: `/admin.html` (כניסה עם GitHub).

## בדיקות
- `tests/schema.test.mjs`: מריץ את `supabase/schema.sql` על PGlite ובודק הרשאות, הצטרפות, דיווח ניקוד ולידרבורד (29 בדיקות, כולל מפתח מצגת).
- `tests/e2e-multiplayer.mjs`: Playwright מקצה לקצה עם Supabase מדומה שמגובה ב-PGlite: מנחה פותח אירוע, שני שחקנים מצטרפים, START, ניקוד מלא וחלקי, לידרבורד חי (14 בדיקות).

## הפעלה מתוך המצגת (מפתח מצגת)
המצגת (HTML) יכולה לפתוח אירוע, ללחוץ START, להאריך ולסגור, בלי התחברות GitHub:
1. `admin.html` → "מפתח מצגת" → יצירת מפתח חדש (נשמר בשרת רק כ-hash).
2. במצגת: מקש K → הדבקה. המצגת קוראת ל-`host_open_event` / `host_set_status`, והלידרבורד נקרא מ-`leaderboard`.
3. `tests/pgrest-standin.mjs`: שרת PostgREST מדומה על PGlite לבדיקות מקומיות.

## המצגת הנעולה (`/deck/`)
- התוכן לא נמצא ב-repo. הוא יושב ב-Supabase Storage, בתיקייה פרטית `deck`, וההרשאה בנויה על זהות ה-GitHub של המנהל (`supabase/deck-storage.sql`).
- `deck/index.html`: התחברות GitHub → הורדת `deck.html` מהתיקייה הפרטית → הצגה. מי שאינו מורשה לא מקבל כלום.
- העלאת גרסה חדשה: `/deck/?upload` → בחירת הקובץ.
