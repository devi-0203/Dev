# Pocketwise: monthly budget tracker for students

Plain Java (JDK only: no Spring, no Maven, no libraries) + HTML/CSS/JavaScript.

## Run it

Install a **JDK 17 or newer** (check with `javac -version`), then from this folder:

- Mac / Linux: `./run.sh`
- Windows: double-click `run.bat`
- Or by hand:
  ```
  javac -d out src/com/pocketwise/*.java
  java -cp out com.pocketwise.Main
  ```

Open http://localhost:8080. Your data is saved in `data/pocketwise.json`
(delete that file to start fresh).

Optional environment variables: `PORT` (default 8080), `HOST` (default 127.0.0.1; set to
0.0.0.0 to open the app to other devices on your Wi-Fi, for example to try it on your phone,
but there is no login yet, so only do that on a network you trust).

## Your 6 requirements

| # | Requirement | Where |
|---|---|---|
| 1 | Track every month, keep history | `Store` (saved to JSON), `GET /api/months`, History tab |
| 2 | Get current salary | Setup screen / Settings -> `PUT /api/months/{yyyy-MM}` |
| 3 | Get monthly budget | same request as salary |
| 4 | Add expenses, sum them, deduct from budget | `POST /api/months/{ym}/expenses`, `BudgetService.summarize` |
| 5 | Alert at 90% | `BudgetService.evaluateAlert` (fires once; 100% alert too) |
| 6 | Display savings | Home: planned (salary - budget) and actual (salary - spent) |

## Code map

```
src/com/pocketwise/
  Main.java           starts the JDK's built-in HTTP server
  ApiHandler.java     routes /api/... and returns JSON
  StaticHandler.java  serves the website from web/ (blocks ../ tricks)
  BudgetService.java  ALL the budget rules and validation
  Store.java          in-memory data + atomic save to data/pocketwise.json
  Json.java           small JSON reader/writer
  MonthRecord.java, Expense.java, ApiException.java
web/                  index.html, css/styles.css, js/*.js (the app you see)
```

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | /api/months | all months, newest first |
| GET | /api/months/{ym} | one month with category totals |
| PUT | /api/months/{ym} | create/update salary + budget |
| GET | /api/months/{ym}/expenses | expenses of a month |
| POST | /api/months/{ym}/expenses | add expense |
| PUT | /api/expenses/{id} | edit expense |
| DELETE | /api/expenses/{id} | delete expense |
| GET | /api/export.csv | download everything |

## Turning it into an APK later

The Java server can't run inside a phone app. The APK will be the `web/` folder wrapped with
Capacitor, talking to a hosted copy of this server:

1. Host the Java app (Render, Railway, a small VPS) and add user accounts so each student sees
   only their own data.
2. Set `window.API_BASE` in `web/js/config.js` to the hosted URL.
3. `npx cap add android`, then build in Android Studio.
4. Replace the browser Notification call in `web/js/util.js` with Capacitor Local Notifications.
