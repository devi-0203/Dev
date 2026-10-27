package com.pocketwise;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * All the budget rules: totals, savings, safe-to-spend and the 90% / 100% alerts.
 * Every public method is synchronized because the web server handles requests on several threads.
 */
public final class BudgetService {

    private static final BigDecimal WARNING_RATIO = new BigDecimal("0.90");
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final Set<String> CATEGORIES =
            Set.of("Food", "Transport", "Rent", "Books", "Fun", "Shopping", "Health", "Other");

    private final Store store;

    public BudgetService(Store store) {
        this.store = store;
    }

    // ---------------------------------------------------------------- months

    /** Every month, newest first. This is the history list. */
    public synchronized List<Map<String, Object>> listMonths() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (MonthRecord m : store.months.descendingMap().values()) {
            result.add(summarize(m, spentOf(m.yearMonth), List.of()));
        }
        return result;
    }

    public synchronized Map<String, Object> getMonth(String yearMonth) {
        MonthRecord m = findMonth(parseYearMonth(yearMonth));
        return summarize(m, spentOf(m.yearMonth), categoriesOf(m.yearMonth));
    }

    /** Creates the month, or updates its salary and budget. */
    public synchronized Map<String, Object> saveMonth(String yearMonth, Object body) {
        YearMonth ym = parseYearMonth(yearMonth);
        Map<String, Object> b = asObject(body);
        BigDecimal salary = readMoney(b, "salary", "Enter your salary", "Salary can't be negative", true);
        BigDecimal budget = readMoney(b, "budget", "Enter your monthly budget", "Budget must be more than zero", false);

        MonthRecord m = store.months.get(ym.toString());
        if (m == null) {
            m = new MonthRecord(ym.toString());
            store.months.put(m.yearMonth, m);
        }
        m.salary = salary;
        m.budget = budget;

        // A lower budget can push an existing month over a threshold, so re-check.
        BigDecimal spent = spentOf(m.yearMonth);
        String alert = evaluateAlert(m, spent);
        store.save();
        return result(summarize(m, spent, categoriesOf(m.yearMonth)), null, alert);
    }

    // -------------------------------------------------------------- expenses

    public synchronized List<Map<String, Object>> listExpenses(String yearMonth) {
        MonthRecord m = findMonth(parseYearMonth(yearMonth));
        return store.expenses.values().stream()
                .filter(e -> e.yearMonth.equals(m.yearMonth))
                .sorted(Comparator.comparing((Expense e) -> e.date).thenComparingLong(e -> e.id).reversed())
                .map(BudgetService::toMap)
                .toList();
    }

    public synchronized Map<String, Object> addExpense(String yearMonth, Object body) {
        MonthRecord m = findMonth(parseYearMonth(yearMonth));
        Expense e = new Expense(store.nextId, m.yearMonth, BigDecimal.ONE, "Other", null, LocalDate.now());
        // Validate before touching the store, so a bad request changes nothing.
        Expense checked = readExpense(asObject(body), m, e);
        store.nextId++;
        store.expenses.put(checked.id, checked);
        return afterChange(m, checked);
    }

    public synchronized Map<String, Object> updateExpense(long id, Object body) {
        Expense e = findExpense(id);
        MonthRecord m = store.months.get(e.yearMonth);
        Expense checked = readExpense(asObject(body), m, e);
        e.amount = checked.amount;
        e.category = checked.category;
        e.note = checked.note;
        e.date = checked.date;
        return afterChange(m, e);
    }

    public synchronized Map<String, Object> deleteExpense(long id) {
        Expense e = findExpense(id);
        MonthRecord m = store.months.get(e.yearMonth);
        store.expenses.remove(id);
        return afterChange(m, null);
    }

    // ---------------------------------------------------------------- export

    public synchronized String exportCsv() {
        StringBuilder csv = new StringBuilder("Month,Date,Category,Amount,Note\n");
        store.expenses.values().stream()
                .sorted(Comparator.comparing((Expense e) -> e.date).thenComparingLong(e -> e.id))
                .forEach(e -> csv.append(e.yearMonth).append(',')
                        .append(e.date).append(',')
                        .append(csvCell(e.category)).append(',')
                        .append(e.amount.toPlainString()).append(',')
                        .append(csvCell(e.note)).append('\n'));
        return csv.toString();
    }

    // --------------------------------------------------------------- helpers

    private Map<String, Object> afterChange(MonthRecord m, Expense expense) {
        BigDecimal spent = spentOf(m.yearMonth);
        String crossed = evaluateAlert(m, spent);
        // Every entry that is added or edited while spending is at 90% or more raises an alert.
        // Deleting an entry never does.
        String alert = (expense != null) ? currentLevel(m, spent) : crossed;
        store.save();
        return result(summarize(m, spent, categoriesOf(m.yearMonth)), expense == null ? null : toMap(expense), alert);
    }

    /** "WARNING" at 90% or more of the budget, "EXCEEDED" at 100% or more, otherwise null. */
    private String currentLevel(MonthRecord m, BigDecimal spent) {
        if (spent.compareTo(m.budget) >= 0) return "EXCEEDED";
        if (spent.compareTo(m.budget.multiply(WARNING_RATIO)) >= 0) return "WARNING";
        return null;
    }

    /**
     * Decides whether spending has just crossed 90% or 100% (used when the budget changes or an
     * expense is deleted; entries added or edited alert every time, see afterChange). The flags on the month remember what
     * has already been sent, so each alert fires once. They reset if spending drops back below a
     * threshold (for example after deleting an expense), so the alert can fire again.
     *
     * @return "WARNING", "EXCEEDED", or null when nothing new has been crossed
     */
    private String evaluateAlert(MonthRecord m, BigDecimal spent) {
        boolean over100 = spent.compareTo(m.budget) >= 0;
        boolean over90 = spent.compareTo(m.budget.multiply(WARNING_RATIO)) >= 0;

        String fired = null;
        if (over100 && !m.alert100Sent) {
            fired = "EXCEEDED";
        } else if (over90 && !over100 && !m.alert90Sent) {
            fired = "WARNING";
        }
        m.alert100Sent = over100;
        m.alert90Sent = over90;
        return fired;
    }

    private Map<String, Object> summarize(MonthRecord m, BigDecimal spent, List<Map<String, Object>> categories) {
        BigDecimal remaining = m.budget.subtract(spent);
        BigDecimal percentUsed = spent.multiply(HUNDRED).divide(m.budget, 1, RoundingMode.HALF_UP);

        YearMonth ym = YearMonth.parse(m.yearMonth);
        YearMonth now = YearMonth.now();
        int daysInMonth = ym.lengthOfMonth();
        int daysLeft;
        if (ym.equals(now)) {
            daysLeft = daysInMonth - LocalDate.now().getDayOfMonth() + 1;   // today still counts
        } else if (ym.isAfter(now)) {
            daysLeft = daysInMonth;
        } else {
            daysLeft = 0;
        }
        BigDecimal safePerDay = (daysLeft > 0 && remaining.signum() > 0)
                ? remaining.divide(BigDecimal.valueOf(daysLeft), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2);

        String level = "NONE";
        if (spent.compareTo(m.budget) >= 0) level = "EXCEEDED";
        else if (spent.compareTo(m.budget.multiply(WARNING_RATIO)) >= 0) level = "WARNING";

        Map<String, Object> s = new LinkedHashMap<>();
        s.put("yearMonth", m.yearMonth);
        s.put("salary", m.salary);
        s.put("budget", m.budget);
        s.put("spent", spent);
        s.put("remaining", remaining);
        s.put("percentUsed", percentUsed);
        s.put("plannedSavings", m.salary.subtract(m.budget));   // salary - budget
        s.put("actualSavings", m.salary.subtract(spent));       // salary - spent
        s.put("daysInMonth", daysInMonth);
        s.put("daysLeft", daysLeft);
        s.put("safeToSpendPerDay", safePerDay);
        s.put("alertLevel", level);
        s.put("categories", categories);
        return s;
    }

    private BigDecimal spentOf(String yearMonth) {
        BigDecimal sum = BigDecimal.ZERO.setScale(2);
        for (Expense e : store.expenses.values()) {
            if (e.yearMonth.equals(yearMonth)) sum = sum.add(e.amount);
        }
        return sum;
    }

    /** Category totals for a month, biggest first. */
    private List<Map<String, Object>> categoriesOf(String yearMonth) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (Expense e : store.expenses.values()) {
            if (e.yearMonth.equals(yearMonth)) totals.merge(e.category, e.amount, BigDecimal::add);
        }
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .map(en -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("category", en.getKey());
                    row.put("total", en.getValue());
                    return row;
                })
                .toList();
    }

    private static Map<String, Object> result(Map<String, Object> summary, Map<String, Object> expense, String alert) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("summary", summary);
        r.put("expense", expense);
        r.put("alert", alert);
        return r;
    }

    private static Map<String, Object> toMap(Expense e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id);
        m.put("amount", e.amount);
        m.put("category", e.category);
        m.put("note", e.note);
        m.put("date", e.date);
        return m;
    }

    // ---------------------------------------------------------- validation

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asObject(Object body) {
        if (body instanceof Map<?, ?> map) return (Map<String, Object>) map;
        throw ApiException.badRequest("That request couldn't be read. Check the values and try again");
    }

    /** Builds a validated copy of {@code base} with the request's values applied. */
    private Expense readExpense(Map<String, Object> b, MonthRecord month, Expense base) {
        BigDecimal amount = readMoney(b, "amount", "Enter an amount", "Amount must be more than zero", false);

        Object cat = b.get("category");
        if (!(cat instanceof String category) || category.isBlank()) throw ApiException.badRequest("Pick a category");
        if (!CATEGORIES.contains(category)) throw ApiException.badRequest("Pick one of the listed categories");

        String note = null;
        if (b.get("note") instanceof String n && !n.trim().isEmpty()) {
            note = n.trim();
            if (note.length() > 120) throw ApiException.badRequest("Note can be at most 120 characters");
        }

        LocalDate date;
        try {
            date = LocalDate.parse(String.valueOf(b.get("date")));
        } catch (DateTimeParseException ex) {
            throw ApiException.badRequest("Pick a date");
        }
        if (!YearMonth.from(date).toString().equals(month.yearMonth)) {
            throw ApiException.badRequest("The date must fall inside " + month.yearMonth);
        }
        return new Expense(base.id, base.yearMonth, amount, category, note, date);
    }

    /** Reads a money value: at most 2 decimals, at most 10 digits before the point. */
    private static BigDecimal readMoney(Map<String, Object> b, String key, String missing, String tooLow, boolean zeroAllowed) {
        Object v = b.get(key);
        BigDecimal d;
        if (v instanceof BigDecimal n) {
            d = n;
        } else if (v instanceof String s && !s.isBlank()) {
            try {
                d = new BigDecimal(s.trim());
            } catch (NumberFormatException ex) {
                throw ApiException.badRequest(missing);
            }
        } else {
            throw ApiException.badRequest(missing);
        }
        if (d.signum() < 0 || (!zeroAllowed && d.signum() == 0)) throw ApiException.badRequest(tooLow);
        if (d.stripTrailingZeros().scale() > 2) throw ApiException.badRequest("Use at most 2 decimal places");
        if (d.precision() - d.scale() > 10) throw ApiException.badRequest("That number is too large");
        return d.setScale(2, RoundingMode.UNNECESSARY);
    }

    private YearMonth parseYearMonth(String raw) {
        try {
            return YearMonth.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ApiException.badRequest("Month must look like 2026-10");
        }
    }

    private MonthRecord findMonth(YearMonth ym) {
        MonthRecord m = store.months.get(ym.toString());
        if (m == null) throw ApiException.notFound("That month hasn't been set up yet");
        return m;
    }

    private Expense findExpense(long id) {
        Expense e = store.expenses.get(id);
        if (e == null) throw ApiException.notFound("That expense no longer exists");
        return e;
    }

    /** Quotes a CSV cell and neutralises spreadsheet formulas such as =SUM(...). */
    private static String csvCell(String value) {
        if (value == null) return "";
        String safe = value;
        if (!safe.isEmpty() && "=+-@".indexOf(safe.charAt(0)) >= 0) safe = "'" + safe;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
}