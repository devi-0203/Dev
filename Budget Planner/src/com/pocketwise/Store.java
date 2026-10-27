package com.pocketwise;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Keeps everything in memory and saves it to one JSON file after every change.
 * The file is written to a temporary name first and then swapped in, so a crash
 * mid-write can't corrupt the saved data.
 */
public final class Store {
    final TreeMap<String, MonthRecord> months = new TreeMap<>();   // oldest first
    final Map<Long, Expense> expenses = new LinkedHashMap<>();
    long nextId = 1;

    private final Path file;

    public Store(Path file) {
        this.file = file;
        load();
    }

    @SuppressWarnings("unchecked")
    private void load() {
        if (!Files.exists(file)) return;
        try {
            Map<String, Object> root = (Map<String, Object>) Json.parse(Files.readString(file, StandardCharsets.UTF_8));
            nextId = ((BigDecimal) root.get("nextId")).longValue();
            for (Object o : (List<Object>) root.get("months")) {
                Map<String, Object> m = (Map<String, Object>) o;
                MonthRecord r = new MonthRecord((String) m.get("yearMonth"));
                r.salary = (BigDecimal) m.get("salary");
                r.budget = (BigDecimal) m.get("budget");
                r.alert90Sent = Boolean.TRUE.equals(m.get("alert90Sent"));
                r.alert100Sent = Boolean.TRUE.equals(m.get("alert100Sent"));
                months.put(r.yearMonth, r);
            }
            for (Object o : (List<Object>) root.get("expenses")) {
                Map<String, Object> e = (Map<String, Object>) o;
                long id = ((BigDecimal) e.get("id")).longValue();
                expenses.put(id, new Expense(id, (String) e.get("yearMonth"), (BigDecimal) e.get("amount"),
                        (String) e.get("category"), (String) e.get("note"), LocalDate.parse((String) e.get("date"))));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + file, e);
        } catch (RuntimeException e) {
            throw new IllegalStateException("The data file " + file + " is damaged. Move it aside to start fresh.", e);
        }
    }

    public void save() {
        List<Object> monthList = new ArrayList<>();
        for (MonthRecord r : months.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("yearMonth", r.yearMonth);
            m.put("salary", r.salary);
            m.put("budget", r.budget);
            m.put("alert90Sent", r.alert90Sent);
            m.put("alert100Sent", r.alert100Sent);
            monthList.add(m);
        }
        List<Object> expenseList = new ArrayList<>();
        for (Expense x : expenses.values()) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("id", x.id);
            e.put("yearMonth", x.yearMonth);
            e.put("amount", x.amount);
            e.put("category", x.category);
            e.put("note", x.note);
            e.put("date", x.date);
            expenseList.add(e);
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("nextId", nextId);
        root.put("months", monthList);
        root.put("expenses", expenseList);

        try {
            Path parent = file.toAbsolutePath().getParent();
            Files.createDirectories(parent);
            Path temp = parent.resolve(file.getFileName() + ".tmp");
            Files.writeString(temp, Json.stringify(root), StandardCharsets.UTF_8);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save " + file, e);
        }
    }
}
